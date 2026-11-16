// calendar.js — builds a single-event .ics file. Pure string work so it can
// be tested without a browser; stars.js handles the download.

const pad = (value) => String(value).padStart(2, '0');

const dateStamp = (date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;

// RFC 5545 wants long lines folded at 75 octets with a leading space.
function fold(line) {
  if (line.length <= 74) return line;

  const chunks = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    chunks.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  if (rest) chunks.push(` ${rest}`);
  return chunks.join('\r\n');
}

function escapeText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Half-open on purpose: DTEND on an all-day event is the day after.
export function peakEventIcs({ shower, peak, url }) {
  const end = new Date(peak);
  end.setDate(end.getDate() + 1);

  const now = new Date();
  const stamp = `${dateStamp(now)}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}Z`;

  const description = `${shower.name} peak (ZHR ${shower.zhr}, ${shower.velocity} km/s, `
    + `debris from ${shower.parent}). Radiant near RA ${shower.ra} / Dec ${shower.dec}. `
    + `Best after full dark, away from lights. ${url}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Meteor Shower Tracker//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${shower.id}-${dateStamp(peak)}@meteor-shower-tracker`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${dateStamp(peak)}`,
    `DTEND;VALUE=DATE:${dateStamp(end)}`,
    `SUMMARY:${escapeText(`${shower.name} peak night`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return `${lines.map(fold).join('\r\n')}\r\n`;
}
