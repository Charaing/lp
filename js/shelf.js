// The record crate: one sleeve per album. Clicking a sleeve puts its record on the platter.

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createShelf(root, albums, onPick) {
  root.replaceChildren();
  if (albums.length === 0) {
    const empty = el('div', 'crate-empty');
    empty.append(
      el('p', null, 'albums/ 폴더에 앨범을 넣어주세요.'),
      el('p', 'crate-empty-hint', '앨범마다 폴더 하나에 cover.jpg와 노래 파일을 넣고 푸시하면 여기에 나타나요.'),
    );
    root.append(empty);
    return { setActive() {}, setTint() {} };
  }

  const list = el('ul', 'crate-list');
  const sleeves = new Map();
  albums.forEach((album, i) => {
    const li = el('li');
    const btn = el('button', 'sleeve');
    btn.type = 'button';
    btn.style.setProperty('--lean', `${((i * 37) % 5) - 2}deg`);
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `${album.title}${album.artist ? `, ${album.artist}` : ''} 턴테이블에 올리기`);

    const jacket = el('span', 'jacket');
    if (album.cover) {
      const img = el('img');
      img.src = album.cover;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); jacket.append(el('span', 'jacket-plain', album.title)); };
      jacket.append(img);
    } else {
      jacket.append(el('span', 'jacket-plain', album.title));
    }

    const meta = el('span', 'sleeve-meta');
    meta.append(el('span', 'sleeve-title', album.title));
    if (album.artist) meta.append(el('span', 'sleeve-artist', album.artist));

    btn.append(el('span', 'peek'), jacket, meta);
    btn.addEventListener('click', () => onPick(album));
    li.append(btn);
    list.append(li);
    sleeves.set(album.id, btn);
  });
  root.append(list);

  return {
    setActive(id) {
      for (const [key, btn] of sleeves) {
        const on = key === id;
        btn.classList.toggle('is-out', on);
        btn.setAttribute('aria-pressed', String(on));
      }
    },
    setTint(id, color) {
      sleeves.get(id)?.style.setProperty('--vinyl', color);
    },
  };
}
