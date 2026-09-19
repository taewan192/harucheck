'use strict';
// Run under several TZ values to ensure date logic does not depend on Seoul.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const R = require('../src/reminder-core.js');
const base = { id: 'test-event', title: '준비', date: '2027-01-01', time: '02:00', status: 'pending' };
const event = (reminder, changes = {}) => ({ ...base, reminder, ...changes });
const utc = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const unfold = text => text.replace(/\r\n[ \t]/g, '');

test('all ten half-hour presets and at-start are valid and resolve correctly', () => {
  const starts = R.parseLocal(base.date + 'T' + base.time);
  for (let minutes = 0; minutes <= 300; minutes += 30) {
    const reminder = { kind: 'offset', minutes };
    assert.equal(R.isValid(reminder), true);
    assert.equal(R.resolve(event(reminder)), starts - minutes * 60000);
  }
  assert.equal(R.describe({ kind: 'offset', minutes: 30 }), '30분 전');
  assert.equal(R.describe({ kind: 'offset', minutes: 90 }), '1시간 30분 전');
  assert.equal(R.describe({ kind: 'offset', minutes: 300 }), '5시간 전');
  assert.equal(R.describe({ kind: 'offset', minutes: 0 }), '일정 시작 시간');
});

test('offsets correctly cross day, month, and year boundaries', () => {
  assert.equal(R.resolve(event({ kind: 'offset', minutes: 300 })), R.parseLocal('2026-12-31T21:00'));
  assert.equal(R.resolve(event({ kind: 'offset', minutes: 30 }, { date: '2026-03-01', time: '00:00' })), R.parseLocal('2026-02-28T23:30'));
});

test('strict local parsing accepts leap days and rejects normalized invalid dates', () => {
  for (const value of ['2026-02-29T12:00', '2027-04-31T12:00', '2027-13-01T12:00', '2027-00-01T12:00', '2027-01-00T12:00', '2027-01-01T24:00', '2027-01-01T12:60', '2027-01-01', '2027-1-1T1:00', '2027-01-01T12:00Z', '2027-01-01T12:00:00', '', null, 123, '0000-01-01T12:00']) assert.equal(Number.isNaN(R.parseLocal(value)), true, String(value));
  assert.equal(new Date(R.parseLocal('2028-02-29T12:00')).getDate(), 29);
  assert.equal(new Date(R.parseLocal('0099-01-01T12:00')).getFullYear(), 99);
});

test('bad reminder formats cannot silently enable an alarm', () => {
  for (const reminder of [{}, [], true, { kind: 'offset', minutes: 15 }, { kind: 'offset', minutes: -30 }, { kind: 'offset', minutes: 330 }, { kind: 'offset', minutes: '60' }, { kind: 'offset', minutes: NaN }, { kind: 'custom', at: '2027-02-29T10:00' }]) {
    assert.equal(R.isValid(reminder), false);
    assert.equal(Number.isNaN(R.resolve(event(reminder))), true);
  }
});

test('custom reminders work independently of an event time', () => {
  const reminder = { kind: 'custom', at: '2026-12-31T18:45' };
  assert.equal(R.isValid(reminder), true);
  assert.equal(R.resolve(event(reminder, { time: '' })), R.parseLocal(reminder.at));
  assert.equal(R.describe(reminder), '직접 설정 2026.12.31 18:45');
  assert.equal(Number.isNaN(R.resolve(event({ kind: 'offset', minutes: 30 }, { time: '' }))), true);
});

test('no reminder is valid but never resolves or produces a token', () => {
  for (const reminder of [null, undefined]) {
    assert.equal(R.isValid(reminder), true);
    assert.equal(Number.isNaN(R.resolve(event(reminder))), true);
    assert.equal(R.token(event(reminder)), '');
    assert.equal(R.describe(reminder), '알림 없음');
  }
});

test('due events include 24-hour boundary, suppress future, stale and terminal statuses', () => {
  const now = R.parseLocal('2026-12-31T18:00');
  const candidates = [
    event({ kind: 'custom', at: '2026-12-31T18:00' }, { id: 'now' }),
    event({ kind: 'custom', at: '2026-12-30T18:00' }, { id: 'boundary' }),
    event({ kind: 'custom', at: '2026-12-30T17:59' }, { id: 'stale' }),
    event({ kind: 'custom', at: '2026-12-31T18:01' }, { id: 'future' }),
    event({ kind: 'custom', at: '2026-12-31T18:00' }, { id: 'done', status: 'done' }),
    event({ kind: 'custom', at: '2026-12-31T18:00' }, { id: 'failed', status: 'failed' }),
    event(null), null
  ];
  assert.deepEqual(R.dueEvents(candidates, {}, now).map(item => item.id), ['now', 'boundary']);
  assert.deepEqual(R.dueEvents(candidates, {}, NaN), []);
});

