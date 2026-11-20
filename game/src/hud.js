// Solmar Heat — the HUD: health, wanted stars, cash, speed, clock, weapon,
// mission text and toasts, plus a live canvas minimap of Solmar (roads, the
// player, cars, police and the mission marker).
export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = {
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    stars: el('stars'),
    cash: el('cash'),
    speed: el('speed'),
    clock: el('clock'),
    weapon: el('weapon'),
    mission: el('mission'),
    missionTimer: el('mission-timer'),
    prompt: el('prompt'),
    toasts: el('toasts'),
    minimap: el('minimap'),
    flash: el('damage-flash'),
    screens: {
      menu: el('screen-menu'),
      pause: el('screen-pause'),
      busted: el('screen-busted'),
      gameover: el('screen-gameover'),
    },
    bustedCash: el('busted-cash'),
  };
  const ctx = hud.minimap.getContext('2d');
  const starSpans = [];
  for (let i = 0; i < 5; i += 1) {
    const span = document.createElement('span');
    span.textContent = '★';
    hud.stars.appendChild(span);
    starSpans.push(span);
  }

  function fmtClock(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function toast(text, ms) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    hud.toasts.appendChild(div);
    while (hud.toasts.children.length > 3) hud.toasts.removeChild(hud.toasts.firstChild);
    setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 600);
    }, ms || 4200);
  }

  function setScreen(name) {
    for (const key of Object.keys(hud.screens)) {
      hud.screens[key].classList.toggle('hidden', key !== name);
    }
  }

  function update(state) {
    const hp = Math.max(0, Math.round(state.health));
    hud.healthFill.style.width = `${hp}%`;
    hud.healthFill.style.background = hp > 50 ? '#3ec26a' : hp > 25 ? '#e0a92e' : '#e05252';
    hud.healthText.textContent = `${hp}`;
    starSpans.forEach((span, i) => span.classList.toggle('lit', i < state.stars));
    hud.stars.classList.toggle('hot', state.stars > 0);
    hud.cash.textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
    hud.speed.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 3.6)} km/h` : '';
    hud.clock.textContent = fmtClock(state.hour);
    hud.weapon.textContent = state.inCar
      ? 'Driving'
      : state.weapon === 'shotgun'
        ? `Shotgun · ${state.ammo} shells`
        : 'Fists';
    const m = state.mission;
    if (m) {
      hud.mission.textContent = `${m.name} — ${m.stage === 'pickup' ? 'go to the marker' : 'deliver it'}`;
      hud.missionTimer.textContent = `${Math.max(0, Math.ceil(m.timeLeft))}s`;
      hud.missionTimer.classList.toggle('urgent', m.timeLeft < 30);
    } else {
      hud.mission.textContent = state.storyHint || 'Find a yellow marker to start a job.';
      hud.missionTimer.textContent = '';
    }
    hud.prompt.textContent = state.prompt || '';
    hud.prompt.classList.toggle('hidden', !state.prompt);
    drawMinimap(state);
  }

  function drawMinimap(state) {
    const w = hud.minimap.width;
    const h = hud.minimap.height;
    const half = state.cityHalf;
    const scale = w / (half * 2 + 80);
    const toX = (x) => w / 2 + x * scale;
    const toY = (z) => h / 2 + z * scale;
    ctx.fillStyle = 'rgba(10, 14, 22, 0.85)';
    ctx.fillRect(0, 0, w, h);
    // beach + port
    ctx.fillStyle = '#8a744a';
    ctx.fillRect(0, toY(half), w, h - toY(half));
    ctx.fillStyle = '#2a6f8f';
    ctx.fillRect(toX(half), 0, w - toX(half), h);
    // roads
    ctx.strokeStyle = '#5a5e66';
    ctx.lineWidth = 2;
    for (const s of state.streets) {
      ctx.beginPath();
      ctx.moveTo(toX(-half), toY(s));
      ctx.lineTo(toX(half), toY(s));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(s), toY(-half));
      ctx.lineTo(toX(s), toY(half));
      ctx.stroke();
    }
    // safehouses + pit stop
    for (const sh of state.safehouses) {
      ctx.fillStyle = sh.owned ? '#3ec26a' : '#8a8d94';
      ctx.fillRect(toX(sh.pos.x) - 3, toY(sh.pos.z) - 3, 6, 6);
    }
    ctx.fillStyle = '#ff7a2e';
    ctx.fillRect(toX(state.pitstop.x) - 3, toY(state.pitstop.z) - 3, 6, 6);
    // mission marker — pulses so the eye finds it on the map
    if (state.missionTarget) {
      ctx.fillStyle = '#ffe14d';
      const x = toX(state.missionTarget.x);
      const y = toY(state.missionTarget.z);
      ctx.beginPath();
      ctx.arc(x, y, 4 + Math.sin(state.time * 4) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // traffic + police
    for (const car of state.cars) {
      ctx.fillStyle = car.isPolice ? '#4d7dff' : '#e0a92e';
      ctx.fillRect(toX(car.pos.x) - 2, toY(car.pos.z) - 2, 4, 4);
    }
    for (const off of state.officers) {
      ctx.fillStyle = '#ff4d6a';
      ctx.fillRect(toX(off.pos.x) - 2, toY(off.pos.z) - 2, 4, 4);
    }
    // player arrow
    const px = toX(state.playerPos.x);
    const py = toY(state.playerPos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.playerAngle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function damageFlash() {
    hud.flash.classList.remove('go');
    void hud.flash.offsetWidth;
    hud.flash.classList.add('go');
  }

  return { update, toast, setScreen, damageFlash, hud };
}
