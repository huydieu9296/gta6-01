// HUD: health/cash/wanted/ammo/speed, minimap, toasts, menus and the phone.
import { CITY } from './config.js';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function createHud(onAction) {
  const root = document.getElementById('hud');
  const S = CITY.streets;

  const topLeft = el('div', 'hud-tl', root);
  const healthWrap = el('div', 'hud-health', topLeft);
  const healthFill = el('div', 'hud-health-fill', healthWrap);
  const cashEl = el('div', 'hud-cash', topLeft, '$250');
  const ammoEl = el('div', 'hud-ammo', topLeft, 'SHOTGUN 6/24');

  const topRight = el('div', 'hud-tr', root);
  const starsEl = el('div', 'hud-stars', topRight, '☆☆☆☆☆');
  const clockEl = el('div', 'hud-clock', topRight, '10:00');

  const missionEl = el('div', 'hud-mission', root);
  const missionTitle = el('div', 'hud-mission-title', missionEl);
  const missionText = el('div', 'hud-mission-text', missionEl);
  const missionTimer = el('div', 'hud-mission-timer', missionEl);
  missionEl.style.display = 'none';

  const promptEl = el('div', 'hud-prompt', root);
  const toastEl = el('div', 'hud-toast', root);
  const speedEl = el('div', 'hud-speed', root, '');
  const helpEl = el('div', 'hud-help', root, 'WASD move · E enter car · F shoot · R reload · M phone · P pause');

  const mapWrap = el('div', 'hud-map-wrap', root);
  const map = el('canvas', 'hud-map', mapWrap);
  map.width = 190; map.height = 190;
  const mctx = map.getContext('2d');

  // Start screen.
  const startEl = el('div', 'hud-screen', root);
  el('h1', 'hud-title', startEl, 'SOLMAR HEAT');
  el('p', 'hud-sub', startEl, 'An open-world crime story in the city of Solmar.');
  const btnNew = el('button', 'hud-btn', startEl, 'New Game');
  const btnContinue = el('button', 'hud-btn', startEl, 'Continue');
  btnContinue.style.display = 'none';
  const controls = el('div', 'hud-controls', startEl,
    'WASD / arrows — move or drive · Mouse drag — camera · Shift — run · Space — jump / handbrake\n' +
    'E — enter / steal car · F / click — shoot shotgun · R — reload · M — phone (jobs, safehouses, save) · P — pause');
  const tipEl = el('p', 'hud-tip', startEl, 'Steal a car, take a job from Mara, and don\'t let the Solmar PD catch you.');

  // Pause screen.
  const pauseEl = el('div', 'hud-screen', root);
  pauseEl.style.display = 'none';
  el('h1', 'hud-title', pauseEl, 'PAUSED');
  const btnResume = el('button', 'hud-btn', pauseEl, 'Resume');
  const btnSave = el('button', 'hud-btn', pauseEl, 'Save Game');
  const btnQuit = el('button', 'hud-btn', pauseEl, 'Quit to Title');

  // Busted / wasted screen.
  const endEl = el('div', 'hud-screen', root);
  endEl.style.display = 'none';
  const endTitle = el('h1', 'hud-title', endEl, 'BUSTED');
  const endText = el('p', 'hud-sub', endEl, '');
  const btnRespawn = el('button', 'hud-btn', endEl, 'Respawn at Safehouse');

  // Phone panel.
  const phoneEl = el('div', 'hud-phone', root);
  phoneEl.style.display = 'none';
  el('h2', '', phoneEl, 'ROOK — PHONE');
  const phoneStory = el('div', 'hud-phone-sec', phoneEl);
  const phoneJobs = el('div', 'hud-phone-sec', phoneEl);
  const phoneHouses = el('div', 'hud-phone-sec', phoneEl);
  const phoneSave = el('button', 'hud-btn', phoneEl, 'Save Game');
  const phoneClose = el('button', 'hud-btn', phoneEl, 'Close (M)');

  let toastTimer = null;
  function toast(text, ms = 3500) {
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, ms);
  }

  btnNew.addEventListener('click', () => onAction('new'));
  btnContinue.addEventListener('click', () => onAction('continue'));
  btnResume.addEventListener('click', () => onAction('resume'));
  btnSave.addEventListener('click', () => onAction('save'));
  btnQuit.addEventListener('click', () => onAction('quit'));
  btnRespawn.addEventListener('click', () => onAction('respawn'));
  phoneSave.addEventListener('click', () => onAction('save'));
  phoneClose.addEventListener('click', () => onAction('phone'));

  function drawMap(state) {
    const g = mctx, W = 190, scale = W / 380, ox = W / 2, oz = W / 2;
    const X = (x) => ox + x * scale, Z = (z) => oz + z * scale;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#1d2b1d'; g.fillRect(0, 0, W, W);
    // Sea + sand (west).
    g.fillStyle = '#1e6f8e'; g.fillRect(0, 0, X(-196), W);
    g.fillStyle = '#d9c28a'; g.fillRect(X(-196), 0, X(-176) - X(-196), W);
    // Roads.
    g.strokeStyle = '#3a3f47'; g.lineWidth = 6 * scale * 2;
    for (const s of S) {
      g.beginPath(); g.moveTo(X(s), 0); g.lineTo(X(s), W); g.stroke();
      g.beginPath(); g.moveTo(0, Z(s)); g.lineTo(W, Z(s)); g.stroke();
    }
    // Blocks.
    g.fillStyle = '#2c313a';
    for (let i = 0; i < S.length - 1; i++) {
      for (let j = 0; j < S.length - 1; j++) {
        g.fillRect(X(S[i]) + 4, Z(S[j]) + 4, (S[i + 1] - S[i]) * scale - 8, (S[j + 1] - S[j]) * scale - 8);
      }
    }
    // Safehouses.
    g.fillStyle = '#22d3ee';
    for (const sh of state.safehouses) g.fillRect(X(sh.x) - 3, Z(sh.z) - 3, 6, 6);
    // Mission marker.
    if (state.missionMarker) {
      const m = state.missionMarker;
      g.fillStyle = '#4ade80';
      g.save();
      g.translate(X(m.x), Z(m.z));
      g.rotate(Math.PI / 4);
      const pulse = 4 + Math.sin(performance.now() / 200) * 1.5;
      g.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
      g.restore();
    }
    // Traffic.
    g.fillStyle = '#f2c94c';
    for (const c of state.traffic) g.fillRect(X(c.x) - 1.5, Z(c.z) - 1.5, 3, 3);
    // Police (flashing).
    g.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff2a2a' : '#3b82f6';
    for (const c of state.police) {
      g.beginPath(); g.arc(X(c.x), Z(c.z), 3, 0, 7); g.fill();
    }
    // Player arrow.
    g.save();
    g.translate(X(state.px), Z(state.pz));
    g.rotate(state.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.restore();
    // View cone hint.
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.arc(X(state.px), Z(state.pz), 14, 0, 7); g.stroke();
  }

  function fmtClock(hours) {
    const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return {
    toast,
    setPrompt(t) { promptEl.textContent = t || ''; promptEl.style.display = t ? 'block' : 'none'; },
    showStart(hasSave) {
      startEl.style.display = 'flex';
      pauseEl.style.display = 'none';
      endEl.style.display = 'none';
      phoneEl.style.display = 'none';
      btnContinue.style.display = hasSave ? 'block' : 'none';
      root.classList.add('menu-open');
    },
    hideScreens() {
      startEl.style.display = 'none';
      pauseEl.style.display = 'none';
      endEl.style.display = 'none';
      root.classList.remove('menu-open');
    },
    showPause() { pauseEl.style.display = 'flex'; root.classList.add('menu-open'); },
    hidePause() { pauseEl.style.display = 'none'; root.classList.remove('menu-open'); },
    showEnd(kind, text) {
      endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
      endTitle.style.color = kind === 'busted' ? '#60a5fa' : '#f87171';
      endText.textContent = text;
      endEl.style.display = 'flex';
      root.classList.add('menu-open');
    },
    hideEnd() { endEl.style.display = 'none'; },
    togglePhone(show) { phoneEl.style.display = show ? 'block' : 'none'; },
    phoneVisible() { return phoneEl.style.display === 'block'; },
    renderPhone(storyDone, storyDefs, cash, houses, onBuyHouse, onSideJob) {
      phoneStory.innerHTML = '<b>MARA — STORY</b><br>';
      storyDefs.forEach((d, i) => {
        const st = i < storyDone ? '✓ done' : i === storyDone ? '▶ current' : '· locked';
        phoneStory.innerHTML += `${i + 1}. ${d.name} — $${d.pay} <span style="color:#9aa3b2">${st}</span><br>`;
      });
      phoneJobs.innerHTML = '<b>SIDE JOBS</b><br>';
      const b1 = document.createElement('button');
      b1.className = 'hud-btn hud-btn-sm'; b1.textContent = 'Courier Run — $220';
      b1.addEventListener('click', () => onSideJob('courier'));
      const b2 = document.createElement('button');
      b2.className = 'hud-btn hud-btn-sm'; b2.textContent = 'Taxi Fare — $160';
      b2.addEventListener('click', () => onSideJob('taxi'));
      phoneJobs.append(b1, b2);
      phoneHouses.innerHTML = `<b>SAFEHOUSES</b> — cash $${Math.round(cash)}<br>`;
      for (const h of houses) {
        const owned = h.owned;
        const b = document.createElement('button');
        b.className = 'hud-btn hud-btn-sm';
        b.textContent = owned ? `${h.name} — owned` : `${h.name} — $${h.price}`;
        b.disabled = owned || cash < h.price;
        b.addEventListener('click', () => onBuyHouse(h.id));
        phoneHouses.appendChild(b);
      }
    },
    update(s) {
      healthFill.style.width = `${Math.max(0, s.health)}%`;
      healthFill.style.background = s.health > 50 ? '#4ade80' : s.health > 25 ? '#f2c94c' : '#f87171';
      cashEl.textContent = `$${Math.round(s.cash)}`;
      ammoEl.textContent = `SHOTGUN ${s.shells}/∞ · RESERVE ${s.ammo}`;
      starsEl.textContent = '★'.repeat(s.stars) + '☆'.repeat(5 - s.stars);
      starsEl.style.color = s.stars > 0 ? '#f87171' : '#9aa3b2';
      clockEl.textContent = `${fmtClock(s.timeOfDay)}${s.raining ? ' 🌧' : ''}`;
      if (s.mission) {
        missionEl.style.display = 'block';
        missionTitle.textContent = s.mission.name;
        missionText.textContent = s.mission.text;
        missionTimer.textContent = s.mission.timer > 0 ? `${Math.ceil(s.mission.timer)}s` : '';
        missionTimer.style.color = s.mission.timer < 20 ? '#f87171' : '#eef1f5';
      } else missionEl.style.display = 'none';
      speedEl.textContent = s.inCar ? `${Math.round(Math.abs(s.speed) * 3.6)} km/h` : '';
      drawMap(s);
    },
  };
}
