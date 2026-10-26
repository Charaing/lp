// Minimal stand-in for HTMLAudioElement: metadata/error events fire on the next tick
// unless `hold` is set, in which case the test fires them with fire().
export class FakeAudio extends EventTarget {
  static hold = false;
  constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = NaN; this._src = null; }
  set src(v) {
    this._src = v; this.currentTime = 0;
    if (!FakeAudio.hold) setTimeout(() => this.fire(v.includes('bad') ? 'error' : 'loadedmetadata'), 0);
  }
  get src() { return this._src; }
  getAttribute(n) { return n === 'src' ? this._src : null; }
  removeAttribute(n) { if (n === 'src') this._src = null; }
  fire(type) { if (type === 'loadedmetadata') this.duration = 10; this.dispatchEvent(new Event(type)); }
  load() {}
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

// Player creates Audio elements, so install the fake before importing it.
export function installFakeAudio() {
  globalThis.Audio = FakeAudio;
  return FakeAudio;
}
