import { describe, expect, it } from 'vitest';
import { AMBIGUITY_MARGIN, MATCH_THRESHOLD, matchTranscript } from './matcher';
import { DEFAULT_STEP_M, TEMPLATES, type Template } from './grammar';
import { ratio } from './levenshtein';
import { normalize, skeletonize } from './normalize';

const DEG = Math.PI / 180;

function matched(raw: string) {
  const resolution = matchTranscript(raw);
  expect(resolution.status, `"${raw}" → ${resolution.reason ?? resolution.status}`).toBe('matched');
  return resolution;
}

describe('cartesian jogs', () => {
  it.each([
    ['move up', { x: 0, y: 0, z: DEFAULT_STEP_M }],
    ['move down', { x: 0, y: 0, z: -DEFAULT_STEP_M }],
    ['move left', { x: 0, y: DEFAULT_STEP_M, z: 0 }],
    ['move right', { x: 0, y: -DEFAULT_STEP_M, z: 0 }],
    ['move forward', { x: DEFAULT_STEP_M, y: 0, z: 0 }],
    ['move back', { x: -DEFAULT_STEP_M, y: 0, z: 0 }],
  ])('%s', (raw, delta) => {
    const { command } = matched(raw);
    expect(command).toEqual({ type: 'jog_cartesian', delta, frame: 'world' });
  });

  it('applies explicit distances and units', () => {
    expect(matched('move up 5 centimeters').command).toMatchObject({ delta: { z: 0.05 } });
    expect(matched('move up 50 millimeters').command).toMatchObject({ delta: { z: 0.05 } });
    expect(matched('move forward 1 meter').command).toMatchObject({ delta: { x: 1 } });
  });

  it('treats a bare number as centimeters', () => {
    expect(matched('move up 5').command).toMatchObject({ delta: { z: 0.05 } });
  });

  it('understands number words', () => {
    expect(matched('move up five centimeters').command).toMatchObject({ delta: { z: 0.05 } });
    expect(matched('move up twenty five centimeters').command).toMatchObject({ delta: { z: 0.25 } });
  });

  it('strips filler and resolves synonyms', () => {
    expect(matched('please raise the arm').command).toMatchObject({ delta: { z: DEFAULT_STEP_M } });
    expect(matched('nudge the tip up 2 centimeters').command).toMatchObject({ delta: { z: 0.02 } });
    expect(matched('lower it').command).toMatchObject({ delta: { z: -DEFAULT_STEP_M } });
  });
});

describe('joint rotations', () => {
  it('rotates a named joint', () => {
    expect(matched('rotate base 30 degrees').command).toEqual({
      type: 'jog_joint',
      joint: 0,
      delta: 30 * DEG,
    });
  });

  it('accepts number words and verb synonyms', () => {
    expect(matched('turn base thirty degrees').command).toEqual({
      type: 'jog_joint',
      joint: 0,
      delta: 30 * DEG,
    });
  });

  it('reads sign per joint, not globally', () => {
    // joint_1 yaws about +z: "left" is the positive direction.
    expect(matched('rotate base left 45 degrees').command).toMatchObject({ delta: 45 * DEG });
    expect(matched('rotate base right 45 degrees').command).toMatchObject({ delta: -45 * DEG });
    // joint_2 pitches about +y, which tips the arm forward and down:
    // "down" is positive, so "up" must be negative.
    expect(matched('rotate shoulder down 30 degrees').command).toMatchObject({ delta: 30 * DEG });
    expect(matched('rotate shoulder up 30 degrees').command).toMatchObject({ delta: -30 * DEG });
  });

  it('sets and centers joints', () => {
    expect(matched('set base to 45 degrees').command).toEqual({
      type: 'set_joint',
      joint: 0,
      value: 45 * DEG,
    });
    expect(matched('rotate shoulder to thirty degrees').command).toEqual({
      type: 'set_joint',
      joint: 1,
      value: 30 * DEG,
    });
    expect(matched('center elbow').command).toEqual({ type: 'set_joint', joint: 2, value: 0 });
  });

  it('accepts descriptive joint aliases', () => {
    expect(matched('rotate tool roll 30 degrees').command).toEqual({
      type: 'jog_joint',
      joint: 5,
      delta: 30 * DEG,
    });
    expect(matched('rotate to roll 30 degrees').command).toEqual({
      type: 'jog_joint',
      joint: 5,
      delta: 30 * DEG,
    });
    expect(matched('set wrist pitch to 15 degrees').command).toEqual({
      type: 'set_joint',
      joint: 4,
      value: 15 * DEG,
    });
  });

  it('accepts numbered joint names', () => {
    for (const [raw, joint] of [
      ['rotate j1 10 degrees', 0],
      ['rotate j2 20 degrees', 1],
      ['rotate j3 30 degrees', 2],
      ['rotate j4 40 degrees', 3],
      ['rotate j5 50 degrees', 4],
      ['rotate j6 30 degrees', 5],
      ['rotate joint 7 10 degrees', 6],
    ] as const) {
      expect(matched(raw).command).toMatchObject({ type: 'jog_joint', joint });
    }

    expect(matched('rotate j2 to 30 degrees').command).toEqual({
      type: 'set_joint',
      joint: 1,
      value: 30 * DEG,
    });
  });

  it('maps every spoken joint name to its canonical index', () => {
    const expected = [
      ['base', 0], ['shoulder', 1], ['elbow', 2], ['forearm', 3],
      ['wrist', 4], ['tool', 5], ['stylus', 6],
    ] as const;
    for (const [word, index] of expected) {
      expect(matched(`center ${word}`).command).toMatchObject({ joint: index });
    }
  });
});

