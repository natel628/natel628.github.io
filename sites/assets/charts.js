// charts.js — inline SVG builders. No chart library, no DOM access: these
// take plain numbers and return markup strings, so they stay easy to test.

const round = (value) => Math.round(value * 100) / 100;

const dayKey = (date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

// Hourly rate across the next 24 hours: shaded bands are the dark hours,
// the gold band is the window the page recommends.
export function nightChart(samples, bestWindow, label, opts = {}) {
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

  // Forecast cloud cover, 100% along the top edge of the plot.
  const cloudLine = opts.cloud && samples.every((sample) => typeof sample.clear === 'number')
    ? `<polyline class="cloud" points="${samples.map((sample) => `${round(toX(sample.time.getTime()))},${round(height - padBottom - (1 - sample.clear) * (height - padTop - padBottom))}`).join(' ')}"/>`
    : '';

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
      ${darkBands}${windowBand}
      <path class="area" d="${area}"/>
      ${cloudLine}
      <polyline class="line" points="${points}"/>
      <line class="base" x1="0" y1="${height - 0.5}" x2="${width}" y2="${height - 0.5}"/>
    </svg>`;
}

// Sky compass: the rim is the horizon, the centre is straight overhead, and
// the marker is the radiant. Distance from the centre shows altitude, so a
// dot near the middle means "look up", a dot on the rim means "look low".
export function skyDial(opts = {}) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const outer = 66;
  const azimuth = (((opts.azimuth ?? 0) % 360) + 360) % 360;
  const altitude = Math.max(-30, Math.min(90, opts.altitude ?? 0));
  const above = altitude >= 0;
  const distance = (1 - Math.max(0, altitude) / 90) * outer;

  const point = (deg, radius) => [
    round(cx + Math.sin((deg * Math.PI) / 180) * radius),
    round(cy - Math.cos((deg * Math.PI) / 180) * radius)
  ];

  const [mx, my] = point(azimuth, above ? distance : outer);
  const [w1x, w1y] = point(azimuth - 45, outer);
  const [w2x, w2y] = point(azimuth + 45, outer);

  const ticks = [30, 60, 120, 150, 210, 240, 300, 330].map((deg) => {
    const [x1, y1] = point(deg, outer - 5);
    const [x2, y2] = point(deg, outer);
    return `<line class="tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');

  const labels = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([text, deg]) => {
    const [x, y] = point(deg, outer + 11);
    return `<text class="cardinal" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
  }).join('');

  const rings = [1 / 3, 2 / 3]
    .map((fraction) => `<circle class="ring" cx="${cx}" cy="${cy}" r="${round(outer * fraction)}"/>`)
    .join('');

  return `<svg class="chart chart-dial" viewBox="0 0 ${size} ${size}" role="img" aria-label="${opts.label || 'Sky direction'}">
      <circle class="horizon" cx="${cx}" cy="${cy}" r="${outer}"/>
      ${rings}
      <path class="wedge" d="M${cx},${cy} L${w1x},${w1y} A${outer},${outer} 0 0 1 ${w2x},${w2y} Z"/>
      ${ticks}
      ${labels}
      <line class="sight" x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}"/>
      <circle class="radiant${above ? '' : ' below'}" cx="${mx}" cy="${my}" r="5"/>
      <circle class="centre" cx="${cx}" cy="${cy}" r="1.6"/>
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
