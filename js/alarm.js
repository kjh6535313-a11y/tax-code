/* 알람: 매일 브리핑 + 할일 시간 알림 */
(function (global) {
  'use strict';

  const { ymd, parse, pad } = global.TaxData;
  let swReg = null;
  let onToast = () => {};

  function init(toastFn) {
    onToast = toastFn;
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
    }
    tick();
    setInterval(tick, 20 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  }

  function permission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.requestPermission();
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.22);
      });
    } catch (e) { /* 소리 재생 불가 환경 */ }
  }

  function notify(title, body, tag) {
    const s = global.Store.state.settings;
    if (s.sound) beep();
    onToast(title, body);
    if (permission() !== 'granted') return;
    const opts = { body, tag, icon: 'icon.svg', badge: 'icon.svg', renotify: true };
    if (swReg && swReg.showNotification) {
      swReg.showNotification(title, opts).catch(() => new Notification(title, opts));
    } else {
      try { new Notification(title, opts); } catch (e) { /* 모바일 등 생성자 미지원 */ }
    }
  }

  function dday(dateStr, today) {
    return Math.round((parse(dateStr) - parse(today)) / 86400000);
  }

  function briefing(today) {
    const Store = global.Store;
    const s = Store.state.settings;
    const tasks = Store.tasksOn(today);
    const open = tasks.filter((t) => !t.done);
    const overdue = Store.overdue(today);
    const maxDay = Math.max(0, ...s.remind);
    const end = new Date(parse(today));
    end.setDate(end.getDate() + maxDay);
    const evs = Store.events(today, ymd(end))
      .filter((e) => !e.done && s.remind.includes(dday(e.date, today)));

    const lines = [];
    lines.push(`할일 ${open.length}건` + (overdue.length ? ` · 지난 미완료 ${overdue.length}건` : ''));
    for (const e of evs) {
      const d = dday(e.date, today);
      lines.push(`${d === 0 ? '오늘 마감' : 'D-' + d} ${e.title}`);
    }
    return lines.join('\n');
  }

  function tick() {
    const Store = global.Store;
    const s = Store.state.settings;
    const now = new Date();
    const today = ymd(now);
    const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    if (s.dailyAlarm && hm >= s.dailyTime && s.lastBriefing !== today) {
      s.lastBriefing = today;
      Store.save();
      notify('오늘의 세무 브리핑', briefing(today), 'daily-' + today);
    }

    if (s.taskAlarm) {
      for (const t of Store.tasksOn(today)) {
        if (!t.done && t.time && !t.notified && t.time <= hm) {
          t.notified = true;
          Store.save();
          notify(`⏰ ${t.time} ${t.title}`, [t.client, t.memo].filter(Boolean).join(' · ') || '할일 알림', 'task-' + t.id);
        }
      }
    }
  }

  global.Alarm = { init, permission, requestPermission, notify, briefing, dday };
})(window);