test('receipts and duplicate tokens suppress duplicates; rescheduling creates a new token', () => {
  const old = event({ kind: 'offset', minutes: 60 });
  const changed = event({ kind: 'offset', minutes: 30 });
  const now = R.parseLocal(base.date + 'T' + base.time);
  assert.notEqual(R.token(old), R.token(changed));
  for (const receipts of [new Set([R.token(old)]), [R.token(old)], { [R.token(old)]: now }]) {
    assert.deepEqual(R.dueEvents([old, changed, changed], receipts, now), [changed]);
  }
});

test('timed ICS is UTC, with one-hour end and absolute offset alarm', () => {
  const item = event({ kind: 'offset', minutes: 300 });
  const now = R.parseLocal('2026-09-19T12:00');
  const ics = R.toICS(item, now);
  const starts = R.parseLocal(item.date + 'T' + item.time);
  assert.ok(ics.includes('DTSTAMP:' + utc(now) + '\r\n'));
  assert.ok(ics.includes('DTSTART:' + utc(starts) + '\r\n'));
  assert.ok(ics.includes('DTEND:' + utc(starts + 3600000) + '\r\n'));
  assert.ok(ics.includes('TRIGGER;VALUE=DATE-TIME:' + utc(starts - 300 * 60000) + '\r\n'));
  assert.ok(ics.includes('ACTION:DISPLAY\r\n'));
  assert.equal(/(?<!\r)\n|\r(?!\n)/.test(ics), false);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('untimed ICS uses all-day exclusive end, preserving the date and custom alarm', () => {
  const item = event({ kind: 'custom', at: '2026-12-31T20:45' }, { date: '2026-12-31', time: '' });
  const ics = R.toICS(item, 0);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261231\r\n'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270101\r\n'));
  assert.ok(ics.includes('TRIGGER;VALUE=DATE-TIME:' + utc(R.resolve(item)) + '\r\n'));
});

test('ICS escapes TEXT and folds Unicode lines at at most 75 UTF-8 octets', () => {
  const title = '회의, 식사; 메모\\경로\n다음 줄 ' + '한글🙂'.repeat(40) + '\r\nEND:VEVENT';
  const ics = R.toICS(event({ kind: 'offset', minutes: 0 }, { title }), 0);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
  assert.ok(ics.includes('\r\n '));
  assert.ok(unfold(ics).includes('SUMMARY:회의\\, 식사\\; 메모\\\\경로\\n다음 줄 ' + '한글🙂'.repeat(40) + '\\nEND:VEVENT\r\n'));
  assert.equal(ics.split('\r\n').filter(line => line === 'END:VEVENT').length, 1);
  assert.equal(Buffer.from(ics, 'utf8').toString('utf8'), ics);
});

test('exports without reminder or for completed/failed events omit alarms; rejects invalid event data', () => {
  for (const item of [event(null), event({ kind: 'offset', minutes: 30 }, { status: 'done' }), event({ kind: 'offset', minutes: 30 }, { status: 'failed' })]) assert.equal(R.toICS(item, 0).includes('BEGIN:VALARM'), false);
  assert.throws(() => R.toICS(event(null, { date: '2027-02-29' }), 0), RangeError);
  assert.throws(() => R.toICS(event(null, { time: '25:00' }), 0), RangeError);
  assert.throws(() => R.toICS(event(null), NaN), RangeError);
});

test('UMD exposes identical API on browser window without requiring modules', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/reminder-core.js'), 'utf8'), context);
  assert.deepEqual(Object.keys(context.window.HaruReminders), Object.keys(R));
  assert.equal(context.window.HaruReminders.describe({ kind: 'offset', minutes: 120 }), '2시간 전');
});

test('nonexistent DST time is rejected in affected zones', () => {
  if (process.env.TZ === 'America/New_York') assert.equal(Number.isNaN(R.parseLocal('2026-03-08T02:30')), true);
});
