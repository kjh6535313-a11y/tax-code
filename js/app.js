/* 화면 렌더링과 이벤트 처리 */
(function () {
  'use strict';

  const { CATEGORIES, RULES, ymd, parse, pad, holidayName } = window.TaxData;
  const Store = window.Store;
  const Alarm = window.Alarm;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayStr = () => ymd(new Date());
  const addDays = (dateStr, n) => { const d = parse(dateStr); d.setDate(d.getDate() + n); return ymd(d); };
  const fmtDate = (dateStr) => { const d = parse(dateStr); return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`; };
  const ddayText = (n) => (n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`);

  const ui = {
    view: 'today',
    day: todayStr(),
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selected: todayStr(),
    status: 'all',
    cat: '',
  };

  // ---------- 공통 ----------
  function catBadge(id) {
    const c = catOf(id);
    return `<span class="badge" style="--c:${c.color}">${esc(c.name)}</span>`;
  }

  function fillCategorySelects() {
    const opts = CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    ['#f-cat', '#e-cat', '#x-cat'].forEach((s) => { $(s).innerHTML = opts; });
    $('#f-cat').value = 'etc';
    $('#e-cat').value = 'etc';
    $('#cat-filter').innerHTML = '<option value="">모든 세목</option>' + opts;
  }

  function toast(title, body) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<strong>${esc(title)}</strong>${body ? `<p>${esc(body).replace(/\n/g, '<br>')}</p>` : ''}`;
    el.addEventListener('click', () => el.remove());
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 12000);
  }

  function showView(view) {
    ui.view = view;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    render();
  }

  function render() {
    if (ui.view === 'today') renderToday();
    else if (ui.view === 'month') renderMonth();
    else renderSettings();
  }

  function eventItem(e, opts) {
    const base = opts && opts.base;
    const d = base ? Alarm.dday(e.date, base) : null;
    const moved = e.originalDate && e.originalDate !== e.date
      ? `<span class="muted">(원래 ${fmtDate(e.originalDate)} → 휴일 연장)</span>` : '';
    const urgent = d !== null && d >= 0 && d <= 3 && !e.done ? ' urgent' : '';
    return `<li class="event${e.done ? ' done' : ''}${urgent}" data-id="${esc(e.id)}">
      <label class="check"><input type="checkbox" data-act="ev-toggle" ${e.done ? 'checked' : ''} aria-label="완료"></label>
      <div class="ev-main">
        <div class="ev-title">${d !== null ? `<span class="dday">${ddayText(d)}</span>` : ''}${catBadge(e.cat)} ${esc(e.title)}</div>
        ${opts && opts.showDate ? `<div class="muted">${fmtDate(e.date)} ${moved}</div>` : moved ? `<div>${moved}</div>` : ''}
        ${opts && opts.showDesc && e.desc ? `<div class="muted">${esc(e.desc)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="btn small" data-act="ev-task" title="이 일정을 오늘 할일로 추가">할일로</button>
        ${e.builtin ? '' : '<button class="icon-btn" data-act="ev-del" aria-label="삭제">✕</button>'}
      </div>
    </li>`;
  }

  function onEventListClick(ev) {
    const li = ev.target.closest('li.event');
    const act = ev.target.dataset.act;
    if (!li || !act) return;
    const id = li.dataset.id;
    if (act === 'ev-toggle') {
      Store.toggleEvent(id, ev.target.checked);
    } else if (act === 'ev-del') {
      if (!confirm('이 일정을 삭제할까요?')) return;
      Store.deleteEvent(id);
    } else if (act === 'ev-task') {
      const e = findEvent(id);
      if (!e) return;
      Store.addTask({ date: todayStr(), title: `${e.title} (기한 ${fmtDate(e.date)})`, cat: e.cat, client: '', time: '', priority: 'high' });
      toast('오늘 할일에 추가했습니다', e.title);
    }
    render();
  }

  function findEvent(id) {
    const m = /@(\d{4})-(\d{2})$/.exec(id);
    if (m) {
      // 기본 일정: 해당 월 ~ 다음 달(휴일 연장 고려) 범위에서 찾는다
      const start = `${m[1]}-${m[2]}-01`;
      return Store.events(start, addDays(start, 45)).find((e) => e.id === id);
    }
    const c = Store.state.customEvents.find((e) => e.id === id);
    return c && { ...c, builtin: false };
  }

  // ---------- 오늘 할일 ----------
  function renderToday() {
    const day = ui.day;
    const d = parse(day);
    const isToday = day === todayStr();
    $('#day-picker').value = day;
    const hol = holidayName(day, Store.state.settings.holidays);
    $('#day-label').innerHTML = `${WEEK[d.getDay()]}요일${isToday ? ' · <b>오늘</b>' : ''}${hol ? ` · <span class="holiday">${esc(hol)}</span>` : ''}`;

    const all = Store.tasksOn(day);
    const done = all.filter((t) => t.done).length;
    $('#progress-bar').style.width = all.length ? `${(done / all.length) * 100}%` : '0';
    $('#progress-text').textContent = `${done} / ${all.length} 완료`;

    const dueToday = Store.events(day, day);
    $('#due-today').innerHTML = dueToday.length
      ? dueToday.map((e) => eventItem(e)).join('')
      : '<li class="empty">마감 일정 없음</li>';
    const upcoming = Store.events(addDays(day, 1), addDays(day, 14)).filter((e) => !e.done);
    $('#due-upcoming').innerHTML = upcoming.length
      ? upcoming.map((e) => eventItem(e, { base: day, showDate: true })).join('')
      : '<li class="empty">14일 내 마감 없음</li>';

    const overdue = isToday ? Store.overdue(day) : [];
    $('#overdue-box').hidden = !overdue.length;
    $('#overdue-text').textContent = `지난 날짜의 미완료 할일 ${overdue.length}건`;

    let list = all.slice();
    if (ui.status === 'open') list = list.filter((t) => !t.done);
    if (ui.status === 'done') list = list.filter((t) => t.done);
    if (ui.cat) list = list.filter((t) => t.cat === ui.cat);
    const prio = { high: 0, normal: 1, low: 2 };
    list.sort((a, b) => Number(a.done) - Number(b.done)
      || prio[a.priority] - prio[b.priority]
      || (a.time || '99').localeCompare(b.time || '99'));

    $('#task-list').innerHTML = list.map(taskItem).join('');
    $('#task-empty').hidden = list.length > 0;
    $('#client-list').innerHTML = Store.clients().map((c) => `<option value="${esc(c)}">`).join('');
  }

  function taskItem(t) {
    return `<li class="task prio-${t.priority}${t.done ? ' done' : ''}" data-id="${t.id}">
      <label class="check"><input type="checkbox" data-act="toggle" ${t.done ? 'checked' : ''} aria-label="완료"></label>
      <div class="t-main">
        <div class="t-title">${t.priority === 'high' ? '<span class="star" title="중요">★</span>' : ''}${esc(t.title)}</div>
        <div class="t-meta">
          ${catBadge(t.cat)}
          ${t.client ? `<span class="client">${esc(t.client)}</span>` : ''}
          ${t.time ? `<span class="time">⏰ ${esc(t.time)}</span>` : ''}
          ${t.recurId ? '<span class="muted" title="반복 할일">↻</span>' : ''}
          ${t.memo ? `<span class="muted memo">${esc(t.memo)}</span>` : ''}
        </div>
      </div>
      <div class="actions">
        <button class="icon-btn" data-act="tomorrow" title="내일로 미루기" aria-label="내일로 미루기">→</button>
        <button class="icon-btn" data-act="edit" title="수정" aria-label="수정">✎</button>
        <button class="icon-btn" data-act="del" title="삭제" aria-label="삭제">✕</button>
      </div>
    </li>`;
  }

  function onTaskListClick(ev) {
    const li = ev.target.closest('li.task');
    const act = ev.target.dataset.act;
    if (!li || !act) return;
    const id = li.dataset.id;
    const t = Store.state.tasks.find((x) => x.id === id);
    if (!t) return;
    if (act === 'toggle') Store.updateTask(id, { done: ev.target.checked });
    else if (act === 'tomorrow') { Store.updateTask(id, { date: addDays(t.date, 1) }); toast('내일로 미뤘습니다', t.title); }
    else if (act === 'edit') return openEdit(t);
    else if (act === 'del') {
      if (!confirm(t.recurId ? '이 날짜의 반복 할일만 삭제합니다. (반복 전체는 설정에서 삭제)' : '삭제할까요?')) return;
      Store.deleteTask(id);
    }
    renderToday();
  }

  function openEdit(t) {
    const dlg = $('#edit-dialog');
    $('#x-title').value = t.title;
    $('#x-date').value = t.date;
    $('#x-time').value = t.time || '';
    $('#x-cat').value = t.cat;
    $('#x-priority').value = t.priority;
    $('#x-client').value = t.client || '';
    $('#x-memo').value = t.memo || '';
    dlg.dataset.id = t.id;
    dlg.showModal();
  }

  function onEditClose() {
    const dlg = $('#edit-dialog');
    if (dlg.returnValue !== 'save') return;
    Store.updateTask(dlg.dataset.id, {
      title: $('#x-title').value.trim(),
      date: $('#x-date').value,
      time: $('#x-time').value,
      cat: $('#x-cat').value,
      priority: $('#x-priority').value,
      client: $('#x-client').value.trim(),
      memo: $('#x-memo').value.trim(),
    });
    renderToday();
  }

  function onTaskSubmit(ev) {
    ev.preventDefault();
    const title = $('#f-title').value.trim();
    if (!title) return;
    const time = $('#f-time').value;
    const now = new Date();
    const past = ui.day === todayStr() && time && time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    Store.addTask({
      date: ui.day, title, time,
      cat: $('#f-cat').value,
      client: $('#f-client').value.trim(),
      priority: $('#f-priority').value,
      repeat: $('#f-repeat').value,
      notified: past, // 이미 지난 시간이면 바로 울리지 않게
    });
    $('#f-title').value = '';
    $('#f-time').value = '';
    $('#f-repeat').value = 'none';
    $('#f-priority').value = 'normal';
    $('#f-title').focus();
    renderToday();
  }

  // ---------- 월별 세무일정 ----------
  function renderMonth() {
    const y = ui.month.getFullYear();
    const m = ui.month.getMonth();
    $('#month-label').textContent = `${y}년 ${m + 1}월`;

    const first = new Date(y, m, 1);
    const gridStart = new Date(y, m, 1 - first.getDay());
    const gridEnd = new Date(y, m + 1, 0);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
    const evs = Store.events(ymd(gridStart), ymd(gridEnd));
    const byDate = {};
    evs.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const taskCount = {};
    Store.state.tasks.forEach((t) => { if (!t.done) taskCount[t.date] = (taskCount[t.date] || 0) + 1; });

    const today = todayStr();
    const hols = Store.state.settings.holidays;
    let html = '';
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      const ds = ymd(d);
      const hol = holidayName(ds, hols);
      const cls = ['cell'];
      if (d.getMonth() !== m) cls.push('other');
      if (ds === today) cls.push('today');
      if (ds === ui.selected) cls.push('selected');
      if (d.getDay() === 0 || hol) cls.push('sun');
      else if (d.getDay() === 6) cls.push('sat');
      const list = byDate[ds] || [];
      html += `<button class="${cls.join(' ')}" data-date="${ds}" aria-label="${ds} 일정 ${list.length}건">
        <span class="num">${d.getDate()}</span>${hol ? `<span class="hol">${esc(hol)}</span>` : ''}
        ${taskCount[ds] ? `<span class="tcount" title="미완료 할일">${taskCount[ds]}</span>` : ''}
        <span class="chips">${list.slice(0, 3).map((e) => `<span class="chip${e.done ? ' done' : ''}" style="--c:${catOf(e.cat).color}">${esc(e.title)}</span>`).join('')}
        ${list.length > 3 ? `<span class="more">+${list.length - 3}</span>` : ''}</span>
      </button>`;
    }
    $('#calendar').innerHTML = html;

    renderSelected();

    const monthStart = ymd(first);
    const monthEnd = ymd(new Date(y, m + 1, 0));
    const monthEvs = evs.filter((e) => e.date >= monthStart && e.date <= monthEnd);
    $('#month-events').innerHTML = monthEvs.length
      ? monthEvs.map((e) => eventItem(e, { base: today, showDate: true, showDesc: true })).join('')
      : '<li class="empty">일정 없음</li>';
  }

  function renderSelected() {
    const ds = ui.selected;
    const hol = holidayName(ds, Store.state.settings.holidays);
    $('#sel-label').textContent = `${fmtDate(ds)}${hol ? ' · ' + hol : ''}`;
    const evs = Store.events(ds, ds);
    $('#sel-events').innerHTML = evs.map((e) => eventItem(e, { showDesc: true })).join('');
    $('#sel-empty').hidden = evs.length > 0;
  }

  function onEventSubmit(ev) {
    ev.preventDefault();
    const title = $('#e-title').value.trim();
    if (!title) return;
    Store.addEvent({ date: ui.selected, title, cat: $('#e-cat').value, memo: $('#e-memo').value.trim() });
    $('#e-title').value = '';
    $('#e-memo').value = '';
    renderMonth();
  }

  function exportIcs() {
    const y = ui.month.getFullYear();
    const evs = Store.events(`${y}-01-01`, `${y}-12-31`);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const fold = (s) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tax-todo//KO', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:세무일정 ${y}`];
    for (const e of evs) {
      const start = e.date.replace(/-/g, '');
      const end = addDays(e.date, 1).replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${e.id}@tax-todo`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:[${catOf(e.cat).name}] ${fold(e.title)}`,
        `DESCRIPTION:${fold(e.desc || '')}`,
        // D-3 오전 9시, 당일 오전 9시 알림
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${fold(e.title)} D-3`, 'TRIGGER:-P2DT15H', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${fold(e.title)} 오늘 마감`, 'TRIGGER:PT9H', 'END:VALARM',
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    download(`세무일정_${y}.ics`, lines.join('\r\n'), 'text/calendar');
    toast(`${y}년 세무일정 ${evs.length}건을 내보냈습니다`, '파일을 휴대폰/구글/아웃룩 캘린더에서 열면 알림과 함께 등록됩니다.');
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- 설정 ----------
  function renderSettings() {
    const s = Store.state.settings;
    $('#s-daily').checked = s.dailyAlarm;
    $('#s-daily-time').value = s.dailyTime;
    $('#s-task').checked = s.taskAlarm;
    $('#s-sound').checked = s.sound;
    $$('.s-remind').forEach((c) => { c.checked = s.remind.includes(Number(c.value)); });

    const perm = Alarm.permission();
    $('#s-perm-status').textContent = {
      granted: '✅ 브라우저 알림이 허용되어 있습니다.',
      denied: '⛔ 알림이 차단되어 있습니다. 브라우저 주소창의 사이트 설정에서 알림을 허용해 주세요.',
      default: '알림 허용 버튼을 눌러 주세요. 허용하지 않아도 화면 안 알림과 소리는 동작합니다.',
      unsupported: '이 브라우저는 시스템 알림을 지원하지 않습니다. 화면 안 알림과 소리로 알려드립니다.',
    }[perm];
    $('#s-permission').hidden = perm === 'granted' || perm === 'unsupported';

    $('#rule-list').innerHTML = RULES.map((r) => {
      const when = r.months ? `${r.months.join(',')}월 ${r.day === 'end' ? '말일' : r.day + '일'}` : `매월 ${r.day === 'end' ? '말일' : r.day + '일'}`;
      return `<li><label><input type="checkbox" data-rule="${r.id}" ${s.hiddenRules.includes(r.id) ? '' : 'checked'}>
        ${catBadge(r.cat)} ${esc(r.title)} <span class="muted">${when}</span></label></li>`;
    }).join('');

    const rec = Store.state.recurring;
    const rname = { daily: '매일', weekdays: '평일', weekly: '매주', monthly: '매월' };
    $('#recurring-list').innerHTML = rec.map((r) => `<li>
      <span>${catBadge(r.cat)} ${esc(r.title)} <span class="muted">${rname[r.repeat]}${r.time ? ' ' + esc(r.time) : ''} · ${r.start}부터</span></span>
      <button class="icon-btn" data-rec="${r.id}" aria-label="반복 삭제">✕</button></li>`).join('');
    $('#recurring-empty').hidden = rec.length > 0;

    $('#holiday-list').innerHTML = Object.keys(s.holidays).sort().map((d) => `<li>
      <span>${d} ${esc(s.holidays[d])}</span><button class="icon-btn" data-hol="${d}" aria-label="삭제">✕</button></li>`).join('');
  }

  function bindSettings() {
    const s = () => Store.state.settings;
    $('#s-daily').addEventListener('change', (e) => { s().dailyAlarm = e.target.checked; Store.save(); });
    $('#s-daily-time').addEventListener('change', (e) => {
      s().dailyTime = e.target.value || '09:00';
      // 오늘 알람 시간을 뒤로 바꾸면 오늘도 다시 울리게
      const now = new Date();
      if (s().dailyTime > `${pad(now.getHours())}:${pad(now.getMinutes())}`) s().lastBriefing = '';
      Store.save();
    });
    $('#s-task').addEventListener('change', (e) => { s().taskAlarm = e.target.checked; Store.save(); });
    $('#s-sound').addEventListener('change', (e) => { s().sound = e.target.checked; Store.save(); });
    $$('.s-remind').forEach((c) => c.addEventListener('change', () => {
      s().remind = [...$$('.s-remind')].filter((x) => x.checked).map((x) => Number(x.value));
      Store.save();
    }));
    $('#s-permission').addEventListener('click', async () => { await Alarm.requestPermission(); renderSettings(); });
    $('#s-test').addEventListener('click', () => Alarm.notify('오늘의 세무 브리핑 (테스트)', Alarm.briefing(todayStr()), 'test'));

    $('#rule-list').addEventListener('change', (e) => {
      const id = e.target.dataset.rule;
      if (!id) return;
      const h = new Set(s().hiddenRules);
      if (e.target.checked) h.delete(id); else h.add(id);
      s().hiddenRules = [...h];
      Store.save();
    });
    $('#recurring-list').addEventListener('click', (e) => {
      const id = e.target.dataset.rec;
      if (!id || !confirm('이 반복 할일을 삭제할까요? (오늘 이후 미완료 항목도 함께 삭제)')) return;
      Store.deleteRecurring(id);
      renderSettings();
    });
    $('#holiday-form').addEventListener('submit', (e) => {
      e.preventDefault();
      s().holidays[$('#h-date').value] = $('#h-name').value.trim();
      Store.save();
      e.target.reset();
      renderSettings();
    });
    $('#holiday-list').addEventListener('click', (e) => {
      const d = e.target.dataset.hol;
      if (!d) return;
      delete s().holidays[d];
      Store.save();
      renderSettings();
    });

    $('#d-export').addEventListener('click', () => {
      download(`세무투두_백업_${todayStr()}.json`, JSON.stringify(Store.state, null, 2), 'application/json');
    });
    $('#d-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.tasks)) throw new Error('형식 오류');
        if (!confirm('현재 데이터를 백업 파일로 덮어쓸까요?')) return;
        Store.replaceAll(data);
        toast('복원했습니다');
        render();
      } catch (err) {
        toast('복원 실패', '올바른 백업 파일이 아닙니다.');
      } finally {
        e.target.value = '';
      }
    });
    $('#d-reset').addEventListener('click', () => {
      if (!confirm('모든 할일·일정·설정을 삭제합니다. 계속할까요?')) return;
      Store.reset();
      render();
    });
  }

  // ---------- 초기화 ----------
  function bind() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

    $('#day-prev').addEventListener('click', () => { ui.day = addDays(ui.day, -1); renderToday(); });
    $('#day-next').addEventListener('click', () => { ui.day = addDays(ui.day, 1); renderToday(); });
    $('#day-today').addEventListener('click', () => { ui.day = todayStr(); renderToday(); });
    $('#day-picker').addEventListener('change', (e) => { if (e.target.value) { ui.day = e.target.value; renderToday(); } });
    $('#task-form').addEventListener('submit', onTaskSubmit);
    $('#task-list').addEventListener('change', onTaskListClick);
    $('#task-list').addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') onTaskListClick(e); });
    $('#edit-dialog').addEventListener('close', onEditClose);
    $('#overdue-pull').addEventListener('click', () => {
      const today = todayStr();
      Store.overdue(today).forEach((t) => Store.updateTask(t.id, { date: today }));
      renderToday();
    });
    $('#status-filter').addEventListener('click', (e) => {
      if (!e.target.dataset.v) return;
      ui.status = e.target.dataset.v;
      $$('#status-filter button').forEach((b) => b.classList.toggle('on', b === e.target));
      renderToday();
    });
    $('#cat-filter').addEventListener('change', (e) => { ui.cat = e.target.value; renderToday(); });

    ['#due-today', '#due-upcoming', '#sel-events', '#month-events'].forEach((s) => {
      $(s).addEventListener('change', onEventListClick);
      $(s).addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') onEventListClick(e); });
    });

    const shiftMonth = (n) => { ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + n, 1); renderMonth(); };
    $('#month-prev').addEventListener('click', () => shiftMonth(-1));
    $('#month-next').addEventListener('click', () => shiftMonth(1));
    $('#month-today').addEventListener('click', () => {
      const now = new Date();
      ui.month = new Date(now.getFullYear(), now.getMonth(), 1);
      ui.selected = todayStr();
      renderMonth();
    });
    $('#calendar').addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (!cell) return;
      ui.selected = cell.dataset.date;
      const d = parse(ui.selected);
      if (d.getMonth() !== ui.month.getMonth()) ui.month = new Date(d.getFullYear(), d.getMonth(), 1);
      renderMonth();
    });
    $('#sel-goto').addEventListener('click', () => { ui.day = ui.selected; showView('today'); });
    $('#event-form').addEventListener('submit', onEventSubmit);
    $('#ics-export').addEventListener('click', exportIcs);

    bindSettings();

    // 자정이 지나면 오늘 화면을 새 날짜로
    let lastDay = todayStr();
    setInterval(() => {
      const t = todayStr();
      if (t !== lastDay) {
        if (ui.day === lastDay) ui.day = t;
        lastDay = t;
        render();
      }
    }, 60 * 1000);
  }

  fillCategorySelects();
  bind();
  render();
  Alarm.init((title, body) => { toast(title, body); if (ui.view === 'today') renderToday(); });
})();
