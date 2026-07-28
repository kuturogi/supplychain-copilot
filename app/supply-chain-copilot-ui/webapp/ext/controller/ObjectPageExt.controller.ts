import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";

import { openAIResultDialog, runWithBusy } from "../util/AIResponseDialog";

interface Movement {
    changedAt: string;
    changeAmount: number;
    reason: string;
}

/**
 * Stok detay sayfası controller extension'ı.
 * Talep Tahmini ve Sipariş Oluştur aksiyonlarına ek olarak
 * stok hareketi grafiğini dinamik olarak oluşturur.
 */
export default class ObjectPageExt extends ControllerExtension<any> {

    static overrides = {
        onInit(this: ObjectPageExt): void {
            console.log("ObjectPageExt Controller Extension yüklendi.");
        },
        onAfterRendering(this: ObjectPageExt): void {
            this._renderTrendChart();
        }
    };

    // ─── AI Aksiyonları ───────────────────────────────────────────────────────

    public async onForecastDemand(): Promise<void> {
        const view = this.getView();
        const stockLevelId = view?.getBindingContext()?.getProperty("ID");
        if (stockLevelId === undefined || stockLevelId === null) {
            MessageBox.error("Stok kaydı belirlenemedi.");
            return;
        }
        const model = view?.getModel() as ODataModel;
        const result = await runWithBusy("Talep tahmini hesaplanıyor...", async () => {
            const binding = model.bindContext("/forecastDemand(...)");
            binding.setParameter("stockLevelId", stockLevelId);
            await binding.execute();
            return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
        });
        if (result !== undefined) {
            openAIResultDialog({ title: "Talep Tahmini Raporu", text: result });
        }
    }

    public async onCreateOrder(): Promise<void> {
        const view = this.getView();
        const stockLevelId = view?.getBindingContext()?.getProperty("ID");
        if (stockLevelId === undefined || stockLevelId === null) {
            MessageBox.error("Stok kaydı belirlenemedi.");
            return;
        }
        const model = view?.getModel() as ODataModel;
        const result = await runWithBusy("Sipariş taslağı oluşturuluyor...", async () => {
            const binding = model.bindContext("/createPurchaseOrder(...)");
            binding.setParameter("stockLevelId", stockLevelId);
            binding.setParameter("quantity", 0);
            await binding.execute();
            return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
        });
        if (result !== undefined) {
            openAIResultDialog({ title: "Sipariş Taslağı Oluşturuldu", text: result, state: "Success" });
        }
    }

    // ─── Trend Grafiği ────────────────────────────────────────────────────────

