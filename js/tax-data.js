/* 세무 일정 데이터와 신고기한 계산 (휴일이면 다음 영업일로 연장) */
(function (global) {
  'use strict';

  const CATEGORIES = [
    { id: 'vat', name: '부가세', color: '#2563eb' },
    { id: 'wht', name: '원천세', color: '#0891b2' },
    { id: 'corp', name: '법인세', color: '#7c3aed' },
    { id: 'inc', name: '종소세', color: '#db2777' },
    { id: 'stmt', name: '지급명세서', color: '#ea580c' },
    { id: 'ins', name: '4대보험', color: '#16a34a' },
    { id: 'local', name: '지방세', color: '#b45309' },
    { id: 'book', name: '기장', color: '#475569' },
    { id: 'client', name: '상담·민원', color: '#0d9488' },
    { id: 'etc', name: '기타', color: '#6b7280' },
  ];

  // 공휴일 (대체공휴일 포함). 근로자의 날(5/1)은 국세기본법상 기한 연장 사유라 포함.
  // 설정 화면에서 공휴일을 추가할 수 있습니다.
  const HOLIDAYS = {
    '2026-01-01': '신정',
    '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
    '2026-03-01': '삼일절', '2026-03-02': '대체공휴일',
    '2026-05-01': '근로자의 날', '2026-05-05': '어린이날',
    '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
    '2026-06-03': '지방선거일', '2026-06-06': '현충일',
    '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
    '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
    '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날',
    '2026-12-25': '성탄절',
    '2027-01-01': '신정',
    '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴', '2027-02-09': '대체공휴일',
    '2027-03-01': '삼일절',
    '2027-05-01': '근로자의 날', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날',
    '2027-06-06': '현충일',
    '2027-08-15': '광복절', '2027-08-16': '대체공휴일',
    '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
    '2027-10-03': '개천절', '2027-10-04': '대체공휴일',
    '2027-10-09': '한글날', '2027-10-11': '대체공휴일',
    '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
  };

  // months: null이면 매월. day: 숫자 또는 'end'(말일)
  const RULES = [
    { id: 'wht-m', months: null, day: 10, cat: 'wht', title: '원천세 신고·납부 (월별납부)', desc: '전월 지급분 원천징수세액 신고·납부 (반기납부 승인자는 제외)' },
    { id: 'ins-m', months: null, day: 10, cat: 'ins', title: '4대보험료 납부', desc: '전월분 건강·연금·고용·산재보험료 납부' },
    { id: 'stmt-m', months: null, day: 'end', cat: 'stmt', title: '간이·일용 지급명세서 제출', desc: '전월 지급분 사업소득·인적용역 기타소득 간이지급명세서, 일용근로소득 지급명세서 제출' },

    { id: 'wht-h2', months: [1], day: 10, cat: 'wht', title: '원천세 반기납부 (하반기분)', desc: '반기납부 승인자: 전년 7~12월 지급분 신고·납부' },
    { id: 'vat-2f', months: [1], day: 25, cat: 'vat', title: '부가세 2기 확정신고·납부', desc: '전년 7~12월(법인은 10~12월) 과세기간분' },
    { id: 'stmt-h2', months: [1], day: 'end', cat: 'stmt', title: '근로소득 간이지급명세서 (하반기)', desc: '전년 7~12월 근로소득 지급분 (월별 제출 전환 여부 확인)' },
    { id: 'exempt', months: [2], day: 10, cat: 'inc', title: '면세사업자 사업장현황신고', desc: '전년도 면세 수입금액 등 신고' },
    { id: 'yearend-prep', months: [2], day: 'end', cat: 'wht', title: '연말정산 완료 (2월 급여)', desc: '2월분 급여 지급 시 연말정산 반영' },
    { id: 'stmt-y', months: [2], day: 'end', cat: 'stmt', title: '이자·배당·기타소득 지급명세서', desc: '전년 지급분 제출' },
    { id: 'yearend', months: [3], day: 10, cat: 'wht', title: '연말정산분 원천세 신고·지급명세서', desc: '연말정산 반영 원천세 신고·납부 및 근로·퇴직·사업소득 지급명세서 제출' },
    { id: 'ins-hi', months: [3], day: 10, cat: 'ins', title: '건강보험 보수총액 통보', desc: '전년도 근로자 보수총액 통보' },
    { id: 'ins-ei', months: [3], day: 15, cat: 'ins', title: '고용·산재보험 보수총액신고', desc: '전년도 보수총액 신고' },
    { id: 'corp-f', months: [3], day: 'end', cat: 'corp', title: '법인세 신고·납부 (12월 결산)', desc: '12월 결산법인 (성실신고확인 대상 법인은 4월 30일)' },
    { id: 'vat-1p', months: [4], day: 25, cat: 'vat', title: '부가세 1기 예정신고·납부', desc: '1~3월분 (법인 예정신고 / 개인 예정고지 납부)' },
    { id: 'corp-local', months: [4], day: 'end', cat: 'local', title: '법인지방소득세 신고·납부', desc: '12월 결산법인' },
    { id: 'inc-f', months: [5], day: 'end', cat: 'inc', title: '종합소득세 확정신고·납부', desc: '전년 귀속 종합소득세·개인지방소득세 (성실신고확인대상은 6월 30일)' },
    { id: 'eitc', months: [5], day: 'end', cat: 'inc', title: '근로·자녀장려금 정기신청', desc: '전년 소득분 정기신청' },
    { id: 'inc-sincere', months: [6], day: 30, cat: 'inc', title: '성실신고확인대상 종합소득세', desc: '성실신고확인서 제출 대상 개인사업자' },
    { id: 'fbar', months: [6], day: 30, cat: 'etc', title: '해외금융계좌 신고', desc: '전년도 매월 말일 중 하루라도 잔액 합계 5억원 초과 시' },
    { id: 'wht-h1', months: [7], day: 10, cat: 'wht', title: '원천세 반기납부 (상반기분)', desc: '반기납부 승인자: 1~6월 지급분 신고·납부' },
    { id: 'vat-1f', months: [7], day: 25, cat: 'vat', title: '부가세 1기 확정신고·납부', desc: '1~6월(법인은 4~6월) 과세기간분' },
    { id: 'stmt-h1', months: [7], day: 'end', cat: 'stmt', title: '근로소득 간이지급명세서 (상반기)', desc: '1~6월 근로소득 지급분 (월별 제출 전환 여부 확인)' },
    { id: 'prop-1', months: [7], day: 'end', cat: 'local', title: '재산세 1기 납부', desc: '건축물·주택(1/2)분' },
    { id: 'corp-mid', months: [8], day: 'end', cat: 'corp', title: '법인세 중간예납', desc: '12월 결산법인 상반기분 중간예납 신고·납부' },
    { id: 'resident', months: [8], day: 'end', cat: 'local', title: '주민세(사업소분) 신고·납부', desc: '7월 1일 기준 사업소' },
    { id: 'prop-2', months: [9], day: 30, cat: 'local', title: '재산세 2기 납부', desc: '토지·주택(1/2)분' },
    { id: 'vat-2p', months: [10], day: 25, cat: 'vat', title: '부가세 2기 예정신고·납부', desc: '7~9월분 (법인 예정신고 / 개인 예정고지 납부)' },
    { id: 'inc-mid', months: [11], day: 30, cat: 'inc', title: '종합소득세 중간예납', desc: '고지서 납부 (중간예납 추계액 신고 가능)' },
    { id: 'cprt', months: [12], day: 15, cat: 'etc', title: '종합부동산세 납부', desc: '12월 1일~15일 고지 또는 신고 납부' },
  ];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

  function holidayName(dateStr, extra) {
    return (extra && extra[dateStr]) || HOLIDAYS[dateStr] || '';
  }

  function isBusinessDay(date, extra) {
    const w = date.getDay();
    return w !== 0 && w !== 6 && !holidayName(ymd(date), extra);
  }

  function toBusinessDay(date, extra) {
    const d = new Date(date);
    while (!isBusinessDay(d, extra)) d.setDate(d.getDate() + 1);
    return d;
  }

  function monthEvents(year, month, hidden, extra) {
    const last = new Date(year, month, 0).getDate();
    return RULES
      .filter((r) => (!r.months || r.months.includes(month)) && !hidden.includes(r.id))
      .map((r) => {
        const base = new Date(year, month - 1, r.day === 'end' ? last : r.day);
        const due = toBusinessDay(base, extra);
        return {
          id: `${r.id}@${year}-${pad(month)}`,
          ruleId: r.id,
          date: ymd(due),
          originalDate: ymd(base),
          title: r.title,
          desc: r.desc,
          cat: r.cat,
          builtin: true,
        };
      });
  }

  // start~end(포함, 'YYYY-MM-DD') 사이에 기한이 걸리는 기본 세무일정
  function eventsInRange(start, end, opts) {
    const hidden = (opts && opts.hidden) || [];
    const extra = (opts && opts.holidays) || {};
    const s = parse(start);
    const e = parse(end);
    const out = [];
    // 휴일 연장으로 다음 달로 넘어오는 일정을 위해 한 달 앞부터 생성
    const cur = new Date(s.getFullYear(), s.getMonth() - 1, 1);
    while (cur <= e) {
      for (const ev of monthEvents(cur.getFullYear(), cur.getMonth() + 1, hidden, extra)) {
        if (ev.date >= start && ev.date <= end) out.push(ev);
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }

  global.TaxData = {
    CATEGORIES, HOLIDAYS, RULES,
    pad, ymd, parse, holidayName, isBusinessDay, toBusinessDay, eventsInRange,
  };
})(window);
