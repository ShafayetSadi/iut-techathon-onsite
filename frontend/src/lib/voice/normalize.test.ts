/**
 * Regression tests for what the microphone actually delivers.
 *
 * Every case here was observed in a live session against ElevenLabs Scribe, or
 * follows directly from how Scribe transcribes. The matcher was correct
 * throughout — the transcripts reaching it were not.
 */

import { describe, expect, it } from 'vitest';
import { matchTranscript } from './matcher';
import { normalize } from './normalize';

describe('audio-event tags', () => {
  // Scribe tags non-speech audio by default. The tags are now suppressed at the
  // provider (tag_audio_events=false), but the transcript must survive them
  // regardless: `normalize` used to strip the parentheses and keep the words.
  it('drops a tag rather than scoring its words as speech', () => {
    expect(normalize('(dishes clanking) move up')).toBe('move up');
    expect(matchTranscript('(dishes clanking) move up').status).toBe('matched');
  });

  it('leaves nothing behind when the clip was only room noise', () => {
    const noise = '(microphone shuffles) (people talking in the background)';
    expect(normalize(noise)).toBe('');

    const resolution = matchTranscript(noise);
    expect(resolution.status).toBe('unmatched');
    // The old behaviour: "No command matched 'microphone shuffles people talking
    // in background'" — a hallucinated utterance the operator never made.
    expect(resolution.normalized).toBe('');
  });

  it('handles bracket tags and back-to-back tags', () => {
    expect(normalize('[laughter] move up [cough]')).toBe('move up');
    expect(normalize('(cough)(cough) home')).toBe('home');
  });
});

describe('"forearm" survives being heard as "four arm"', () => {
  it('repairs the phrase before number-word expansion consumes "four"', () => {
    expect(normalize('rotate four arm 30 degrees')).toBe('rotate forearm 30 degrees');
    expect(normalize('rotate for arm 30 degrees')).toBe('rotate forearm 30 degrees');
  });

  it('resolves to the same command as the correctly-heard phrase', () => {
    const misheard = matchTranscript('rotate four arm 30 degrees');
    const heard = matchTranscript('rotate forearm 30 degrees');

    expect(misheard.status).toBe('matched');
    expect(misheard.template).toBe(heard.template);
    expect(misheard.command).toEqual(heard.command);
  });

  it('does not disturb an ordinary "four"', () => {
    expect(normalize('press key four')).toBe('press key 4');
  });
});

describe('non-English transcripts', () => {
  // Scribe auto-detected Hindi from an English "hello" until `language_code=eng`
  // was pinned. `normalize` keeps only [a-z0-9], so the transcript empties out.
  it('explains itself instead of claiming nothing was said', () => {
    const resolution = matchTranscript('हैलो हैलो हैलो।');

    expect(resolution.status).toBe('unmatched');
    expect(resolution.normalized).toBe('');
    expect(resolution.reason).toMatch(/English/);
  });

  it('still reports silence as silence', () => {
    expect(matchTranscript('   ').reason).toBe('Nothing was said.');
  });
});
