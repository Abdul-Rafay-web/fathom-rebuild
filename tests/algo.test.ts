import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, mergeIntervals } from '../src/lib/algo/intervals';
import { Grounder } from '../src/lib/algo/align';
import { chunkUtterances } from '../src/lib/algo/chunk';
import { lastStartAtOrBefore } from '../src/lib/algo/bsearch';

test('mergeIntervals merges overlaps and respects gap', () => {
  const m = mergeIntervals([{ start_ms: 5, end_ms: 10 }, { start_ms: 0, end_ms: 6 }, { start_ms: 12, end_ms: 14 }]);
  assert.deepEqual(m, [{ start_ms: 0, end_ms: 10 }, { start_ms: 12, end_ms: 14 }]);
  assert.equal(mergeIntervals([{ start_ms: 0, end_ms: 10 }, { start_ms: 11, end_ms: 14 }], 2).length, 1);
});

test('computeStats: talk time is a union, crosstalk via sweep, interruptions counted', () => {
  const s = computeStats(
    [
      { start_ms: 0, end_ms: 10_000, speaker: 0 },
      { start_ms: 8_000, end_ms: 12_000, speaker: 1 }, // 1 cuts in on 0 with 2s overlap
      { start_ms: 9_000, end_ms: 9_500, speaker: 0 },  // 0's own overlapping fragment
      { start_ms: 20_000, end_ms: 25_000, speaker: 1 },
    ],
    30_000,
  );
  assert.equal(s.speakers[0].talk_ms, 10_000);
  assert.equal(s.speakers[1].talk_ms, 9_000);
  assert.equal(s.crosstalk_ms, 2_000);
  assert.deepEqual(s.interruptions, [{ by: 1, of: 0, count: 1 }]);
  assert.equal(s.silence_ms, 30_000 - 12_000 - 5_000);
});

test('computeStats: touching intervals are not crosstalk; monologue detected', () => {
  const s = computeStats(
    [
      { start_ms: 0, end_ms: 50_000, speaker: 0 },
      { start_ms: 50_500, end_ms: 100_000, speaker: 0 }, // same turn (gap < 2s) → 100s run
      { start_ms: 100_000, end_ms: 101_000, speaker: 1 },
    ],
    101_000,
  );
  assert.equal(s.crosstalk_ms, 0);
  assert.equal(s.monologues.length, 1);
  assert.equal(s.speakers[0].turns, 1);
});

const lines = [
  { start_ms: 0, end_ms: 1, text: 'Okay, let us get started with the quarterly planning.' },
  { start_ms: 1, end_ms: 2, text: 'Priya, can you own the onboarding redesign and have a draft by Friday?' },
  { start_ms: 2, end_ms: 3, text: 'Yes, I will have the draft ready by Friday.' },
  { start_ms: 3, end_ms: 4, text: 'We decided to delay the pricing change until March.' },
  { start_ms: 4, end_ms: 5, text: 'Great.' },
];

test('Grounder: exact quote at the cited line', () => {
  assert.equal(new Grounder(lines).ground(3, 'decided to delay the pricing change until March'), 3);
});

test('Grounder: corrects an off-by-two citation', () => {
  assert.equal(new Grounder(lines).ground(1, 'delay the pricing change until March'), 3);
});

test('Grounder: tolerates light paraphrase, finds quote anywhere', () => {
  assert.equal(new Grounder(lines).ground(null, "I'll have the draft ready by Friday"), 2);
});

test('Grounder: rejects a fabricated quote', () => {
  assert.equal(new Grounder(lines).ground(2, 'we will hire three more engineers next quarter'), null);
});

test('chunkUtterances: respects max window and splits at speaker change', () => {
  const utts = Array.from({ length: 40 }, (_, i) => ({
    start_ms: i * 5_000,
    end_ms: i * 5_000 + 4_500,
    speaker: i % 4 < 2 ? 'A' : 'B',
    text: 'some words here',
  }));
  const chunks = chunkUtterances(utts);
  for (const c of chunks) assert.ok(c.end_ms - c.start_ms <= 65_000);
  assert.equal(chunks[0].start_ms, 0);
  assert.equal(chunks.at(-1)!.end_ms, utts.at(-1)!.end_ms);
  assert.equal(chunks.reduce((a, c) => a + c.text.split('\n').length, 0), 40); // nothing lost
});

test('lastStartAtOrBefore', () => {
  const s = [0, 1000, 2000, 5000];
  assert.equal(lastStartAtOrBefore(s, -1), -1);
  assert.equal(lastStartAtOrBefore(s, 0), 0);
  assert.equal(lastStartAtOrBefore(s, 1999), 1);
  assert.equal(lastStartAtOrBefore(s, 99999), 3);
});
