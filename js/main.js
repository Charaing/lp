import { Player } from './player.js';
import { createShelf } from './shelf.js';
import { createTurntable } from './turntable.js';
import { loadCover, designFor } from './vinyl.js';
import { connectMediaSession } from './now-playing.js';

const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

async function loadAlbums() {
  try {
    const res = await fetch('albums.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.albums) ? data.albums : [];
  } catch {
    return [];
  }
}

const player = new Player();
player.addEventListener('error', (e) => toast(`재생할 수 없는 트랙: ${e.detail.title}`));

const turntable = createTurntable(document.getElementById('deck'), player);
connectMediaSession(player, turntable);
const albums = await loadAlbums();
const shelf = createShelf(document.getElementById('crate'), albums, (album) => {
  shelf.setActive(album.id);
  turntable.mount(album);
});

if (albums.length === 0) document.querySelector('.deck-hint').textContent = 'albums/ 폴더에 앨범을 넣어주세요';

// Tint each sleeve's peeking record with the color its LP will have.
for (const album of albums) {
  loadCover(album.cover).then((cover) => shelf.setTint(album.id, designFor(album, cover).base));
}
