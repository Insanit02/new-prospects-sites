const COLORS = ["#2563eb", "#0f766e", "#b45309", "#7c3aed", "#be123c", "#0369a1", "#3f6212", "#9a3412", "#4338ca", "#155e75", "#6b7280"];

function setup(canvas, height) {
  const width = canvas.clientWidth || 320;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

export function drawPie(canvas, slices) {
  if (!canvas) return;
  const height = Math.max(240, 36 + Math.max(slices.length, 1) * 22);
  const { ctx, width } = setup(canvas, height);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  ctx.font = "14px system-ui, sans-serif";
  if (!total) {
    ctx.fillStyle = "#5b6472";
    ctx.fillText("No spending to chart in this set.", 12, 28);
    return;
  }
  const cx = Math.min(110, width * 0.28);
  const cy = Math.min(height / 2, 120);
  const radius = Math.min(84, width * 0.22);
  let angle = -Math.PI / 2;
  slices.forEach((slice, index) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = COLORS[index % COLORS.length];
    ctx.fill();
    angle += sweep;
  });
  slices.forEach((slice, index) => {
    const y = 28 + index * 22;
    ctx.fillStyle = COLORS[index % COLORS.length];
    ctx.fillRect(Math.max(width * 0.5, 190), y - 10, 12, 12);
    ctx.fillStyle = "#1d232a";
    const pct = Math.round((slice.value / total) * 100);
    ctx.fillText(`${slice.label} ${pct === 0 ? "<1" : pct}%`, Math.max(width * 0.5, 190) + 18, y);
  });
}

export function drawBars(canvas, bars) {
  if (!canvas) return;
  const { ctx, width, height } = setup(canvas, 240);
  const max = bars.reduce((best, bar) => Math.max(best, bar.value), 0);
  ctx.font = "12px system-ui, sans-serif";
  if (!max) {
    ctx.fillStyle = "#5b6472";
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillText("No monthly spending to chart in this set.", 12, 28);
    return;
  }
  const left = 8;
  const bottom = 28;
  const top = 12;
  const gap = 10;
  const usable = width - left - 8;
  const barWidth = Math.max(10, (usable - gap * Math.max(bars.length - 1, 0)) / Math.max(bars.length, 1));
  bars.forEach((bar, index) => {
    const h = ((height - top - bottom) * bar.value) / max;
    const x = left + index * (barWidth + gap);
    const y = height - bottom - h;
    ctx.fillStyle = "#2563eb";
    ctx.fillRect(x, y, barWidth, h);
    ctx.fillStyle = "#1d232a";
    ctx.textAlign = "center";
    ctx.fillText(bar.label, x + barWidth / 2, height - 8);
  });
}