describe('panel and system', () => {
  it('presses keys', () => {
    expect(matched('press key 3').command).toEqual({ type: 'touch_key', key: '3' });
    expect(matched('press 3').command).toEqual({ type: 'touch_key', key: '3' });
    expect(matched('press key three').command).toEqual({ type: 'touch_key', key: '3' });
    expect(matched('tap key 6').command).toEqual({ type: 'touch_key', key: '6' });
  });

  it('rejects keys that are not on the panel', () => {
    const resolution = matchTranscript('press key 9');
    expect(resolution.status).toBe('unmatched');
    expect(resolution.reason).toMatch(/1 to 6/);
  });

  it('homes', () => {
    expect(matched('home').command).toEqual({ type: 'home' });
    expect(matched('go home').command).toEqual({ type: 'home' });
    expect(matched('reset').command).toEqual({ type: 'home' });
  });
});

describe('stop bypasses the fuzzy threshold', () => {
  it.each(['stop', 'stahp', 'halt', 'abort', 'emergency stop', 'stop!'])('%s', (raw) => {
    const resolution = matchTranscript(raw);
    expect(resolution.status).toBe('matched');
    expect(resolution.command).toEqual({ type: 'stop' });
  });

  it('does not swallow ordinary commands', () => {
    expect(matched('move up').command).toMatchObject({ type: 'jog_cartesian' });
    expect(matched('set base to 30 degrees').command).toMatchObject({ type: 'set_joint' });
    expect(matched('center tool').command).toMatchObject({ type: 'set_joint' });
  });
});

describe('speech-to-text error tolerance', () => {
  it.each([
    ['rotat shoulder 30 degrees', { type: 'jog_joint', joint: 1 }],
    ['rotate sholder 30 degrees', { type: 'jog_joint', joint: 1 }],
    ['presss key 4', { type: 'touch_key', key: '4' }],
    ['move up 5 centimters', { type: 'jog_cartesian' }],
  ])('%s still resolves', (raw, shape) => {
    expect(matched(raw).command).toMatchObject(shape);
  });

  /**
   * A normalized edit-distance threshold buys `floor(length / 10)` typos. Short
   * skeletons therefore have NO error budget: one wrong character in "move up"
   * scores 0.857 and is rejected. That is the safe direction — an unmatched
   * command asks the operator to repeat, a mis-matched one moves the arm — and
   * it is precisely why `stop` is scored separately at a much looser threshold.
   */
  it('has no error budget for short commands, and fails closed', () => {
    expect(matchTranscript('move op').status).toBe('unmatched');
    expect(matchTranscript('hom').status).toBe('unmatched');
    // ...but the one command where that would matter is never fuzzy-gated.
    expect(matchTranscript('stahp').command).toEqual({ type: 'stop' });
  });
});

