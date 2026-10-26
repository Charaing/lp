// Plays an album as one continuous timeline across its tracks.
import { locate, startOf } from './timeline.js';

export function nextPlayableIndex(failed, from, count) {
  for (let i = from + 1; i < count; i++) if (!failed.has(i)) return i;
  return -1;
}

function measure(src) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    const done = (d) => { clearTimeout(timer); a.removeAttribute('src'); resolve(d); };
    const timer = setTimeout(() => done(null), 15000);
    a.addEventListener('loadedmetadata', () => done(Number.isFinite(a.duration) ? a.duration : null), { once: true });
    a.addEventListener('error', () => done(null), { once: true });
    a.src = src;
  });
}

export class Player extends EventTarget {
  constructor() {
    super();
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.album = null;
    this.durations = [];
    this.failed = new Set();
    this._index = 0;
    this._want = false; // the needle is down and the platter is spinning
    this._loadToken = 0;
    this.audio.addEventListener('ended', () => this._advance());
    this.audio.addEventListener('error', () => {
      if (!this.album || !this.audio.getAttribute('src')) return;
      this.failed.add(this._index);
      this._emit('error', { index: this._index, title: this.album.tracks[this._index].title });
      this._advance();
    });
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  async load(album) {
    const token = ++this._loadToken;
    this.pause();
    this.album = album;
    this.failed = new Set();
    this.durations = album.tracks.map(() => 0);
    this._index = 0;
    this.audio.src = album.tracks[0].src;
    const measured = await Promise.all(album.tracks.map((t) => measure(t.src)));
    if (token !== this._loadToken) return this.durations;
    this.durations = measured.map((d, i) => {
      if (d == null) this.failed.add(i);
      return d ?? 0;
    });
    this._emit('durations', { durations: this.durations });
    return this.durations;
  }

  get total() { return this.durations.reduce((a, d) => a + d, 0); }
  get index() { return this._index; }
  get playing() { return !this.audio.paused; }
  get time() { return startOf(this.durations, this._index) + (this.audio.currentTime || 0); }

  seek(t) {
    if (!this.album) return;
    const { index, offset } = locate(this.durations, t);
    this._setTrack(index, offset);
  }

  _setTrack(index, offset) {
    const src = this.album.tracks[index].src;
    const changed = index !== this._index;
    this._index = index;
    if (changed || this.audio.getAttribute('src') !== src) {
      this.audio.src = src;
      this.audio.addEventListener('loadedmetadata', () => {
        this.audio.currentTime = offset;
        if (this._want) this.audio.play().catch(() => {});
      }, { once: true });
    } else {
      this.audio.currentTime = offset;
    }
    if (changed) this._emit('track', { index });
  }

  _advance() {
    const next = nextPlayableIndex(this.failed, this._index, this.album.tracks.length);
    if (next === -1) {
      this._want = false;
      this.audio.pause();
      this._emit('ended');
      return;
    }
    this._setTrack(next, 0);
  }

  async play() {
    this._want = true;
    if (this.failed.has(this._index)) return this._advance();
    try { await this.audio.play(); } catch { /* reported through the audio 'error' event */ }
  }

  pause() {
    this._want = false;
    this.audio.pause();
  }
}
