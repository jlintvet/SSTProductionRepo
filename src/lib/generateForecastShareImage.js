import riplocLogo from "@/public/brand/riploc-app-icon.png";
// generateForecastShareImage.js
// Renders a branded "day forecast" card to a PNG Blob for sharing — mirrors
// the share pipeline used by generateShareImage.js (SST) and
// generateRouteShareImage.js (routes), but the picture is the weather forecast
// for one location + day (e.g. "Oregon Inlet — Fri 6/19").
//
// Pure canvas drawing (no React / lucide). Brand palette from the marketing
// page: teal #0e7490, deep navy #0c4a6e, light wash #f0f9ff.

const TEAL      = "#0e7490";
const TEAL_DARK = "#0c4a6e";
const WASH      = "#f0f9ff";
const INK       = "#0f172a";
const SLATE     = "#475569";
const SLATE_LT  = "#94a3b8";
const AMBER     = "#f59e0b";
const ORANGE    = "#ea580c";
const SKY       = "#0ea5e9";

const W = 440;
const SCALE = 2;

let _logoImg = null;
function loadLogo() {
  if (_logoImg) return Promise.resolve(_logoImg);
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => { _logoImg = im; res(im); };
    im.onerror = () => res(null);
    im.src = riplocLogo;
  });
}

function fmtTime(iso) {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d)) return "--";
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m} ${ap}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

function ellip(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

function classifyCond(text) {
  const f = (text || "").toLowerCase();
  if (f.includes("thunder")) return "thunder";
  if (f.includes("snow") || f.includes("flurr")) return "snow";
  if (f.includes("rain") || f.includes("shower") || f.includes("drizzle")) return "rain";
  if (f.includes("fog")) return "fog";
  if (f.includes("mostly cloudy") || f.includes("overcast")) return "cloud";
  if (f.includes("partly") || f.includes("mostly sunny") || f.includes("mostly clear")) return "partly";
  if (f.includes("cloudy")) return "cloud";
  if (f.includes("sunny") || f.includes("clear")) return "sun";
  return "partly";
}

function drawSun(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 2.2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}

function drawCloud(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx - 0.6 * s, cy, 0.55 * s, 0, Math.PI * 2);
  ctx.arc(cx + 0.2 * s, cy - 0.35 * s, 0.7 * s, 0, Math.PI * 2);
  ctx.arc(cx + 0.9 * s, cy, 0.55 * s, 0, Math.PI * 2);
  roundRect(ctx, cx - 1.15 * s, cy, 2.3 * s, 0.7 * s, 0.35 * s);
  ctx.fill();
  ctx.restore();
}

function drawCondition(ctx, cx, cy, kind) {
  switch (kind) {
    case "sun":   drawSun(ctx, cx, cy, 13, AMBER); break;
    case "partly":
      drawSun(ctx, cx + 7, cy - 8, 9, AMBER);
      drawCloud(ctx, cx - 2, cy + 4, 12, "#cbd5e1");
      break;
    case "cloud": drawCloud(ctx, cx, cy, 13, "#94a3b8"); break;
    case "fog":
      drawCloud(ctx, cx, cy - 3, 12, "#cbd5e1");
      ctx.save(); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) { const yy = cy + 12 + i * 5; ctx.beginPath(); ctx.moveTo(cx - 14, yy); ctx.lineTo(cx + 14, yy); ctx.stroke(); }
      ctx.restore();
      break;
    case "rain":
      drawCloud(ctx, cx, cy - 4, 12, "#94a3b8");
      ctx.save(); ctx.strokeStyle = SKY; ctx.lineWidth = 2.4; ctx.lineCap = "round";
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 9, cy + 10); ctx.lineTo(cx + i * 9 - 2, cy + 18); ctx.stroke(); }
      ctx.restore();
      break;
    case "snow":
      drawCloud(ctx, cx, cy - 4, 12, "#cbd5e1");
      ctx.save(); ctx.fillStyle = SKY;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(cx + i * 9, cy + 14, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      break;
    case "thunder":
      drawCloud(ctx, cx, cy - 4, 12, "#94a3b8");
      ctx.save(); ctx.fillStyle = AMBER;
      ctx.beginPath(); ctx.moveTo(cx + 2, cy + 8); ctx.lineTo(cx - 5, cy + 18);
      ctx.lineTo(cx, cy + 18); ctx.lineTo(cx - 4, cy + 26);
      ctx.lineTo(cx + 7, cy + 14); ctx.lineTo(cx + 2, cy + 14); ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    default: drawCloud(ctx, cx, cy, 13, "#94a3b8");
  }
}

