'use client';
import { useSyncExternalStore } from 'react';

/**
 * Playback state lives outside React. The media element is polled with
 * requestAnimationFrame while playing; subscribers read it through selectors
 * (useSyncExternalStore), so a component re-renders only when *its* derived
 * value changes. The transcript re-renders when the active line changes
 * (~every few seconds), not 60 times a second.
 */
export class PlayerStore {
  el: HTMLMediaElement | null = null;
  time = 0; // ms
  playing = false;
  rate = 1;
  duration: number;
  /** Optional [start, end] window (clip pages): playback stops at the end. */
  bounds: [number, number] | null = null;
  private subs = new Set<() => void>();
  private raf = 0;

  constructor(durationMs: number) {
    this.duration = durationMs;
  }

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  };
  private emit() {
    for (const fn of this.subs) fn();
  }

  attach(el: HTMLMediaElement | null) {
    if (this.el === el) return;
    this.el = el;
    if (!el) return;
    el.playbackRate = this.rate;
    el.onplay = () => { this.playing = true; this.loop(); this.emit(); };
    el.onpause = () => { this.playing = false; cancelAnimationFrame(this.raf); this.sync(); };
    el.onended = () => { this.playing = false; this.sync(); };
    el.onseeked = () => this.sync();
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) this.duration = Math.max(this.duration, el.duration * 1000);
      if (this.time) el.currentTime = this.time / 1000;
      this.emit();
    };
  }

  private sync() {
    if (!this.el) return;
    this.time = this.el.currentTime * 1000;
    this.emit();
  }

  private loop = () => {
    if (!this.el || !this.playing) return;
    this.time = this.el.currentTime * 1000;
    if (this.bounds && this.time >= this.bounds[1]) {
      this.el.pause();
      this.time = this.bounds[1];
    }
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
  };

  seek(ms: number, play = false) {
    const lo = this.bounds?.[0] ?? 0;
    const hi = this.bounds?.[1] ?? this.duration;
    const t = Math.min(Math.max(ms, lo), hi);
    this.time = t;
    if (this.el) {
      this.el.currentTime = t / 1000;
      if (play) this.el.play().catch(() => {});
    }
    this.emit();
  }

  toggle() {
    if (!this.el) return;
    if (this.el.paused) {
      if (this.bounds && this.time >= this.bounds[1] - 50) this.seek(this.bounds[0]);
      this.el.play().catch(() => {});
    } else this.el.pause();
  }

  skip(deltaMs: number) {
    this.seek(this.time + deltaMs);
  }

  setRate(r: number) {
    this.rate = r;
    if (this.el) this.el.playbackRate = r;
    this.emit();
  }
}

export function usePlayer<T>(store: PlayerStore, select: (s: PlayerStore) => T): T {
  // Selectors must return primitives (or stable references): the snapshot is
  // compared with Object.is, which is exactly what limits re-renders.
  const get = () => select(store);
  return useSyncExternalStore(store.subscribe, get, get);
}
