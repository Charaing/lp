// Sets up the scratch sound: decodes the stretch of the track around the needle and feeds it
// to the audio-thread player (scratch-worklet.js), which follows the hand's speed.
import { windowAround } from './scratch-math.js';

export function createScratchEngine() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  const supported = !!(AC && globalThis.AudioWorkletNode);
  let ctx = null, node = null, loading = null;
  let cache = null; // { src, start, end }
  let lastSec = 0;
  let stopWaiter = null;
  const listeners = new Set();

  // Must start inside a pointer gesture: iOS only lets audio begin from one.
  function ensure() {
    if (loading) return loading;
    ctx = new AC();
    ctx.resume();
    loading = ctx.audioWorklet.addModule(new URL('./scratch-worklet.js', import.meta.url)).then(() => {
      node = new AudioWorkletNode(ctx, 'lp-scratch', { numberOfInputs: 0, outputChannelCount: [2] });
      node.connect(ctx.destination);
      node.port.onmessage = ({ data }) => {
        lastSec = data.sec;
        if (data.type === 'position') for (const fn of listeners) fn(data.sec);
        if (data.type === 'stopped' && stopWaiter) { stopWaiter(data.sec); stopWaiter = null; }
      };
    });
    return loading;
  }

  return {
    supported,

    // Decode around positionSec unless that stretch is already loaded. Resolves false on failure.
    async prepare(src, positionSec, durationSec) {
      if (!supported) return false;
      try {
        const ready = ensure();
        ctx.resume();
        await ready;
        if (cache && cache.src === src && positionSec >= cache.start + 5 && positionSec <= cache.end - 5) return true;
        const buf = await ctx.decodeAudioData(await (await fetch(src)).arrayBuffer());
        const w = windowAround(positionSec, durationSec || buf.duration);
        const from = Math.floor(w.start * buf.sampleRate), to = Math.min(buf.length, Math.ceil(w.end * buf.sampleRate));
        const mono = new Float32Array(Math.max(1, to - from));
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const ch = buf.getChannelData(c);
          for (let i = 0; i < mono.length; i++) mono[i] += ch[from + i] / buf.numberOfChannels;
        }
        node.port.postMessage({ type: 'load', samples: mono, sampleRate: buf.sampleRate, startSec: w.start }, [mono.buffer]);
        cache = { src, start: w.start, end: w.end };
        return true;
      } catch {
        return false;
      }
    },

    start(positionSec) {
      if (!node) return;
      ctx.resume();
      lastSec = positionSec;
      node.port.postMessage({ type: 'start', positionSec });
    },

    setRate(rate) {
      node?.port.postMessage({ type: 'rate', rate });
    },

    // Fades out and resolves with where the needle ended up (seconds into the track).
    stop() {
      if (!node) return Promise.resolve(lastSec);
      return new Promise((resolve) => {
        stopWaiter = resolve;
        node.port.postMessage({ type: 'stop' });
        setTimeout(() => { if (stopWaiter === resolve) { stopWaiter = null; resolve(lastSec); } }, 250);
      });
    },

    onPosition(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    dispose() {
      ctx?.close();
      ctx = node = loading = cache = null;
    },
  };
}