function drawWindIcon(ctx, x, y, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 9, y - 4);
  ctx.arc(x + 9, y - 6.5, 2.5, Math.PI * 0.5, Math.PI * 1.9, false); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, y);
  ctx.arc(x + 12, y - 2.5, 2.5, Math.PI * 0.5, Math.PI * 1.9, false); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + 7, y + 4);
  ctx.arc(x + 7, y + 2, 2, Math.PI * 0.5, Math.PI * 1.9, false); ctx.stroke();
  ctx.restore();
}
function drawWaveIcon(ctx, x, y, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  for (let r = 0; r < 2; r++) {
    const yy = y - 3 + r * 6;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.bezierCurveTo(x + 4, yy - 5, x + 8, yy + 5, x + 12, yy);
    ctx.stroke();
  }
  ctx.restore();
}
function drawTideIcon(ctx, x, y, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x + 3, y - 6); ctx.lineTo(x + 3, y + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 3, y - 6); ctx.lineTo(x + 6, y - 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 9, y + 6); ctx.lineTo(x + 9, y - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 6, y + 3); ctx.lineTo(x + 9, y + 6); ctx.lineTo(x + 12, y + 3); ctx.stroke();
  ctx.restore();
}
function drawSunriseIcon(ctx, x, y, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(x + 6, y + 3, 4.5, Math.PI, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 2, y + 3); ctx.lineTo(x + 14, y + 3); ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(x + 6 + Math.cos(a) * 7, y + 3 + Math.sin(a) * 7);
    ctx.lineTo(x + 6 + Math.cos(a) * 10, y + 3 + Math.sin(a) * 10);
    ctx.stroke();
  }
  ctx.restore();
}

