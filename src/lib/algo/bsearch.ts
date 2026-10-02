/**
 * Index of the last element whose start is <= t (or -1). The transcript is sorted
 * by start time, so mapping the playhead to the active line is O(log n) per
 * animation frame instead of a linear scan of ~1,500 lines.
 */
export function lastStartAtOrBefore(starts: ArrayLike<number>, t: number): number {
  let lo = 0, hi = starts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (starts[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
