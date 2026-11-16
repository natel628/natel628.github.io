// charts.js — inline SVG builders. No chart library, no DOM access: these
// take plain numbers and return markup strings, so they stay easy to test.

const round = (value) => Math.round(value * 100) / 100;

const dayKey = (date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

// Hourly rate across the next 24 hours: shaded bands are the dark hours,
// the gold band is the window the page recommends.
export function nightChart(samples, bestWindow, label) {
  const width = 340;
  const height = 84;
  const padTop = 6;
  const padBottom = 4;
  if (!samples || samples.length < 2) return '';

  const t0 = samples[0].time.getTime();
  const t1 = samples[samples.length - 1].time.getTime();
  const span = Math.max(1, t1 - t0);
  const maxRate = Math.max(1, ...samples.map((sample) => sample.rate));

  const toX = (ms) => ((ms - t0) / span) * width;
  const toY = (rate) => height - padBottom - (rate / maxRate) * (height - padTop - padBottom);

  let darkBands = '';
  let darkStart = null;
  for (const sample of samples) {
    const ms = sample.time.getTime();
    if (sample.darkness > 0 && darkStart === null) darkStart = ms;
    if (sample.darkness <= 0 && darkStart !== null) {
      darkBands += `<rect class="dark" x="${round(toX(darkStart))}" y="0" width="${round(toX(ms) - toX(darkStart))}" height="${height}"/>`;
      darkStart = null;
    }
  }
  if (darkStart !== null) {
    darkBands += `<rect class="dark" x="${round(toX(darkStart))}" y="0" width="${round(width - toX(darkStart))}" height="${height}"/>`;
  }

  const windowBand = bestWindow
    ? `<rect class="window" x="${round(toX(bestWindow.start.getTime()))}" y="0" width="${round(toX(bestWindow.end.getTime()) - toX(bestWindow.start.getTime()))}" height="${height}"/>`
    : '';

  const points = samples
    .map((sample) => `${round(toX(sample.time.getTime()))},${round(toY(sample.rate))}`)
    .join(' ');
  const area = `M0,${height} L${points.split(' ').join(' L')} L${width},${height} Z`;

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
      ${darkBands}${windowBand}
      <path class="area" d="${area}"/>
      <polyline class="line" points="${points}"/>
      <line class="base" x1="0" y1="${height - 0.5}" x2="${width}" y2="${height - 0.5}"/>
    </svg>`;
}

// One bar per night of the season, height = how active the shower is.
export function seasonChart(days, opts = {}) {
  const width = 340;
  const height = 58;
  if (!days || !days.length) return '';

  const slot = width / days.length;
  const barWidth = Math.max(1.2, slot - Math.max(0.8, slot * 0.2));
  const todayKey = opts.today ? dayKey(opts.today) : null;
  const peakKey = opts.peak ? dayKey(opts.peak) : null;

  const bars = days.map((day, index) => {
    const key = dayKey(day.date);
    const barHeight = Math.max(1.6, day.activity * (height - 6));
    const x = index * slot + (slot - barWidth) / 2;
    const cls = key === peakKey ? 'bar peak' : key === todayKey ? 'bar today' : 'bar';
    return `<rect class="${cls}" x="${round(x)}" y="${round(height - barHeight)}" width="${round(barWidth)}" height="${round(barHeight)}" rx="1"/>`;
  }).join('');

  return `<svg class="chart chart-season" viewBox="0 0 ${width} ${height}" role="img" aria-label="${opts.label || ''}">${bars}</svg>`;
}