export async function generateForecastShareImage(opts) {
  const {
    locationLabel = "Fishing Spot",
    periodLabel = "",
    condition = "",
    high = null, low = null, dayPrecip = 0,
    wind = null, waves = null, swell = null,
    tides = [], sun = null,
  } = opts || {};

  const HEADER = 72, COND = 84, WIND = 50, SEAS = swell ? 62 : 46;
  const tideRows = Math.min(4, (tides?.length || 0));
  const TIDES = 30 + Math.max(1, tideRows) * 18 + 8;
  const SUN = sun ? 46 : 0;
  const FOOTER = 34;
  const H = HEADER + COND + WIND + SEAS + TIDES + SUN + FOOTER;

  const logo = await loadLogo();

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const hg = ctx.createLinearGradient(0, 0, W, HEADER);
  hg.addColorStop(0, TEAL_DARK); hg.addColorStop(1, TEAL);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, HEADER);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 19px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(ellip(ctx, locationLabel, W - 100), 18, 32);

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 13px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(periodLabel || "", 18, 52);

  if (logo) {
    const lh = 38, lw = lh * (logo.width / logo.height);
    ctx.drawImage(logo, W - 18 - lw, (HEADER - lh) / 2, lw, lh);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "700 15px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("RipLoc", W - 18, 30);
  }

  let y = HEADER;
  ctx.fillStyle = WASH;
  ctx.fillRect(0, y, W, COND);

  drawCondition(ctx, 40, y + COND / 2 - 2, classifyCond(condition));

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "600 15px -apple-system, Segoe UI, Roboto, sans-serif";
  const condText = condition || "Forecast";
  ctx.fillText(ellip(ctx, condText, 215), 72, y + COND / 2 - 4);

  if (dayPrecip > 0) {
    ctx.fillStyle = SKY;
    ctx.font = "600 12px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(`Precip ${dayPrecip}%`, 72, y + COND / 2 + 16);
  }

  // Match the forecast card: "{high}° / {low}°F"
  ctx.textAlign = "left";
  const hi = high != null ? `${high}°` : "--";
  const loStr = ` / ${low != null ? `${low}°F` : "--"}`;
  ctx.font = "700 26px -apple-system, Segoe UI, Roboto, sans-serif";
  const hiW = ctx.measureText(hi).width;
  ctx.font = "600 16px -apple-system, Segoe UI, Roboto, sans-serif";
  const loW = ctx.measureText(loStr).width;
  const tStartX = W - 18 - hiW - loW;
  const tBaseY = y + COND / 2 + 2;
  ctx.fillStyle = INK;
  ctx.font = "700 26px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(hi, tStartX, tBaseY);
  ctx.fillStyle = SLATE_LT;
  ctx.font = "600 16px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(loStr, tStartX + hiW, tBaseY);

  const LX = 18, VX = 78;
  function rowLabel(text, iconFn, yy) {
    ctx.save();
    iconFn(ctx, LX, yy - 4, TEAL);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.fillStyle = TEAL;
    ctx.font = "700 11px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(text.toUpperCase(), LX + 22, yy);
  }
  function divider(yy) {
    ctx.strokeStyle = "#eef2f7"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(14, yy); ctx.lineTo(W - 14, yy); ctx.stroke();
  }

  y += COND;
  let cy = y + WIND / 2 + 4;
  rowLabel("Wind", drawWindIcon, cy);
  ctx.fillStyle = SLATE; ctx.textAlign = "left";
  ctx.font = "600 14px -apple-system, Segoe UI, Roboto, sans-serif";
  const windStr = wind ? (`${wind.direction ?? ""} ${wind.speed ?? ""}`.trim() || "—") : "—";
  ctx.fillText(ellip(ctx, windStr, W - VX - 110), VX, cy + 1);
  if (wind?.gusts) {
    ctx.fillStyle = ORANGE; ctx.textAlign = "right";
    ctx.font = "600 12px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(`Gusts ${wind.gusts}`, W - 18, cy + 1);
  }
  divider(y + WIND);

  y += WIND;
  rowLabel("Seas", drawWaveIcon, y + 22);
  ctx.fillStyle = SLATE; ctx.textAlign = "left";
  ctx.font = "600 14px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(ellip(ctx, waves || "—", W - VX - 24), VX, y + 23);
  if (swell) {
    ctx.fillStyle = SLATE_LT;
    ctx.font = "400 12px -apple-system, Segoe UI, Roboto, sans-serif";
    const sw = `Swell: ${swell.direction ?? ""} ${swell.height ?? ""} @ ${swell.period ?? ""}`.replace(/\s+/g, " ").trim();
    ctx.fillText(ellip(ctx, sw, W - VX - 24), VX, y + 43);
  }
  divider(y + SEAS);

  y += SEAS;
  rowLabel("Tides", drawTideIcon, y + 22);
  ctx.textAlign = "left";
  if (tideRows > 0) {
    ctx.font = "600 13px -apple-system, Segoe UI, Roboto, sans-serif";
    for (let i = 0; i < tideRows; i++) {
      const t = tides[i];
      const ty = y + 22 + i * 18;
      ctx.fillStyle = SLATE;
      const time = fmtTime(t.t);
      const val = (t.v != null && !isNaN(parseFloat(t.v))) ? `${parseFloat(t.v).toFixed(1)} ft` : "";
      const type = t.type ? t.type[0].toUpperCase() + t.type.slice(1) : "";
      ctx.fillText(`${time}`, VX, ty + 1);
      ctx.fillStyle = SLATE_LT;
      ctx.fillText(`${val}  ${type}`, VX + 78, ty + 1);
    }
  } else {
    ctx.fillStyle = SLATE_LT;
    ctx.font = "400 13px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("Not available", VX, y + 23);
  }
  divider(y + TIDES);

  y += TIDES;
  if (sun) {
    rowLabel("Sun", drawSunriseIcon, y + SUN / 2 + 4);
    ctx.fillStyle = SLATE; ctx.textAlign = "left";
    ctx.font = "600 13px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(`Rise ${fmtTime(sun.sunrise)}`, VX, y + SUN / 2 + 5);
    ctx.fillText(`Set ${fmtTime(sun.sunset)}`, VX + 130, y + SUN / 2 + 5);
    divider(y + SUN);
    y += SUN;
  }

  ctx.textAlign = "left";
  ctx.fillStyle = SLATE_LT;
  ctx.font = "400 10px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Forecast via NOAA NWS", 18, y + 21);
  ctx.textAlign = "right";
  ctx.fillStyle = TEAL;
  ctx.font = "700 10px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("riploc.com", W - 18, y + 21);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? null), "image/png");
  });
}
