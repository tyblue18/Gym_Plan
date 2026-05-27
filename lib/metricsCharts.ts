// Pure canvas drawing functions for MetricsDashboard charts.

import type { BudgetMetrics, AthletePlan } from '@/lib/metricsTypes';
import { getEffectiveDailyKcal } from '@/lib/metricsTypes';

// ── Weight projection (35-day, "if every day was like today") ─────────────────

export function drawProjection(
  canvas: HTMLCanvasElement,
  startWt: number,
  m: BudgetMetrics,
  calsEaten = 0,
  highlightDay: number | null = null,
) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 300, H = 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const dailyNet  = calsEaten > 0
    ? calsEaten - (m.tdee + m.activityBurn)
    : (m.budget - m.tdee) - m.activityBurn;
  const lbsPerDay = dailyNet / 3500;
  const DAYS = 36;
  const pts  = Array.from({ length: DAYS }, (_, i) => startWt + lbsPerDay * i);
  const minW = Math.min(...pts), maxW = Math.max(...pts);
  const span = (maxW - minW) || 1;
  const PAD  = { t: 20, b: 32, l: 52, r: 16 };
  const xOf  = (i: number) => PAD.l + (i / (DAYS - 1)) * (W - PAD.l - PAD.r);
  const yOf  = (v: number) => H - PAD.b - ((v - minW) / span) * (H - PAD.t - PAD.b);
  const lime = '#4FC3F7', rgb = '79,195,247';
  const danger = '#FF4D5E', rgbDanger = '255,77,94';
  const col  = dailyNet <= 0 ? lime : danger;
  const rgbC = dailyNet <= 0 ? rgb  : rgbDanger;

  for (let w = 1; w <= 5; w++) {
    const d = w * 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xOf(d), PAD.t); ctx.lineTo(xOf(d), H - PAD.b); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'center';
    ctx.fillText(`W${w}`, xOf(d), H - 10);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, yOf(startWt)); ctx.lineTo(W - PAD.r, yOf(startWt)); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.40)'; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'right';
  ctx.fillText(`${startWt.toFixed(1)}`, PAD.l - 4, yOf(startWt) + 3);
  ctx.fillStyle = col + 'cc';
  ctx.fillText(`${pts[DAYS - 1].toFixed(1)}`, PAD.l - 4, yOf(pts[DAYS - 1]) + 3);

  const grad = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
  grad.addColorStop(0, `rgba(${rgbC},0.20)`); grad.addColorStop(1, `rgba(${rgbC},0)`);
  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(DAYS - 1), H - PAD.b); ctx.lineTo(xOf(0), H - PAD.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  ctx.beginPath(); ctx.arc(xOf(0), yOf(pts[0]), 4, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText('TODAY', xOf(0) + 7, yOf(pts[0]) - 4);

  const d30 = pts[30], d30x = xOf(30), d30y = yOf(d30);
  ctx.beginPath(); ctx.arc(d30x, d30y, 9, 0, Math.PI * 2);
  ctx.fillStyle = col + '25'; ctx.fill();
  ctx.beginPath(); ctx.arc(d30x, d30y, 5, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
  ctx.beginPath(); ctx.arc(d30x, d30y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#07080A'; ctx.fill();
  ctx.fillStyle = col; ctx.font = 'bold 8px JetBrains Mono, monospace'; ctx.textAlign = 'center';
  ctx.fillText('30D', d30x, d30y - 11);

  if (highlightDay !== null && highlightDay >= 0 && highlightDay < DAYS) {
    const hx = xOf(highlightDay);
    const hy = yOf(pts[Math.min(highlightDay, pts.length - 1)]);
    ctx.beginPath(); ctx.strokeStyle = 'rgba(79,195,247,0.40)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.moveTo(hx, PAD.t); ctx.lineTo(hx, H - PAD.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(79,195,247,0.20)'; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = lime; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#07080A'; ctx.fill();
  }
}

// ── Multi-tab line chart (weight / burn / budget) ─────────────────────────────

export function drawLineChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  color: string,
  unit: string,
  rollingAvg?: number[],
) {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth || 600;
  const cssH = parseInt(getComputedStyle(canvas).height) || 220;
  canvas.width  = cssW * dpr; canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;
  const pad = { t: 16, r: 16, b: 36, l: 58 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  ctx.clearRect(0, 0, W, H);

  const valid = values.filter(v => v > 0);
  if (valid.length < 2) {
    ctx.fillStyle = 'rgba(107,110,118,0.7)';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NOT ENOUGH DATA', W / 2, H / 2);
    return;
  }

  const vMin = Math.min(...valid), vMax = Math.max(...valid);
  const pad2 = (vMax - vMin) * 0.12 || vMax * 0.05 || 5;
  const yMin = vMin - pad2, yMax = vMax + pad2, yR = yMax - yMin;
  const xOf = (i: number) => pad.l + (labels.length > 1 ? i / (labels.length - 1) : 0.5) * cW;
  const yOf = (v: number) => pad.t + (1 - (v - yMin) / yR) * cH;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    const val = yMax - (i / 4) * yR;
    ctx.fillStyle = 'rgba(158,161,168,0.7)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val) + unit, pad.l - 5, y + 3.5);
  }
  ctx.fillStyle = 'rgba(158,161,168,0.7)'; ctx.textAlign = 'center';
  ctx.font = '9px JetBrains Mono, monospace';
  const step = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) ctx.fillText(l, xOf(i), H - pad.b + 14); });

  const pts = values.map((v, i) => ({ v, i })).filter(p => p.v > 0);
  const rgba = color.startsWith('#')
    ? `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},`
    : 'rgba(79,195,247,';

  if (pts.length >= 2) {
    ctx.beginPath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
    grad.addColorStop(0, rgba + '0.22)');
    grad.addColorStop(1, rgba + '0.0)');
    ctx.fillStyle = grad;
    pts.forEach(({ v, i }, idx) => { idx === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)); });
    ctx.lineTo(xOf(pts[pts.length - 1].i), pad.t + cH);
    ctx.lineTo(xOf(pts[0].i), pad.t + cH);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  let first = true;
  values.forEach((v, i) => {
    if (v <= 0) { first = true; return; }
    first ? (ctx.moveTo(xOf(i), yOf(v)), first = false) : ctx.lineTo(xOf(i), yOf(v));
  });
  ctx.stroke();
  if (labels.length <= 60) {
    values.forEach((v, i) => {
      if (v <= 0) return;
      ctx.beginPath(); ctx.fillStyle = color; ctx.arc(xOf(i), yOf(v), 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.fillStyle = '#07080A'; ctx.arc(xOf(i), yOf(v), 1.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  if (rollingAvg && rollingAvg.some(v => v > 0)) {
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.setLineDash([]);
    let rfirst = true;
    rollingAvg.forEach((v, i) => {
      if (v <= 0) { rfirst = true; return; }
      rfirst ? (ctx.moveTo(xOf(i), yOf(v)), rfirst = false) : ctx.lineTo(xOf(i), yOf(v));
    });
    ctx.stroke();
  }
}

// ── Plan chart (projected line + actual dots) ─────────────────────────────────

export function drawPlanChart(
  canvas: HTMLCanvasElement,
  projPts: number[],
  actualPts: { week: number; weight: number }[],
  planType: 'cut' | 'bulk',
  goalWeight: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 600;
  const H = parseInt(getComputedStyle(canvas).height) || 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr);

  const weeks = projPts.length - 1;
  const allW  = [...projPts, ...actualPts.map(p => p.weight), goalWeight].filter(Boolean);
  const raw0  = Math.min(...allW), raw1 = Math.max(...allW);
  const pad2  = (raw1 - raw0) * 0.12 || 5;
  const yMin  = raw0 - pad2, yMax = raw1 + pad2, yR = yMax - yMin;
  const PAD   = { t: 20, r: 16, b: 36, l: 52 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const xOf = (w: number) => PAD.l + (weeks > 0 ? w / weeks : 0) * cW;
  const yOf = (v: number) => PAD.t + (1 - (v - yMin) / yR) * cH;

  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
    const val = yMax - (i / 4) * yR;
    ctx.fillStyle = 'rgba(158,161,168,0.7)'; ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(val) + ' lb', PAD.l - 4, y + 3.5);
  }

  const stepW = Math.max(1, Math.ceil(weeks / 8));
  ctx.fillStyle = 'rgba(158,161,168,0.7)'; ctx.textAlign = 'center'; ctx.font = '9px JetBrains Mono, monospace';
  for (let w = 0; w <= weeks; w += stepW) ctx.fillText(`W${w}`, xOf(w), H - PAD.b + 14);

  ctx.strokeStyle = 'rgba(109,255,153,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, yOf(goalWeight)); ctx.lineTo(PAD.l + cW, yOf(goalWeight)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(109,255,153,0.75)'; ctx.textAlign = 'right'; ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText('GOAL', PAD.l - 4, yOf(goalWeight) - 3);

  const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
  grad.addColorStop(0, 'rgba(79,195,247,0.18)'); grad.addColorStop(1, 'rgba(79,195,247,0)');
  ctx.beginPath(); ctx.fillStyle = grad;
  projPts.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(weeks), H - PAD.b); ctx.lineTo(xOf(0), H - PAD.b); ctx.closePath(); ctx.fill();

  ctx.beginPath(); ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  projPts.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
  ctx.stroke();

  ctx.beginPath(); ctx.arc(xOf(0), yOf(projPts[0]), 4, 0, Math.PI * 2); ctx.fillStyle = '#4FC3F7'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.textAlign = 'left'; ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText('NOW', xOf(0) + 6, yOf(projPts[0]) - 4);

  actualPts.forEach(({ week, weight }) => {
    if (week < 0 || week > weeks) return;
    const proj    = projPts[Math.min(Math.round(week), projPts.length - 1)];
    const isAhead = planType === 'cut' ? weight <= proj : weight >= proj;
    const col     = isAhead ? '#6DFF99' : '#FF4D5E';
    ctx.beginPath(); ctx.arc(xOf(week), yOf(weight), 5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.arc(xOf(week), yOf(weight), 2.5, 0, Math.PI * 2); ctx.fillStyle = '#07080A'; ctx.fill();
  });
}

// ── Progress chart (perfect pace line + actual logged weight dots) ─────────────

export function drawProgressChart(
  canvas: HTMLCanvasElement,
  plan: AthletePlan,
  chartPts: { week: number; weight: number }[],
  currentWeek: number,
  firstLoggedWeight?: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth || 600;
  const H   = 200;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const totalWks  = plan.weeksTarget;
  // Anchor the projection at the user's actual first-logged weight if they
  // weighed in near the plan start; otherwise fall back to plan.startWeight.
  const startWt   = firstLoggedWeight ?? plan.startWeight;
  const goalWt    = plan.goalWeight;
  // Use the plan's *effective* rate (cardio-adjusted) so the projection line
  // matches the rate that progress-tracking compares against. Goal-implied
  // rate would drift if firstLoggedWeight ≠ plan.startWeight.
  const effKcal   = getEffectiveDailyKcal(plan);
  const ratePerWk = plan.type === 'cut'
    ? -(effKcal * 7 / 3500)
    :  (effKcal * 7 / 3500);
  const projPts   = Array.from({ length: totalWks + 1 }, (_, i) => startWt + ratePerWk * i);

  const planLo  = Math.min(startWt, goalWt);
  const planHi  = Math.max(startWt, goalWt);
  const buf     = Math.max((planHi - planLo) * 0.14, 5);
  const dataLo  = chartPts.length ? Math.min(...chartPts.map(p => p.weight)) : planLo;
  const dataHi  = chartPts.length ? Math.max(...chartPts.map(p => p.weight)) : planHi;
  // Include projPts so the rate-driven projection doesn't get clipped when
  // it overshoots the goal (happens when firstLoggedWeight ≠ plan.startWeight).
  const projLo  = Math.min(...projPts);
  const projHi  = Math.max(...projPts);
  const yMin    = Math.min(planLo - buf, dataLo - 1, projLo - 1);
  const yMax    = Math.max(planHi + buf, dataHi + 1, projHi + 1);
  const yR      = yMax - yMin;

  const PAD = { t: 28, r: 20, b: 32, l: 48 };
  const cW  = W - PAD.l - PAD.r;
  const cH  = H - PAD.t - PAD.b;

  const xOf = (wk: number) => PAD.l + (Math.min(Math.max(wk, 0), totalWks) / totalWks) * cW;
  const yOf = (v: number)  => PAD.t + (1 - (v - yMin) / yR) * cH;

  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * cH;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(158,161,168,0.65)'; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(yMax - (i / 4) * yR) + '', PAD.l - 5, y + 3);
  }

  const stepW = Math.max(1, Math.ceil(totalWks / 6));
  ctx.fillStyle = 'rgba(158,161,168,0.65)'; ctx.textAlign = 'center'; ctx.font = '9px JetBrains Mono, monospace';
  for (let w = 0; w <= totalWks; w += stepW) ctx.fillText(`W${w}`, xOf(w), H - PAD.b + 14);

  ctx.strokeStyle = 'rgba(109,255,153,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, yOf(goalWt)); ctx.lineTo(PAD.l + cW, yOf(goalWt)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(109,255,153,0.7)'; ctx.textAlign = 'right'; ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText('GOAL', PAD.l - 5, yOf(goalWt) + 3);

  if (currentWeek >= 0 && currentWeek < totalWks) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(xOf(currentWeek), PAD.t); ctx.lineTo(xOf(currentWeek), PAD.t + cH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'center'; ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillText('NOW', xOf(currentWeek), PAD.t - 6);
  }

  const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
  grad.addColorStop(0, 'rgba(79,195,247,0.10)'); grad.addColorStop(1, 'rgba(79,195,247,0)');
  ctx.beginPath(); ctx.fillStyle = grad;
  projPts.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(totalWks), PAD.t + cH); ctx.lineTo(xOf(0), PAD.t + cH); ctx.closePath(); ctx.fill();

  ctx.beginPath(); ctx.strokeStyle = 'rgba(79,195,247,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
  projPts.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
  ctx.stroke(); ctx.setLineDash([]);

  if (chartPts.length >= 2) {
    // Polyline through every logged weight (not a shortcut from first to
    // last). Each segment is colored by whether the segment's end-point is
    // ahead of or behind the projection at that week, so the user can see
    // exactly when they drifted in/out of pace.
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    for (let i = 1; i < chartPts.length; i++) {
      const a = chartPts[i - 1];
      const b = chartPts[i];
      const projAtB = startWt + ratePerWk * b.week;
      const isAhead = plan.type === 'cut' ? b.weight <= projAtB : b.weight >= projAtB;
      ctx.beginPath();
      ctx.strokeStyle = isAhead ? 'rgba(109,255,153,0.55)' : 'rgba(255,77,94,0.55)';
      ctx.moveTo(xOf(a.week), yOf(a.weight));
      ctx.lineTo(xOf(b.week), yOf(b.weight));
      ctx.stroke();
    }
  }

  const firstEntryAtStart = chartPts.length > 0 && chartPts[0].week <= 0.2;
  if (!firstEntryAtStart) {
    ctx.beginPath(); ctx.arc(xOf(0), yOf(startWt), 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(79,195,247,0.8)'; ctx.fill();
    ctx.fillStyle = 'rgba(158,161,168,0.75)'; ctx.textAlign = 'left'; ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText('START', xOf(0) + 7, yOf(startWt) - 5);
  }

  chartPts.forEach((p, i) => {
    const isLatest  = i === chartPts.length - 1;
    const projAtWk  = startWt + ratePerWk * p.week;
    const isEntryAhead = plan.type === 'cut' ? p.weight <= projAtWk : p.weight >= projAtWk;
    const col       = isEntryAhead ? '#6DFF99' : '#FF4D5E';
    const x = xOf(p.week), y = yOf(p.weight);

    if (isLatest) {
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fillStyle = col + '18'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 9,  0, Math.PI * 2); ctx.fillStyle = col + '35'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 6,  0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 3,  0, Math.PI * 2); ctx.fillStyle = '#07080A'; ctx.fill();
      ctx.fillStyle = col; ctx.font = 'bold 10px JetBrains Mono, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${p.weight.toFixed(1)} lb`, x + 10, y + 4);
    } else {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = '#07080A'; ctx.fill();
    }
  });
}
