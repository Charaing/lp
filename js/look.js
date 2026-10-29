// What a record looks like (its "look"): pressing, colours, shape, size, label, finish and
// the turntable around it. Shared by album.json, the browser's saved tweaks and the customizer.
// Pure, so Node tests and the build script can import it.

export const STYLES = ['black', 'solid', 'translucent', 'marble', 'splatter', 'gradient', 'half', 'glitter', 'picture'];
export const SHAPES = ['round', 'heart', 'star', 'hexagon', 'flower'];
export const SIZES = [7, 10, 12];
export const LABEL_MODES = ['cover', 'color', 'text'];
export const ARMS = ['silver', 'gold', 'black'];
export const SIZE_FACTOR = { 12: 1, 10: 0.83, 7: 0.58 };
// radius of the largest circle that fits inside each shape; grooves stay inside it
export const INSCRIBED = { round: 1, hexagon: 0.866, flower: 0.8, heart: 0.55, star: 0.55 };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;

// which values each field accepts; anything else is ignored
const FIELDS = {
  vinyl: {
    style: (v) => STYLES.includes(v),
    color: isHex,
    accent: isHex,
    shape: (v) => SHAPES.includes(v),
    size: (v) => SIZES.includes(Number(v)),
  },
  label: {
    mode: (v) => LABEL_MODES.includes(v),
    size: isNum,
    color: isHex,
    text: isHex,
    showTitle: (v) => typeof v === 'boolean',
    ring: (v) => typeof v === 'boolean',
  },
  finish: { grooves: isNum, gloss: isNum },
  deck: { body: (v) => v === 'auto' || isHex(v), arm: (v) => ARMS.includes(v) },
};

// copy the valid fields of each layer over the previous ones
function layer(into, raw) {
  if (!isObj(raw)) return into;
  for (const [group, fields] of Object.entries(FIELDS)) {
    if (!isObj(raw[group])) continue;
    for (const [key, ok] of Object.entries(fields)) {
      const v = raw[group][key];
      if (v !== undefined && ok(v)) into[group][key] = key === 'size' && group === 'vinyl' ? Number(v) : v;
    }
  }
  return into;
}

const empty = () => ({ vinyl: {}, label: {}, finish: {}, deck: {} });

export function grooveFor(look) {
  const sf = SIZE_FACTOR[look.vinyl.size], ins = INSCRIBED[look.vinyl.shape];
  return { outer: 0.96 * sf * ins, inner: (look.label.size + 0.04) * sf };
}

export function normalizeLook(raw) {
  const r = layer(empty(), raw);
  const shape = r.vinyl.shape ?? 'round';
  const size = r.vinyl.size ?? 12;
  const look = {
    vinyl: {
      style: r.vinyl.style ?? (r.vinyl.color ? 'solid' : 'black'),
      color: r.vinyl.color ?? null,
      accent: r.vinyl.accent ?? null,
      shape,
      size,
    },
    label: {
      mode: r.label.mode ?? 'cover',
      size: round3(clamp(r.label.size ?? 0.36, 0.25, Math.min(0.45, INSCRIBED[shape] * 0.7))),
      color: r.label.color ?? null,
      text: r.label.text ?? null,
      showTitle: r.label.showTitle ?? false,
      ring: r.label.ring ?? true,
    },
    finish: { grooves: round3(clamp(r.finish.grooves ?? 0.5, 0, 1)), gloss: round3(clamp(r.finish.gloss ?? 0.6, 0, 1)) },
    deck: { body: r.deck.body ?? 'auto', arm: r.deck.arm ?? 'silver' },
  };
  // small, pointy records: shrink the label so there is still room for grooves
  const g = grooveFor(look);
  if (g.outer - g.inner < 0.12) {
    const fit = (g.outer - 0.12) / SIZE_FACTOR[size] - 0.04;
    look.label.size = round3(Math.max(0.25, Math.min(look.label.size, Math.floor(fit * 1000) / 1000)));
  }
  return look;
}

export function mergeLook(...layers) {
  return normalizeLook(layers.reduce(layer, empty()));
}

// The record before anyone tweaked it: album.json (old and new fields) over sensible defaults.
export function defaultLook(album, palette = [], hasCover = false) {
  const base = { vinyl: { accent: palette[1] }, label: { mode: hasCover ? 'cover' : 'text' } };
  const legacy = { vinyl: album?.vinyl, label: album?.label };
  return mergeLook(base, legacy, album?.look);
}

export function lookDiff(look, base) {
  const out = {};
  for (const [group, fields] of Object.entries(FIELDS)) {
    for (const key of Object.keys(fields)) {
      const a = look?.[group]?.[key], b = base?.[group]?.[key];
      const same = isNum(a) && isNum(b) ? Math.abs(a - b) < 1e-9 : a === b;
      if (!same && a !== undefined && a !== null) (out[group] ??= {})[key] = a;
    }
  }
  return out;
}

export function albumJsonSnippet(album, look, base) {
  const head = { title: album.title };
  if (album.artist) head.artist = album.artist;
  if (album.year != null) head.year = album.year;
  if (album.rpm === 45) head.rpm = 45;
  return JSON.stringify({ ...head, ...lookDiff(look, base) }, null, 2);
}
