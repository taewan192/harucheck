
/* Local reminder math and RFC 5545 calendar export. No timers, storage, or permissions. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HaruReminders = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var MINUTE = 60000;
  var DAY = 24 * 60 * MINUTE;

  // Validate components after construction: Date must not silently roll Feb 30
  // into March or a nonexistent local daylight-saving hour into the next hour.
  function localDate(value, dateOnly) {
    if (typeof value !== 'string') return null;
    var match = (dateOnly ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/).exec(value);
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var hour = dateOnly ? 0 : Number(match[4]);
    var minute = dateOnly ? 0 : Number(match[5]);
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    var result = new Date(0);
    result.setFullYear(year, month - 1, day);
    result.setHours(hour, minute, 0, 0);
    if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day || result.getHours() !== hour || result.getMinutes() !== minute) return null;
    return result;
  }

  function parseLocal(value) {
    var result = localDate(value, false);
    return result ? result.getTime() : NaN;
  }

  function isValid(reminder) {
    if (reminder == null) return true;
    if (typeof reminder !== 'object' || Array.isArray(reminder)) return false;
    if (reminder.kind === 'offset') return Number.isInteger(reminder.minutes) && reminder.minutes >= 0 && reminder.minutes <= 300 && reminder.minutes % 30 === 0;
    if (reminder.kind === 'custom') return Number.isFinite(parseLocal(reminder.at));
    return false;
  }

  function resolve(event) {
    if (!event || !event.reminder || !isValid(event.reminder)) return NaN;
    if (event.reminder.kind === 'custom') return parseLocal(event.reminder.at);
    var starts = parseLocal(event.date + 'T' + event.time);
    return Number.isFinite(starts) ? starts - event.reminder.minutes * MINUTE : NaN;
  }

  function describe(reminder) {
    if (reminder == null) return '알림 없음';
    if (!isValid(reminder)) return '알림 설정 확인';
    if (reminder.kind === 'custom') {
      var date = new Date(parseLocal(reminder.at));
      return '직접 설정 ' + date.getFullYear() + '.' + (date.getMonth() + 1) + '.' + date.getDate() + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }
    if (reminder.minutes === 0) return '일정 시작 시간';
    var hours = Math.floor(reminder.minutes / 60);
    var minutes = reminder.minutes % 60;
    return (hours ? hours + '시간' : '') + (hours && minutes ? ' ' : '') + (minutes ? minutes + '분' : '') + ' 전';
  }

  function token(event) {
    var at = resolve(event);
    return event && event.id != null && Number.isFinite(at) ? String(event.id) + '|' + at : '';
  }

  function hasReceipt(receipts, key) {
    if (!receipts) return false;
    if (typeof receipts.has === 'function') return receipts.has(key);
    if (Array.isArray(receipts)) return receipts.indexOf(key) !== -1;
    return Object.prototype.hasOwnProperty.call(receipts, key);
  }

  function dueEvents(events, receipts, now) {
    if (now === undefined) now = Date.now();
    if (!Array.isArray(events) || !Number.isFinite(now)) return [];
    var seen = Object.create(null);
    return events.filter(function (event) {
      if (!event || event.status !== 'pending') return false;
      var at = resolve(event);
      var key = token(event);
      if (!key || at > now || at < now - DAY || hasReceipt(receipts, key) || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function pad(value) { return String(value).padStart(2, '0'); }
  function utcStamp(epoch) {
    var date = new Date(epoch);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new RangeError('Invalid calendar time');
    return String(date.getUTCFullYear()).padStart(4, '0') + pad(date.getUTCMonth() + 1) + pad(date.getUTCDate()) + 'T' + pad(date.getUTCHours()) + pad(date.getUTCMinutes()) + pad(date.getUTCSeconds()) + 'Z';
  }
  function dateStamp(date) {
    if (date.getFullYear() < 1 || date.getFullYear() > 9999) throw new RangeError('Invalid calendar date');
    return String(date.getFullYear()).padStart(4, '0') + pad(date.getMonth() + 1) + pad(date.getDate());
  }
  function escapeText(value) {
    return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }
  function foldLine(line) {
    var lines = [];
    var current = '';
    var bytes = 0;
    // Iterate by Unicode code point so folding never breaks a UTF-8 character.
    for (var character of line) {
      var point = character.codePointAt(0);
      var size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
      if (bytes + size > 75) {
        lines.push(current);
        current = ' ';
        bytes = 1;
      }
      current += character;
      bytes += size;
    }
    lines.push(current);
    return lines.join('\r\n');
  }

  // RFC 5545: absolute DATE-TIME alarms must be UTC. DTEND for an all-day
  // event is the exclusive next date; timed events are exported as one hour.
  function toICS(event, now) {
    if (!event || event.id == null) throw new TypeError('An event id is required');
    if (now === undefined) now = Date.now();
    var day = localDate(event.date, true);
    if (!day) throw new RangeError('Invalid event date');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HaruCheck//Calendar 1.0//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:' + escapeText(String(event.id) + '@harucheck.local'), 'DTSTAMP:' + utcStamp(now)];
    if (event.time) {
      var at = parseLocal(event.date + 'T' + event.time);
      if (!Number.isFinite(at)) throw new RangeError('Invalid event time');
      lines.push('DTSTART:' + utcStamp(at), 'DTEND:' + utcStamp(at + 60 * MINUTE));
    } else {
      lines.push('DTSTART;VALUE=DATE:' + dateStamp(day));
      day.setDate(day.getDate() + 1);
      lines.push('DTEND;VALUE=DATE:' + dateStamp(day));
    }
    lines.push('SUMMARY:' + escapeText(event.title), 'DESCRIPTION:' + escapeText('하루체크에서 저장한 일정'), 'TRANSP:OPAQUE');
    var alarm = resolve(event);
    if (event.status === 'pending' && Number.isFinite(alarm)) {
      lines.push('BEGIN:VALARM', 'TRIGGER;VALUE=DATE-TIME:' + utcStamp(alarm), 'ACTION:DISPLAY', 'DESCRIPTION:' + escapeText(event.title || '일정 알림'), 'END:VALARM');
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }

  return { parseLocal: parseLocal, isValid: isValid, resolve: resolve, describe: describe, token: token, dueEvents: dueEvents, toICS: toICS };
});
