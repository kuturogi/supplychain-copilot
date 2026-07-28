/**
 * ChartBuilder — saf SVG ile çalışan grafik yardımcı modülü.
 * Hiçbir harici kütüphane gerektirmez; tüm grafikler inline SVG üretir.
 */

// ─── Renk paleti ─────────────────────────────────────────────────────────────

const PALETTE = [
    "#0064d9", "#107e3e", "#e76500", "#6c3483", "#c0392b",
    "#1a7f8e", "#d4ac0d", "#784212", "#1e8bc3", "#27ae60"
];

function esc(s: string): string {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ─── Pasta Grafiği ────────────────────────────────────────────────────────────

export interface PieSlice {
    label: string;
    value: number;
    color?: string;
}

export function buildPieChart(slices: PieSlice[], title: string, size = 220): string {
    const total = slices.reduce((s, d) => s + d.value, 0);
    if (total === 0) return buildEmptyChart(title, size);

    const cx = size / 2;
    const cy = size / 2;
    const r  = size * 0.36;
    const ir = size * 0.18; // iç boşluk (donut)

    let angle = -Math.PI / 2;
    const paths: string[] = [];
    const legends: string[] = [];

    slices.forEach((slice, i) => {
        const color = slice.color ?? PALETTE[i % PALETTE.length];
        const ratio = slice.value / total;
        const sweep = ratio * 2 * Math.PI;
        const endAngle = angle + sweep;

        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const ix1 = cx + ir * Math.cos(angle);
        const iy1 = cy + ir * Math.sin(angle);
        const ix2 = cx + ir * Math.cos(endAngle);
        const iy2 = cy + ir * Math.sin(endAngle);
        const large = sweep > Math.PI ? 1 : 0;

        const pct = Math.round(ratio * 100);
        const midAngle = angle + sweep / 2;
        const lx = cx + (r * 0.72) * Math.cos(midAngle);
        const ly = cy + (r * 0.72) * Math.sin(midAngle);

        paths.push(`
            <path d="M${ix1},${iy1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${ir},${ir} 0 ${large},0 ${ix1},${iy1} Z"
                  fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.92">
                <title>${esc(slice.label)}: ${slice.value.toLocaleString("tr-TR")} (%${pct})</title>
            </path>
            ${pct >= 8 ? `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="9" font-weight="600">%${pct}</text>` : ""}
        `);

        legends.push(`
            <div class="stPieLegendItem">
                <span class="stPieLegendDot" style="background:${color}"></span>
                <span class="stPieLegendLabel">${esc(slice.label)}</span>
                <span class="stPieLegendValue">${slice.value.toLocaleString("tr-TR")}</span>
            </div>
        `);

        angle = endAngle;
    });

    return `
        <div class="stChartCard">
            <div class="stChartTitle">${esc(title)}</div>
            <div class="stPieWrapper">
                <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="stPieSvg">
                    ${paths.join("")}
                    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="11" fill="#32363a" font-weight="700">${total.toLocaleString("tr-TR")}</text>
                    <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="8" fill="#6a6d70">toplam</text>
                </svg>
                <div class="stPieLegend">${legends.join("")}</div>
            </div>
        </div>
    `;
}

// ─── Yatay Bar Grafiği ────────────────────────────────────────────────────────

export interface BarItem {
    label: string;
    value: number;
    value2?: number;     // ikinci seri (karşılaştırma)
    color?: string;
    color2?: string;
    tooltip?: string;
    tooltip2?: string;
}

export function buildHorizontalBarChart(
    items: BarItem[],
    title: string,
    legend1 = "",
    legend2 = ""
): string {
    if (items.length === 0) return buildEmptyChart(title, 200);

    const maxVal = Math.max(...items.flatMap(i => [i.value, i.value2 ?? 0]));
    const rowH = 32;
    const labelW = 140;
    const barAreaW = 260;
    const W = labelW + barAreaW + 60;
    const H = items.length * rowH + 40;
    const hasSeries2 = items.some(i => i.value2 !== undefined);

    const rows = items.map((item, idx) => {
        const y = idx * rowH + 20;
        const color = item.color ?? PALETTE[0];
        const color2 = item.color2 ?? PALETTE[2];
        const barW = maxVal > 0 ? (item.value / maxVal) * barAreaW : 0;
        const barW2 = (hasSeries2 && item.value2 !== undefined && maxVal > 0)
            ? (item.value2 / maxVal) * barAreaW : 0;
        const barH = hasSeries2 ? 9 : 14;
        const offset2 = hasSeries2 ? 11 : 0;

        return `
            <text x="${labelW - 6}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="9" fill="#32363a">${esc(item.label)}</text>
            <rect x="${labelW}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${color}" opacity="0.88">
                <title>${item.tooltip ?? item.label + ": " + item.value.toLocaleString("tr-TR")}</title>
            </rect>
            <text x="${labelW + barW + 4}" y="${y + barH / 2 + 4}" font-size="8" fill="#6a6d70">${item.value.toLocaleString("tr-TR")}</text>
            ${hasSeries2 && item.value2 !== undefined ? `
            <rect x="${labelW}" y="${y + offset2}" width="${barW2}" height="${barH}" rx="2" fill="${color2}" opacity="0.7">
                <title>${item.tooltip2 ?? item.label + " (2): " + item.value2.toLocaleString("tr-TR")}</title>
            </rect>
            <text x="${labelW + barW2 + 4}" y="${y + offset2 + barH / 2 + 4}" font-size="8" fill="#6a6d70">${item.value2.toLocaleString("tr-TR")}</text>
            ` : ""}
        `;
    }).join("");

    const legendHtml = hasSeries2 ? `
        <div class="stChartLegendRow">
            <span class="stLegendDot" style="background:${PALETTE[0]};width:12px;height:12px;border-radius:2px;display:inline-block;margin-right:4px"></span><span style="font-size:0.75rem">${esc(legend1)}</span>
            &nbsp;&nbsp;
            <span class="stLegendDot" style="background:${PALETTE[2]};width:12px;height:12px;border-radius:2px;display:inline-block;margin-right:4px"></span><span style="font-size:0.75rem">${esc(legend2)}</span>
        </div>` : "";

    return `
        <div class="stChartCard">
            <div class="stChartTitle">${esc(title)}</div>
            ${legendHtml}
            <svg viewBox="0 0 ${W} ${H}" width="100%" class="stBarSvg">
                ${rows}
            </svg>
        </div>
    `;
}

// ─── Funnel Grafiği ───────────────────────────────────────────────────────────

export interface FunnelStep {
    label: string;
    value: number;
    color?: string;
}

export function buildFunnelChart(steps: FunnelStep[], title: string): string {
    if (steps.length === 0) return buildEmptyChart(title, 200);

    const maxVal = Math.max(...steps.map(s => s.value));
    const W = 320;
    const stepH = 44;
    const H = steps.length * stepH + 20;
    const maxBarW = W * 0.78;

    const rects = steps.map((step, idx) => {
        const color = step.color ?? PALETTE[idx % PALETTE.length];
        const ratio = maxVal > 0 ? step.value / maxVal : 0;
        const barW = maxBarW * ratio;
        const x = (W - barW) / 2;
        const y = idx * stepH + 10;
        const pct = idx === 0 ? 100 : Math.round((step.value / steps[0].value) * 100);

        return `
            <rect x="${x}" y="${y}" width="${barW}" height="28" rx="4" fill="${color}" opacity="0.85">
                <title>${esc(step.label)}: ${step.value}</title>
            </rect>
            <text x="${W / 2}" y="${y + 18}" text-anchor="middle" fill="#fff" font-size="10" font-weight="600">${esc(step.label)}</text>
            <text x="${W / 2}" y="${y + 30}" text-anchor="middle" fill="#fff" font-size="8" opacity="0.85">${step.value} adet${idx > 0 ? " (%"+pct+")" : ""}</text>
            ${idx < steps.length - 1 ? `
            <polygon points="${W/2-6},${y+29} ${W/2+6},${y+29} ${W/2},${y+37}" fill="#ccc"/>
            ` : ""}
        `;
    }).join("");

    return `
        <div class="stChartCard">
            <div class="stChartTitle">${esc(title)}</div>
            <svg viewBox="0 0 ${W} ${H}" width="100%" class="stFunnelSvg">
                ${rects}
            </svg>
        </div>
    `;
}

// ─── Boş durum ────────────────────────────────────────────────────────────────

function buildEmptyChart(title: string, size: number): string {
    return `
        <div class="stChartCard">
            <div class="stChartTitle">${esc(title)}</div>
            <div class="stChartEmpty">Gösterilecek veri yok</div>
        </div>
    `;
}
