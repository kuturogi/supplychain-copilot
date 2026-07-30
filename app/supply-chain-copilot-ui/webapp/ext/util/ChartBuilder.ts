/**
 * ChartBuilder — saf SVG, sıfır bağımlılık.
 * Modern, animasyonlu, enterprise kalitesinde grafikler.
 */

import { escapeHtml as esc } from "./Html";

const PALETTE = [
    "#4f8ef7", "#34c38f", "#f4a534", "#e05a5a", "#a78bfa",
    "#22c4c4", "#f97316", "#84cc16", "#e879f9", "#38bdf8"
];

function num(n: number): string {
    return n.toLocaleString("tr-TR");
}

// ─── Donut / Pasta ────────────────────────────────────────────────────────────

export interface PieSlice { label: string; value: number; color?: string; }

export function buildPieChart(slices: PieSlice[], title: string): string {
    const filtered = slices.filter(s => s.value > 0);
    if (filtered.length === 0) return buildEmptyChart(title);

    const total = filtered.reduce((s, d) => s + d.value, 0);
    const SIZE = 160;
    const cx = SIZE / 2, cy = SIZE / 2;
    const R = 62, r = 34;
    let angle = -Math.PI / 2;

    const paths = filtered.map((slice, i) => {
        const color = slice.color ?? PALETTE[i % PALETTE.length];
        const sweep = (slice.value / total) * 2 * Math.PI;
        const end   = angle + sweep;
        const large = sweep > Math.PI ? 1 : 0;
        const x1 = cx + R * Math.cos(angle),  y1 = cy + R * Math.sin(angle);
        const x2 = cx + R * Math.cos(end),    y2 = cy + R * Math.sin(end);
        const ix1 = cx + r * Math.cos(angle), iy1 = cy + r * Math.sin(angle);
        const ix2 = cx + r * Math.cos(end),   iy2 = cy + r * Math.sin(end);
        const pct  = Math.round((slice.value / total) * 100);
        const mid  = angle + sweep / 2;
        const lx   = cx + (R * 0.68) * Math.cos(mid);
        const ly   = cy + (R * 0.68) * Math.sin(mid);
        angle = end;
        return `
            <path d="M${ix1},${iy1} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${r},${r} 0 ${large},0 ${ix1},${iy1} Z"
                  fill="${color}" stroke="#fff" stroke-width="2" class="stPieSlice">
                <title>${esc(slice.label)}: ${num(slice.value)} (%${pct})</title>
            </path>
            ${pct >= 7 ? `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle"
                fill="#fff" font-size="9.5" font-weight="700" pointer-events="none">%${pct}</text>` : ""}`;
    });

    const legendItems = filtered.map((slice, i) => {
        const color = slice.color ?? PALETTE[i % PALETTE.length];
        const pct   = Math.round((slice.value / total) * 100);
        return `<div class="stPieLegendItem">
            <span class="stPieLegendDot" style="background:${color}"></span>
            <span class="stPieLegendLabel">${esc(slice.label)}</span>
            <span class="stPieLegendPct">%${pct}</span>
            <span class="stPieLegendVal">${num(slice.value)}</span>
        </div>`;
    });

    return `<div class="stChartCard">
        <div class="stChartHeader">
            <span class="stChartIcon">🍩</span>
            <span class="stChartTitle">${esc(title)}</span>
        </div>
        <div class="stPieWrapper">
            <div class="stPieSvgWrap">
                <svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
                    <defs>
                        <filter id="pieShadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12"/>
                        </filter>
                    </defs>
                    <g filter="url(#pieShadow)">${paths.join("")}</g>
                    <text x="${cx}" y="${cy - 7}" text-anchor="middle" font-size="15" fill="#1a1a2e" font-weight="800">${num(total)}</text>
                    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="9" fill="#8c8c8c" font-weight="500">TOPLAM</text>
                </svg>
            </div>
            <div class="stPieLegend">${legendItems.join("")}</div>
        </div>
    </div>`;
}

// ─── Yatay Bar ────────────────────────────────────────────────────────────────

export interface BarItem {
    label: string; value: number; value2?: number;
    color?: string; color2?: string;
    tooltip?: string; tooltip2?: string;
}