    private async _renderTrendChart(): Promise<void> {
        // Kısa gecikme: DOM hazır olsun
        await new Promise(r => setTimeout(r, 800));

        const view = this.getView();
        const ctx = view?.getBindingContext();
        if (!ctx) return;

        const stockLevelId = ctx.getProperty("ID");
        const currentQty: number = ctx.getProperty("quantity") ?? 0;
        const threshold: number = ctx.getProperty("criticalThreshold") ?? 0;

        if (!stockLevelId) return;

        // Mevcut grafik varsa yeniden çizme
        if (document.getElementById("stTrendChart_" + stockLevelId)) return;

        try {
            const model = view?.getModel() as ODataModel;
            const listBinding = model.bindList("/StockMovements", ctx);
            const contexts = await listBinding.requestContexts(0, 50);
            const movements: Movement[] = contexts
                .map(c => c.getObject() as Movement)
                .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());

            if (movements.length === 0) return;

            // Stok seviyesini yeniden hesapla (hareketlerden geriye doğru)
            const stockPoints = this._computeStockPoints(currentQty, movements);

            // Grafik konteynerini bul — StockMovements facet'in içine yerleştir
            const facetSection = document.querySelector(
                "[id*='MovementsFacet'], [id*='movementsFacet'], .sapUxAPObjectPageSubSection"
            );
            if (!facetSection) return;

            const chartContainer = document.createElement("div");
            chartContainer.id = "stTrendChart_" + stockLevelId;
            chartContainer.className = "stTrendChartContainer";
            chartContainer.innerHTML = this._buildChartHTML(stockPoints, threshold);

            const targetSection = facetSection.parentElement ?? facetSection;
            targetSection.insertBefore(chartContainer, targetSection.firstChild);

        } catch (error) {
            console.error("Trend grafiği oluşturma hatası:", error);
        }
    }

    /** Mevcut stok ve hareketlerden her nokta için stok seviyesini hesaplar */
    private _computeStockPoints(
        currentQty: number,
        movements: Movement[]
    ): Array<{ date: string; qty: number; change: number; reason: string }> {
        const points: Array<{ date: string; qty: number; change: number; reason: string }> = [];

        // Geriye doğru stok seviyelerini hesapla
        let qty = currentQty;
        const reversed = [...movements].reverse();
        const raw: Array<{ date: string; qty: number; change: number; reason: string }> = [];

        for (const m of reversed) {
            raw.push({
                date: m.changedAt,
                qty,
                change: m.changeAmount,
                reason: m.reason ?? ""
            });
            qty -= m.changeAmount; // geriye doğru gittiğimiz için tersine çeviriyoruz
        }

        // İlk noktayı ekle (en eski, hesaplanan başlangıç stoku)
        raw.push({ date: movements[0].changedAt, qty, change: 0, reason: "Başlangıç" });

        return raw.reverse();
    }

    private _buildChartHTML(
        points: Array<{ date: string; qty: number; change: number; reason: string }>,
        threshold: number
    ): string {
        if (points.length < 2) return "";

        const maxQty = Math.max(...points.map(p => p.qty), threshold * 2);
        const W = 560;
        const H = 180;
        const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
        const chartW = W - PAD.left - PAD.right;
        const chartH = H - PAD.top - PAD.bottom;

        const xStep = chartW / (points.length - 1);
        const yScale = (v: number) => chartH - (v / maxQty) * chartH;

        // Poliyline nokta dizisi
        const linePoints = points
            .map((p, i) => `${PAD.left + i * xStep},${PAD.top + yScale(p.qty)}`)
            .join(" ");

        // Alan (fill) için kapalı çokgen
        const areaPoints =
            `${PAD.left},${PAD.top + chartH} ` +
            points.map((p, i) => `${PAD.left + i * xStep},${PAD.top + yScale(p.qty)}`).join(" ") +
            ` ${PAD.left + (points.length - 1) * xStep},${PAD.top + chartH}`;

        // Kritik eşik çizgisi
        const thresholdY = PAD.top + yScale(threshold);

        // X ekseni etiketleri (en fazla 6 etiket)
        const labelStep = Math.max(1, Math.floor(points.length / 5));
        const xLabels = points
            .filter((_, i) => i % labelStep === 0 || i === points.length - 1)
            .map((p, idx, arr) => {
                const origIdx = idx * labelStep;
                const x = PAD.left + Math.min(origIdx, points.length - 1) * xStep;
                const date = new Date(p.date);
                const label = isNaN(date.getTime())
                    ? `#${origIdx + 1}`
                    : `${date.getDate()}/${date.getMonth() + 1}`;
                return `<text x="${x}" y="${H - 8}" class="stChartLabel">${label}</text>`;
            }).join("");

        // Y ekseni etiketleri
        const yLabels = [0, Math.round(maxQty / 2), maxQty].map(v => {
            const y = PAD.top + yScale(v);
            return `<text x="${PAD.left - 6}" y="${y + 4}" class="stChartLabel stChartLabelY">${v}</text>`;
        }).join("");

        // Veri noktası daireler ve tooltip title'ları
        const dots = points.map((p, i) => {
            const x = PAD.left + i * xStep;
            const y = PAD.top + yScale(p.qty);
            const isCrit = p.qty <= threshold;
            const tooltip = `${new Date(p.date).toLocaleDateString("tr-TR")}: ${p.qty} adet (${p.change >= 0 ? "+" : ""}${p.change})`;
            return `<circle cx="${x}" cy="${y}" r="4" class="${isCrit ? "stChartDotCrit" : "stChartDot"}"><title>${tooltip}</title></circle>`;
        }).join("");

        return `
            <div class="stTrendChartCard">
                <div class="stTrendChartTitle">
                    <span>📈</span> Stok Seviyesi Trendi
                    <span class="stTrendChartLegend">
                        <span class="stLegendDot stLegendDot--line"></span> Stok
                        <span class="stLegendDot stLegendDot--threshold"></span> Kritik Eşik
                    </span>
                </div>
                <svg viewBox="0 0 ${W} ${H}" class="stTrendSvg" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#0064d9" stop-opacity="0.18"/>
                            <stop offset="100%" stop-color="#0064d9" stop-opacity="0.01"/>
                        </linearGradient>
                    </defs>
                    <!-- Alan -->
                    <polygon points="${areaPoints}" fill="url(#areaGrad)" />
                    <!-- Kritik eşik -->
                    <line x1="${PAD.left}" y1="${thresholdY}" x2="${W - PAD.right}" y2="${thresholdY}"
                          stroke="#bb0000" stroke-dasharray="5,3" stroke-width="1.5" opacity="0.7"/>
                    <text x="${W - PAD.right + 3}" y="${thresholdY + 4}" class="stChartThresholdLabel">Eşik</text>
                    <!-- Çizgi -->
                    <polyline points="${linePoints}" fill="none" stroke="#0064d9" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
                    <!-- Eksen çizgileri -->
                    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + chartH}"
                          stroke="#c8caca" stroke-width="1"/>
                    <line x1="${PAD.left}" y1="${PAD.top + chartH}" x2="${W - PAD.right}" y2="${PAD.top + chartH}"
                          stroke="#c8caca" stroke-width="1"/>
                    <!-- Etiketler -->
                    ${xLabels}
                    ${yLabels}
                    <!-- Noktalar -->
                    ${dots}
                </svg>
                <div class="stTrendChartNote">Her nokta üzerine gelerek detay görebilirsiniz.</div>
            </div>
        `;
    }
}
