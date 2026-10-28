// Holds the lock-screen picture of the record: one blob URL at a time, freeing the old one.
export function makeArtworkSlot(urlApi = globalThis.URL) {
  let url = null;
  return {
    set(blob) {
      const next = urlApi.createObjectURL(blob);
      if (url) urlApi.revokeObjectURL(url);
      url = next;
      return url;
    },
    clear() {
      if (url) urlApi.revokeObjectURL(url);
      url = null;
    },
    current: () => url,
  };
}
