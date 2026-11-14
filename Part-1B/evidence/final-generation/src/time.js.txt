// Fixed-offset IST (Asia/Kolkata, +05:30, no DST) time helpers. No Intl (R-05).

export const IST_OFFSET_MS = 19_800_000;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const REF_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const IST_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\+05:30$/;

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

// Returns UTC ms for the given wall-clock components, or null if any component is out of range.
function wallClockMs(y, mo, d, h, mi, s) {
  if (h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const dt = new Date(ms);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d ||
    dt.getUTCHours() !== h ||
    dt.getUTCMinutes() !== mi ||
    dt.getUTCSeconds() !== s
  ) {
    return null;
  }
  return ms;
}

export function formatIst(ms) {
  const d = new Date(ms + IST_OFFSET_MS);
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+05:30`
  );
}

export function parseReferenceTime(str) {
  if (typeof str !== 'string') return null;
  const m = REF_RE.exec(str);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, off] = m;
  const wall = wallClockMs(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s));
  if (wall === null) return null;
  let offsetMs = 0;
  if (off !== 'Z') {
    const sign = off[0] === '-' ? -1 : 1;
    const oh = Number(off.slice(1, 3));
    const om = Number(off.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offsetMs = sign * (oh * 60 + om) * 60_000;
  }
  const fracMs = frac ? Number(frac.slice(1).padEnd(3, '0')) : 0;
  const ms = wall - offsetMs + fracMs;
  return { ms, ist: formatIst(ms) };
}

export function isValidIstDatetime(str) {
  if (typeof str !== 'string') return false;
  const m = IST_RE.exec(str);
  if (!m) return false;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return wallClockMs(y, mo, d, h, mi, s) !== null;
}

export function istToMs(str) {
  if (!isValidIstDatetime(str)) return null;
  const [, y, mo, d, h, mi, s] = IST_RE.exec(str).map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s) - IST_OFFSET_MS;
}

export function weekdayIst(ms) {
  return WEEKDAYS[new Date(ms + IST_OFFSET_MS).getUTCDay()];
}

export function calendarHint(ms) {
  const local = new Date(ms + IST_OFFSET_MS);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const d = local.getUTCDate();
  const out = [];
  for (let i = 1; i <= 14; i += 1) {
    const day = new Date(Date.UTC(y, mo, d + i));
    out.push(
      `${pad(day.getUTCFullYear(), 4)}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())} ${WEEKDAYS[day.getUTCDay()]}`,
    );
  }
  return out;
}
