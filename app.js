(() => {
  'use strict';

  const els = {
    time: document.getElementById('time'),
    seconds: document.getElementById('seconds'),
    date: document.getElementById('date'),
    battery: document.getElementById('battery'),
    drift: document.getElementById('drift'),
    stage: document.getElementById('stage'),
    hint: document.getElementById('hint'),
    panel: document.getElementById('panel'),
    closePanel: document.getElementById('close-panel'),
    toggleWake: document.getElementById('toggle-wake'),
    wakeStatus: document.getElementById('wake-status'),
    toggle24h: document.getElementById('toggle-24h'),
    toggleSeconds: document.getElementById('toggle-seconds'),
    rangeDim: document.getElementById('range-dim'),
    lockToggle: document.getElementById('lock-toggle'),
    lockShackle: document.getElementById('lock-shackle'),
  };

  const LOCK_SHACKLE_CLOSED = 'M7 11V7a5 5 0 0 1 10 0v4';
  const LOCK_SHACKLE_OPEN = 'M7 11V7a5 5 0 0 1 9.9-1';

  const DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת'];
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('staying-clock:' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('staying-clock:' + key, JSON.stringify(value));
      } catch {
        /* storage unavailable — settings just won't persist */
      }
    },
  };

  const settings = {
    wakeEnabled: store.get('wakeEnabled', true),
    format24h: store.get('format24h', true),
    showSeconds: store.get('showSeconds', true),
    dim: store.get('dim', 100),
    locked: store.get('locked', false),
  };

  function applyLockToUI() {
    els.lockToggle.classList.toggle('locked', settings.locked);
    els.lockShackle.setAttribute('d', settings.locked ? LOCK_SHACKLE_CLOSED : LOCK_SHACKLE_OPEN);
    els.lockToggle.setAttribute('aria-label', settings.locked ? 'נעילת מגע פעילה — הקש לביטול' : 'נעילת מגע כבויה — הקש לנעילה');
  }

  function applySettingsToUI() {
    els.toggleWake.checked = settings.wakeEnabled;
    els.toggle24h.checked = settings.format24h;
    els.toggleSeconds.checked = settings.showSeconds;
    els.rangeDim.value = settings.dim;
    applyLockToUI();
    els.seconds.hidden = !settings.showSeconds;
    els.drift.style.setProperty('--dim', settings.dim / 100);
  }

  // ---------- Clock ----------

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function renderClock() {
    const now = new Date();
    let h = now.getHours();
    let suffix = '';
    if (!settings.format24h) {
      suffix = h >= 12 ? ' PM' : ' AM';
      h = h % 12 || 12;
    }
    els.time.textContent = `${pad(h)}:${pad(now.getMinutes())}${suffix}`;
    els.seconds.textContent = pad(now.getSeconds());
    els.date.textContent = `${DAYS[now.getDay()]}, ${now.getDate()} ב${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }

  function scheduleClockTick() {
    renderClock();
    const msToNextSecond = 1000 - (Date.now() % 1000);
    setTimeout(() => {
      renderClock();
      setInterval(renderClock, 1000);
    }, msToNextSecond);
  }

  // ---------- Burn-in protection: gently drift the display over time ----------

  function scheduleDrift() {
    const MAX_OFFSET = 18; // px, small enough to stay unnoticeable on any screen size
    setInterval(() => {
      const dx = Math.round((Math.random() * 2 - 1) * MAX_OFFSET);
      const dy = Math.round((Math.random() * 2 - 1) * MAX_OFFSET);
      els.drift.style.setProperty('--dx', dx + 'px');
      els.drift.style.setProperty('--dy', dy + 'px');
    }, 60 * 1000);
  }

  // ---------- Battery level (best-effort, feature-detected) ----------

  async function initBattery() {
    if (!('getBattery' in navigator)) return;
    try {
      const battery = await navigator.getBattery();
      const render = () => {
        els.battery.hidden = false;
        els.battery.textContent = `סוללה ${Math.round(battery.level * 100)}%${battery.charging ? ' ⚡' : ''}`;
      };
      render();
      battery.addEventListener('levelchange', render);
      battery.addEventListener('chargingchange', render);
    } catch {
      /* not available on this device/browser — leave hidden */
    }
  }

  // ---------- Screen Wake Lock ----------

  let wakeLock = null;
  const wakeSupported = 'wakeLock' in navigator;

  async function acquireWakeLock() {
    if (!wakeSupported || !settings.wakeEnabled) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
      updateWakeStatus();
    } catch (err) {
      wakeLock = null;
      updateWakeStatus(err);
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch {
        /* already released */
      }
      wakeLock = null;
    }
    updateWakeStatus();
  }

  function updateWakeStatus(err) {
    if (!wakeSupported) {
      els.wakeStatus.textContent = 'הדפדפן הזה לא תומך בנעילת מסך אוטומטית. הגדר ידנית "שינה" ארוכה בהגדרות התצוגה של הטלפון.';
      return;
    }
    if (!settings.wakeEnabled) {
      els.wakeStatus.textContent = 'המסך יכול להיכבות לפי ההגדרות הרגילות של הטלפון.';
      return;
    }
    if (wakeLock) {
      els.wakeStatus.textContent = 'המסך יישאר דלוק כל עוד האפליקציה פתוחה במסך הקדמי.';
    } else if (err) {
      els.wakeStatus.textContent = 'לא הצלחנו לנעול את המסך כרגע. חזור לאפליקציה ונסה שוב.';
    } else {
      els.wakeStatus.textContent = '';
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && settings.wakeEnabled) {
      acquireWakeLock();
    }
  });

  // ---------- Settings panel ----------

  function openPanel() {
    els.panel.hidden = false;
  }

  function closePanel() {
    els.panel.hidden = true;
  }

  els.stage.addEventListener('click', () => {
    if (!settings.locked) openPanel();
  });
  els.closePanel.addEventListener('click', closePanel);

  els.lockToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    settings.locked = !settings.locked;
    store.set('locked', settings.locked);
    applyLockToUI();
  });

  els.toggleWake.addEventListener('change', () => {
    settings.wakeEnabled = els.toggleWake.checked;
    store.set('wakeEnabled', settings.wakeEnabled);
    if (settings.wakeEnabled) {
      acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  });

  els.toggle24h.addEventListener('change', () => {
    settings.format24h = els.toggle24h.checked;
    store.set('format24h', settings.format24h);
    renderClock();
  });

  els.toggleSeconds.addEventListener('change', () => {
    settings.showSeconds = els.toggleSeconds.checked;
    store.set('showSeconds', settings.showSeconds);
    els.seconds.hidden = !settings.showSeconds;
  });

  els.rangeDim.addEventListener('input', () => {
    settings.dim = Number(els.rangeDim.value);
    els.drift.style.setProperty('--dim', settings.dim / 100);
  });
  els.rangeDim.addEventListener('change', () => {
    store.set('dim', settings.dim);
  });

  // Brief one-time hint so first-time users know how to reach settings.
  function showHintOnce() {
    if (store.get('hintSeen', false)) return;
    els.hint.classList.add('show');
    setTimeout(() => els.hint.classList.remove('show'), 4000);
    store.set('hintSeen', true);
  }

  // ---------- Init ----------

  applySettingsToUI();
  updateWakeStatus();
  scheduleClockTick();
  scheduleDrift();
  initBattery();
  acquireWakeLock();
  showHintOnce();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
