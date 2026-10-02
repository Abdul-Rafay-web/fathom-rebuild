// Conversation dynamics from speech intervals.
//
// Talk time is the *union* of each speaker's intervals (diarization can emit
// overlapping utterances for one speaker). Crosstalk and interruptions come from
// a single sweep line over all start/end events: O(n log n) for the sort, O(n)
// for the sweep. That matters on an 8-person hour (~1,500 utterances), and the
// same pass gives every metric at once.

export type Interval = { start_ms: number; end_ms: number; speaker: number; text?: string };

export type SpeakerStats = { talk_ms: number; turns: number; longest_ms: number };

export type MeetingStats = {
  duration_ms: number;
  speakers: Record<number, SpeakerStats>;
  crosstalk_ms: number;            // time with 2+ people talking
  interruptions: { by: number; of: number; count: number }[];
  monologues: { speaker: number; start_ms: number; end_ms: number }[];
  silence_ms: number;
};

const MONOLOGUE_MS = 90_000;  // one person holding the floor for 90s+
const SAME_TURN_GAP_MS = 2_000; // a pause shorter than this doesn't end a turn
const INTERRUPT_MIN_OVERLAP_MS = 600;
// Diarized transcripts are serialized (one speaker at a time), so true overlap
// rarely survives into timestamps. A cut-in is the serialized signature of an
// interruption: the floor changes within 250 ms while the previous speaker's
// sentence is left unfinished.
const CUT_IN_GAP_MS = 250;
const UNFINISHED = /[^.?!…"')\]]\s*$/;

/** Merge overlapping/adjacent intervals. Input need not be sorted. */
export function mergeIntervals<T extends { start_ms: number; end_ms: number }>(xs: T[], gap = 0) {
  const s = [...xs].sort((a, b) => a.start_ms - b.start_ms);
  const out: { start_ms: number; end_ms: number }[] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x.start_ms <= last.end_ms + gap) last.end_ms = Math.max(last.end_ms, x.end_ms);
    else out.push({ start_ms: x.start_ms, end_ms: x.end_ms });
  }
  return out;
}

export function computeStats(utts: Interval[], duration_ms: number): MeetingStats {
  const bySpeaker = new Map<number, Interval[]>();
  for (const u of utts) {
    if (!bySpeaker.has(u.speaker)) bySpeaker.set(u.speaker, []);
    bySpeaker.get(u.speaker)!.push(u);
  }

  // Per-speaker: union talk time, turns (runs separated by >2s), longest run.
  const speakers: MeetingStats['speakers'] = {};
  const monologues: MeetingStats['monologues'] = [];
  for (const [spk, xs] of bySpeaker) {
    const runs = mergeIntervals(xs, SAME_TURN_GAP_MS);
    const talk = mergeIntervals(xs).reduce((a, r) => a + (r.end_ms - r.start_ms), 0);
    let longest = 0;
    for (const r of runs) {
      const d = r.end_ms - r.start_ms;
      longest = Math.max(longest, d);
      if (d >= MONOLOGUE_MS) monologues.push({ speaker: spk, ...r });
    }
    speakers[spk] = { talk_ms: talk, turns: runs.length, longest_ms: longest };
  }

  // Sweep line. Ends sort before starts at the same instant so touching
  // intervals don't count as overlap.
  type Ev = { t: number; d: 1 | -1; u: Interval };
  const evs: Ev[] = [];
  for (const u of utts) {
    if (u.end_ms <= u.start_ms) continue;
    evs.push({ t: u.start_ms, d: 1, u }, { t: u.end_ms, d: -1, u });
  }
  evs.sort((a, b) => a.t - b.t || a.d - b.d);

  const active = new Set<Interval>();
  let crosstalk = 0;
  let speech = 0;
  let prevT = evs.length ? evs[0].t : 0;
  const interrupts = new Map<string, number>();

  for (const ev of evs) {
    const dt = ev.t - prevT;
    if (dt > 0) {
      const talkers = new Set([...active].map((a) => a.speaker)).size;
      if (talkers >= 1) speech += dt;
      if (talkers >= 2) crosstalk += dt;
    }
    prevT = ev.t;
    if (ev.d === 1) {
      // A new utterance starting while someone else is mid-sentence, and that
      // someone keeps talking for a while after: an interruption. A speaker who
      // is already talking (a diarization fragment of their own turn) can't
      // interrupt anyone.
      const alreadyTalking = [...active].some((a) => a.speaker === ev.u.speaker);
      for (const a of alreadyTalking ? [] : active) {
        if (a.speaker !== ev.u.speaker && a.end_ms - ev.t >= INTERRUPT_MIN_OVERLAP_MS) {
          const k = `${ev.u.speaker}:${a.speaker}`;
          interrupts.set(k, (interrupts.get(k) ?? 0) + 1);
        }
      }
      active.add(ev.u);
    } else {
      active.delete(ev.u);
    }
  }

  // Cut-ins over the time-ordered transcript.
  const ordered = [...utts].sort((a, b) => a.start_ms - b.start_ms);
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], cur = ordered[i];
    if (
      cur.speaker !== prev.speaker &&
      cur.start_ms - prev.end_ms < CUT_IN_GAP_MS &&
      cur.start_ms >= prev.end_ms - INTERRUPT_MIN_OVERLAP_MS && // larger overlaps were counted by the sweep
      prev.text != null && UNFINISHED.test(prev.text)
    ) {
      const k = `${cur.speaker}:${prev.speaker}`;
      interrupts.set(k, (interrupts.get(k) ?? 0) + 1);
    }
  }

  return {
    duration_ms,
    speakers,
    crosstalk_ms: crosstalk,
    interruptions: [...interrupts]
      .map(([k, count]) => {
        const [by, of] = k.split(':').map(Number);
        return { by, of, count };
      })
      .sort((a, b) => b.count - a.count),
    monologues: monologues.sort((a, b) => a.start_ms - b.start_ms),
    silence_ms: Math.max(0, duration_ms - speech),
  };
}
