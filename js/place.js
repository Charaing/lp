// Picking a record: it lifts out of its sleeve, travels across and is set down on the platter.
// A stand-in disc does the flying; once the deck has drawn the real record it takes over in place.
const FLY_MS = 950;
const GIVE_UP_MS = 5000; // the record never loaded: stop waiting and show what's there

function drawStandIn(canvas, cover) {
  const ctx = canvas.getContext('2d');
  const R = canvas.width / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(R, R);
  const g = ctx.createRadialGradient(0, 0, R * 0.36, 0, 0, R);
  g.addColorStop(0, '#1b1a1a'); g.addColorStop(0.55, '#0e0d0d'); g.addColorStop(1, '#1a1919');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1;
  for (let r = R * 0.4; r < R * 0.96; r += 3) {
    ctx.strokeStyle = r % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2);
  if (cover) {
    ctx.save(); ctx.clip();
    const s = Math.max((R * 0.72) / cover.width, (R * 0.72) / cover.height);
    ctx.drawImage(cover, (-cover.width * s) / 2, (-cover.height * s) / 2, cover.width * s, cover.height * s);
    ctx.restore();
  } else {
    ctx.fillStyle = '#d9d3c8'; ctx.fill();
  }
  ctx.restore();
}

const rotationOf = (el) => Number((el?.style.transform.match(/rotate\(([-\d.]+)deg\)/) || [0, 0])[1]);

// from: the disc in the sleeve; recordEl: the deck's .tt-record (just made visible).
export function placeRecord(from, album, recordEl) {
  if (!from || !recordEl || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = from.getBoundingClientRect();
  if (!(start.width > 0)) return;

  let handedOver = false;
  const flyer = document.createElement('canvas');
  flyer.className = 'flyer';
  flyer.width = flyer.height = 512;
  Object.assign(flyer.style, { left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.width}px` });
  drawStandIn(flyer, null);
  if (album.cover) {
    const img = new Image();
    img.onload = () => { if (!handedOver) drawStandIn(flyer, img); };
    img.src = album.cover;
  }
  document.body.append(flyer);
  recordEl.classList.add('placing');

  // the real record shows the moment it's drawn and the flight is over
  const finish = () => {
    handedOver = true;
    recordEl.classList.remove('placing');
    flyer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished.then(() => flyer.remove(), () => flyer.remove());
  };

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const end = recordEl.getBoundingClientRect();
    const spin = recordEl.querySelector('.tt-spin');
    const dx = end.left + end.width / 2 - (start.left + start.width / 2);
    const dy = end.top + end.height / 2 - (start.top + start.height / 2);
    const k = end.width / start.width;
    const turn = rotationOf(spin) + 360; // a full turn on the way, landing lined up with the deck's record
    const flight = flyer.animate([
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.45))' },
      { transform: `translate(${dx * 0.7}px, ${dy * 0.7 - end.height * 0.08}px) scale(${k * 1.08}) rotate(${turn * 0.75}deg)`, filter: 'drop-shadow(0 40px 40px rgba(0,0,0,.5))', offset: 0.65 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(${turn}deg)`, filter: 'drop-shadow(0 14px 18px rgba(0,0,0,.45))' },
    ], { duration: FLY_MS, easing: 'cubic-bezier(.3, .6, .25, 1)', fill: 'forwards' });

    const deckCanvas = recordEl.querySelector('canvas');
    const t0 = performance.now();
    flight.finished.then(function wait() {
      if (handedOver) return;
      if (!recordEl.classList.contains('empty') || performance.now() - t0 > GIVE_UP_MS) {
        // swap the stand-in for the record exactly as the deck drew it, then let the deck show it
        if (!recordEl.classList.contains('empty')) {
          const ctx = flyer.getContext('2d');
          ctx.clearRect(0, 0, flyer.width, flyer.height);
          ctx.drawImage(deckCanvas, 0, 0, flyer.width, flyer.height);
        }
        finish();
      } else {
        requestAnimationFrame(wait);
      }
    }, finish);
  }));
}