describe('refuses to guess', () => {
  it.each([
    'what is the weather',
    'nudge the tip a couple centimeters toward the panel',
    'do a barrel roll',
  ])('%s is unmatched', (raw) => {
    expect(matchTranscript(raw).status).toBe('unmatched');
  });

  it('reports ambiguity instead of picking a winner', () => {
    // No pair in the real grammar lands inside the margin (see the separation
    // test below), so inject two near-identical templates to exercise the rule.
    // An exact hit on the first scores 1.0; the second is one edit away at
    // 0.956 — inside AMBIGUITY_MARGIN, so the matcher must refuse to choose.
    const templates: Template[] = [
      { skeleton: 'rotate base {n} degrees', build: () => ({ type: 'home' }) },
      { skeleton: 'rotate vase {n} degrees', build: () => ({ type: 'stop' }) },
    ];
    const resolution = matchTranscript('rotate base 30 degrees', templates);
    expect(resolution.status).toBe('ambiguous');
    expect(resolution.alternatives).toHaveLength(2);
    expect(resolution.command).toBeUndefined();
  });
});

describe('template separation', () => {
  it('keeps every template pair outside the ambiguity margin', () => {
    const skeletons = TEMPLATES.map((t) => t.skeleton);
    expect(new Set(skeletons).size).toBe(skeletons.length); // no duplicates

    let worst = { a: '', b: '', score: 0 };
    for (let i = 0; i < skeletons.length; i += 1) {
      for (let j = i + 1; j < skeletons.length; j += 1) {
        const score = ratio(skeletons[i], skeletons[j]);
        if (score > worst.score) worst = { a: skeletons[i], b: skeletons[j], score };
      }
    }

    // The closest pair must be far enough apart that an exact utterance of one
    // (confidence 1.0) beats the other by more than AMBIGUITY_MARGIN.
    expect(worst.score, `closest pair: "${worst.a}" vs "${worst.b}"`).toBeLessThan(
      1 - AMBIGUITY_MARGIN,
    );
  });

  it('separates the joint names the plan flagged as tightest', () => {
    expect(ratio('rotate base {n} degrees', 'rotate wrist {n} degrees')).toBeLessThan(
      MATCH_THRESHOLD,
    );
    expect(ratio('move up', 'move down')).toBeLessThan(MATCH_THRESHOLD);
    expect(ratio('move left', 'move right')).toBeLessThan(MATCH_THRESHOLD);
  });
});

describe('the safety gate runs even though nothing executes', () => {
  it('passes a reachable joint target', () => {
    expect(matched('set base to 45 degrees').gate).toEqual({ ok: true });
  });

  it('flags a joint target beyond its URDF limit', () => {
    const resolution = matched('set base to 400 degrees');
    expect(resolution.gate?.ok).toBe(false);
    expect(resolution.gate?.reason).toMatch(/limit/i);
  });
});

describe('normalize / skeletonize', () => {
  it('pulls numbers out before matching', () => {
    expect(skeletonize(normalize('rotate base 30 degrees'))).toEqual({
      skeleton: 'rotate base {n} degrees',
      params: [30],
    });
    expect(skeletonize(normalize('rotate base 45 degrees')).skeleton).toBe(
      'rotate base {n} degrees',
    );
  });

  it('is why a flat similarity check would have been wrong', () => {
    // These two raw utterances are >90% similar but mean different things.
    expect(ratio('rotate base 30 degrees', 'rotate base 45 degrees')).toBeGreaterThan(
      MATCH_THRESHOLD,
    );
    // Skeletonized, the difference is data rather than something to match on.
    expect(skeletonize(normalize('rotate base 30 degrees')).params).toEqual([30]);
    expect(skeletonize(normalize('rotate base 45 degrees')).params).toEqual([45]);
  });
});
