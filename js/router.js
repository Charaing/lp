// The deck screen lives at #<album id>; no hash is the crate.

export function hashForAlbum(id) {
  return `#${encodeURIComponent(id)}`;
}

export function albumIdFromHash(hash) {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
