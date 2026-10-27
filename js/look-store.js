// Remembers each album's record tweaks in this browser only.
const key = (id) => `lp:look:${id}`;

export function createLookStore(...args) {
  let storage = args[0];
  let available = false;
  try {
    // even reading window.localStorage throws when the browser blocks site data
    if (args.length === 0) storage = globalThis.localStorage;
    storage.setItem('lp:probe', '1');
    storage.removeItem('lp:probe');
    available = true;
  } catch { /* private mode, blocked site data, or no storage at all */ }

  return {
    available,
    load(id) {
      if (!available) return {};
      try {
        const raw = storage.getItem(key(id));
        if (raw == null) return {};
        const v = JSON.parse(raw);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      } catch {
        try { storage.removeItem(key(id)); } catch { /* ignore */ }
        return {};
      }
    },
    save(id, diff) {
      if (!available) return;
      try { storage.setItem(key(id), JSON.stringify(diff)); } catch { /* storage full or blocked */ }
    },
    clear(id) {
      if (!available) return;
      try { storage.removeItem(key(id)); } catch { /* ignore */ }
    },
  };
}
