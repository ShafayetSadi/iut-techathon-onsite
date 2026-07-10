/**
 * normalize.ts — turn raw speech-to-text output into a canonical skeleton.
 *
 * The matcher never scores a raw utterance. It scores a *skeleton*: lowercased,
 * de-punctuated, synonym-collapsed, with every number replaced by `{n}`.
 *
 * Pulling the numbers out before scoring is what makes the whole approach work.
 * "rotate base 30 degrees" and "rotate base 45 degrees" are ~92% similar to each
 * other as raw strings, so a flat 90% threshold would happily match one to the
 * other's template and silently discard the argument. Once both collapse to
 * "rotate base {n} degrees" the number is data, not something to be matched.
 *
 * See docs/phase3-frontend-brief.md §2.
 */

/** Multi-word forms, replaced before tokenizing. */
const PHRASES: [RegExp, string][] = [
  // Speech-to-text renders "forearm" as "four arm" often enough that it must be
  // repaired here: this runs before `expandNumberWords`, which would otherwise
  // turn "four" into 4 and leave the matcher scoring "rotate {n} arm {n} degrees".
  [/\bfour arm\b/g, 'forearm'],
  [/\bfor arm\b/g, 'forearm'],
  [/\ba couple of\b/g, '2'],
  [/\ba couple\b/g, '2'],
  [/\ba few\b/g, '3'],
  [/\bemergency stop\b/g, 'stop'],
  [/\breturn home\b/g, 'home'],
  [/\bgo home\b/g, 'home'],
  [/\bgo to home\b/g, 'home'],
  [/\bcounter clockwise\b/g, 'left'],
  [/\bcounterclockwise\b/g, 'left'],
  [/\bclockwise\b/g, 'right'],
  // Common speech-to-text miss for the J6 label "tool roll".
  [/\bto roll\b/g, 'tool roll'],
];

/**
 * Words carrying no meaning for the grammar. Dropping them lifts the score of
 * conversational phrasings ("move the arm up please") toward the bare template.
 */
const FILLER = new Set([
  'the', 'a', 'an', 'please', 'now', 'robot', 'arm', 'can', 'you', 'could',
  'and', 'then', 'just', 'okay', 'ok', 'hey', 'lets', 'let', 'it',
  // "the tip" / "the end effector" name the thing that moves, not a joint.
  // Keep them out of the skeleton so "nudge the tip up" reduces to "move up".
  'tip', 'effector',
]);

/** One token in, one or more tokens out. */
const SYNONYMS: Record<string, string> = {
  // verbs
  go: 'move', jog: 'move', shift: 'move', nudge: 'move', translate: 'move', slide: 'move',
  raise: 'move up', lift: 'move up',
  lower: 'move down', drop: 'move down',
  turn: 'rotate', spin: 'rotate', swivel: 'rotate', twist: 'rotate',
  push: 'press', touch: 'press', tap: 'press', hit: 'press',
  halt: 'stop', abort: 'stop', freeze: 'stop',
  reset: 'home',
  centre: 'center',
  once: '1 times', twice: '2 times', thrice: '3 times',

  // directions
  forwards: 'forward', ahead: 'forward',
  backward: 'back', backwards: 'back',

  // joints
  pen: 'stylus',

  // units
  cm: 'centimeters', centimeter: 'centimeters', centimetre: 'centimeters', centimetres: 'centimeters',
  mm: 'millimeters', millimeter: 'millimeters', millimetre: 'millimeters', millimetres: 'millimeters',
  m: 'meters', meter: 'meters', metre: 'meters', metres: 'meters',
  degree: 'degrees', deg: 'degrees', degs: 'degrees',
  time: 'times',
};

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** "forty five" -> "45"; "thirty" -> "30"; "three" -> "3". */
function expandNumberWords(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token in TENS) {
      const next = tokens[i + 1];
      if (next && next in ONES && ONES[next] > 0 && ONES[next] < 10) {
        out.push(String(TENS[token] + ONES[next]));
        i += 1;
        continue;
      }
      out.push(String(TENS[token]));
      continue;
    }
    if (token in ONES) {
      out.push(String(ONES[token]));
      continue;
    }
    out.push(token);
  }
  return out;
}

/**
 * Lowercase, strip punctuation, expand phrases and synonyms, drop filler, and
 * turn number words into digits. Output is a space-joined token string.
 */
export function normalize(raw: string): string {
  let text = raw.toLowerCase();

  // Speech-to-text tags non-speech audio: "(dishes clanking)", "(laughter)".
  // Strip whole tags first — the punctuation pass below would otherwise dissolve
  // the brackets and leave the words behind, to be scored as if they were spoken.
  text = text.replace(/\([^()]*\)/g, ' ').replace(/\[[^[\]]*\]/g, ' ');

  // Hyphens join words we want split ("thirty-five", "counter-clockwise").
  text = text.replace(/[-_/]/g, ' ');
  // Keep digits, letters, and decimal points; everything else is a separator.
  text = text.replace(/[^a-z0-9.\s]/g, ' ');
  // A dot not between digits is sentence punctuation, not a decimal point.
  text = text.replace(/\.(?!\d)/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  for (const [pattern, replacement] of PHRASES) {
    text = text.replace(pattern, replacement);
  }

  let tokens = text.split(' ').filter(Boolean);
  tokens = tokens.flatMap((token) => (SYNONYMS[token] ?? token).split(' '));
  tokens = expandNumberWords(tokens);
  tokens = tokens.filter((token) => !FILLER.has(token));

  return tokens.join(' ');
}

export interface Skeleton {
  /** The utterance with every number replaced by the literal `{n}`. */
  skeleton: string;
  /** The numbers that were removed, in order of appearance. */
  params: number[];
}

/** Replace numbers with `{n}` placeholders, capturing them in order. */
export function skeletonize(normalized: string): Skeleton {
  const params: number[] = [];
  const skeleton = normalized.replace(/\d+(?:\.\d+)?/g, (match) => {
    params.push(Number.parseFloat(match));
    return '{n}';
  });
  return { skeleton, params };
}