export function buildHorizontalBarChart(
    items: BarItem[], title: string,
    legend1 = "", legend2 = "", icon = "📊"
): string {
    if (items.length === 0) return buildEmptyChart(title);

    const maxVal     = Math.max(...items.flatMap(i => [i.value, i.value2 ?? 0]), 1);
    const hasSeries2 = items.some(i => (i.value2 ?? 0) > 0);
    const rowH       = hasSeries2 ? 44 : 32;
    const barH1      = hasSeries2 ? 11 : 16;
    const barH2      = 9;
    const labelW     = 80;
    const barAreaW   = 200;
    const valW       = 55;
    const W          = labelW + barAreaW + valW;
    const H          = items.length * rowH + 10;
    const gradId1    = `bg1_${Math.random().toString(36).slice(2,6)}`;
    const gradId2    = `bg2_${Math.random().toString(36).slice(2,6)}`;

    const color1 = items[0]?.color  ?? PALETTE[0];
    const color2 = items[0]?.color2 ?? PALETTE[2];

    const rows = items.map((item, idx) => {
        const y   = idx * rowH + 8;
        const c1  = item.color  ?? color1;
        const c2  = item.color2 ?? color2;
        const bw1 = (item.value / maxVal) * barAreaW;
        const bw2 = hasSeries2 && item.value2 ? (item.value2 / maxVal) * barAreaW : 0;

        return `
        <text x="${labelW - 6}" y="${y + barH1 / 2 + 4}" text-anchor="end"
              font-size="10" fill="#444" font-weight="500">${esc(item.label)}</text>

        <rect x="${labelW}" y="${y}" width="${barAreaW}" height="${barH1}" rx="4" fill="#f0f0f0"/>
        <rect x="${labelW}" y="${y}" width="${bw1}" height="${barH1}" rx="4" fill="url(#${gradId1})" class="stBarAnim">
            <title>${esc(item.tooltip ?? item.label + ": " + num(item.value))}</title>
        </rect>
        <text x="${labelW + bw1 + 5}" y="${y + barH1 / 2 + 4}" font-size="9" fill="#555" font-weight="600">${num(item.value)}</text>

        ${hasSeries2 && item.value2 !== undefined ? `
        <rect x="${labelW}" y="${y + barH1 + 4}" width="${barAreaW}" height="${barH2}" rx="3" fill="#f0f0f0"/>
        <rect x="${labelW}" y="${y + barH1 + 4}" width="${bw2}" height="${barH2}" rx="3" fill="url(#${gradId2})" opacity="0.85" class="stBarAnim">
            <title>${esc(item.tooltip2 ?? item.label + ": " + num(item.value2))}</title>
        </rect>
        <text x="${labelW + bw2 + 5}" y="${y + barH1 + 4 + barH2 / 2 + 4}" font-size="8" fill="#777">${num(item.value2)}</text>
        ` : ""}`;
    }).join("");

    const legendHtml = hasSeries2 ? `
        <div class="stChartLegendRow">
            <span class="stLegendPill" style="background:${color1}20;color:${color1};border:1px solid ${color1}40">${esc(legend1)}</span>
            <span class="stLegendPill" style="background:${color2}20;color:${color2};border:1px solid ${color2}40">${esc(legend2)}</span>
        </div>` : "";

    return `<div class="stChartCard">
        <div class="stChartHeader">
            <span class="stChartIcon">${icon}</span>
            <span class="stChartTitle">${esc(title)}</span>
        </div>
        ${legendHtml}
        <svg viewBox="0 0 ${W} ${H}" width="100%" class="stBarSvg">
            <defs>
                <linearGradient id="${gradId1}" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="${color1}" stop-opacity="1"/>
                    <stop offset="100%" stop-color="${color1}" stop-opacity="0.6"/>
                </linearGradient>
                <linearGradient id="${gradId2}" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="${color2}" stop-opacity="1"/>
                    <stop offset="100%" stop-color="${color2}" stop-opacity="0.6"/>
                </linearGradient>
            </defs>
            ${rows}
        </svg>
    </div>`;
}

// ─── Funnel ───────────────────────────────────────────────────────────────────

export interface FunnelStep { label: string; value: number; color?: string; }

export function buildFunnelChart(steps: FunnelStep[], title: string): string {
    if (steps.length === 0) return buildEmptyChart(title);

    const maxVal  = Math.max(...steps.map(s => s.value), 1);
    const W       = 260;
    const stepH   = 52;
    const H       = steps.length * stepH + 16;
    const maxBarW = W * 0.88;

    const rects = steps.map((step, idx) => {
        const color  = step.color ?? PALETTE[idx % PALETTE.length];
        const barW   = (step.value / maxVal) * maxBarW;
        const x      = (W - barW) / 2;
        const y      = idx * stepH + 8;
        const pct    = idx === 0 ? 100 : Math.round((step.value / (steps[0].value || 1)) * 100);
        const gradId = `fg_${idx}_${Math.random().toString(36).slice(2,5)}`;

        return `
        <defs>
            <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
                <stop offset="100%" stop-color="${color}" stop-opacity="0.75"/>
            </linearGradient>
        </defs>
        <rect x="${x}" y="${y}" width="${barW}" height="32" rx="8"
              fill="url(#${gradId})" class="stBarAnim">
            <title>${esc(step.label)}: ${num(step.value)}</title>
        </rect>
        <text x="${W / 2}" y="${y + 14}" text-anchor="middle"
              fill="#fff" font-size="11" font-weight="700">${esc(step.label)}</text>
        <text x="${W / 2}" y="${y + 27}" text-anchor="middle"
              fill="#fff" font-size="9" opacity="0.9">
              ${num(step.value)} adet${idx > 0 ? "  ▸  %" + pct : ""}
        </text>
        ${idx < steps.length - 1 ? `
        <polygon points="${W/2-7},${y+33} ${W/2+7},${y+33} ${W/2},${y+43}"
                 fill="#d0d0d0"/>` : ""}`;
    }).join("");

    return `<div class="stChartCard">
        <div class="stChartHeader">
            <span class="stChartIcon">🔻</span>
            <span class="stChartTitle">${esc(title)}</span>
        </div>
        <div class="stFunnelWrap">
            <svg viewBox="0 0 ${W} ${H}" width="100%" class="stFunnelSvg">
                ${rects}
            </svg>
        </div>
    </div>`;
}

// ─── Boş durum ────────────────────────────────────────────────────────────────

function buildEmptyChart(title: string): string {
    return `<div class="stChartCard stChartCard--empty">
        <div class="stChartHeader">
            <span class="stChartIcon">📭</span>
            <span class="stChartTitle">${esc(title)}</span>
        </div>
        <div class="stChartEmpty">Gösterilecek veri bulunamadı</div>
    </div>`;
}
