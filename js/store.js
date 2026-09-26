/* 데이터 저장소 (localStorage) */
(function (global) {
  'use strict';

  const KEY = 'taxTodo.v1';
  const { ymd, parse, eventsInRange } = global.TaxData;

  const defaults = () => ({
    version: 1,
    tasks: [],          // {id, date, title, cat, client, time, priority, memo, done, recurId, notified}
    recurring: [],      // {id, title, cat, client, time, priority, repeat, start, skip: []}
    customEvents: [],   // {id, date, title, cat, memo}
    doneEvents: {},     // {eventId: true}
    settings: {
      dailyAlarm: true,
      dailyTime: '09:00',
      remind: [7, 3, 1, 0],
      taskAlarm: true,
      sound: true,
      hiddenRules: [],
      holidays: {},
      lastBriefing: '',
    },
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const data = JSON.parse(raw);
      const base = defaults();
      return { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
    } catch (e) {
      return defaults();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('저장 실패', e);
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---- 반복 할일 ----
  function repeatMatches(r, dateStr) {
    if (dateStr < r.start || (r.skip || []).includes(dateStr)) return false;
    const d = parse(dateStr);
    const s = parse(r.start);
    switch (r.repeat) {
      case 'daily': return true;
      case 'weekdays': return d.getDay() !== 0 && d.getDay() !== 6;
      case 'weekly': return d.getDay() === s.getDay();
      case 'monthly': {
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        return d.getDate() === Math.min(s.getDate(), last);
      }
      default: return false;
    }
  }

  // 해당 날짜의 반복 할일 인스턴스를 만들어 둔다
  function materialize(dateStr) {
    let changed = false;
    for (const r of state.recurring) {
      if (!repeatMatches(r, dateStr)) continue;
      if (state.tasks.some((t) => t.recurId === r.id && t.date === dateStr)) continue;
      state.tasks.push({
        id: uid(), date: dateStr, title: r.title, cat: r.cat, client: r.client,
        time: r.time, priority: r.priority, memo: '', done: false, recurId: r.id,
      });
      changed = true;
    }
    if (changed) save();
  }

  function tasksOn(dateStr) {
    materialize(dateStr);
    return state.tasks.filter((t) => t.date === dateStr);
  }

  function addTask(data) {
    if (data.repeat && data.repeat !== 'none') {
      state.recurring.push({
        id: uid(), title: data.title, cat: data.cat, client: data.client,
        time: data.time, priority: data.priority, repeat: data.repeat,
        start: data.date, skip: [],
      });
      save();
      materialize(data.date);
      return;
    }
    state.tasks.push({ id: uid(), done: false, memo: '', ...data, repeat: undefined });
    save();
  }

  function updateTask(id, patch) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.recurId && patch.date && patch.date !== t.date) {
      // 반복 인스턴스를 다른 날로 옮기면 원래 날짜에 다시 생기지 않도록 건너뛴다
      const r = state.recurring.find((x) => x.id === t.recurId);
      if (r) r.skip = [...(r.skip || []), t.date];
    }
    Object.assign(t, patch);
    if ('time' in patch || 'date' in patch) t.notified = false;
    save();
  }

  function deleteTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.recurId) {
      const r = state.recurring.find((x) => x.id === t.recurId);
      if (r) r.skip = [...(r.skip || []), t.date];
    }
    state.tasks = state.tasks.filter((x) => x.id !== id);
    save();
  }

  function deleteRecurring(id) {
    state.recurring = state.recurring.filter((r) => r.id !== id);
    // 오늘 이후 미완료 인스턴스 정리
    const today = ymd(new Date());
    state.tasks = state.tasks.filter((t) => !(t.recurId === id && t.date >= today && !t.done));
    save();
  }

  function overdue(beforeDate) {
    return state.tasks.filter((t) => t.date < beforeDate && !t.done);
  }

  function clients() {
    return [...new Set(state.tasks.map((t) => t.client).filter(Boolean))].sort();
  }

  // ---- 세무일정 (기본 + 사용자) ----
  function events(start, end) {
    const s = state.settings;
    const builtin = eventsInRange(start, end, { hidden: s.hiddenRules, holidays: s.holidays });
    const custom = state.customEvents
      .filter((e) => e.date >= start && e.date <= end)
      .map((e) => ({ ...e, desc: e.memo, builtin: false }));
    return [...builtin, ...custom]
      .map((e) => ({ ...e, done: !!state.doneEvents[e.id] }))
      .sort((a, b) => a.date.localeCompare(b.date) || Number(b.builtin) - Number(a.builtin));
  }

  function addEvent(data) {
    state.customEvents.push({ id: 'c-' + uid(), ...data });
    save();
  }

  function deleteEvent(id) {
    state.customEvents = state.customEvents.filter((e) => e.id !== id);
    delete state.doneEvents[id];
    save();
  }

  function toggleEvent(id, done) {
    if (done) state.doneEvents[id] = true;
    else delete state.doneEvents[id];
    save();
  }

  function replaceAll(data) {
    const base = defaults();
    state = { ...base, ...data, settings: { ...base.settings, ...(data.settings || {}) } };
    save();
  }

  function reset() {
    state = defaults();
    save();
  }

  global.Store = {
    get state() { return state; },
    save, uid, tasksOn, addTask, updateTask, deleteTask, deleteRecurring,
    overdue, clients, events, addEvent, deleteEvent, toggleEvent, replaceAll, reset,
  };
})(window);
