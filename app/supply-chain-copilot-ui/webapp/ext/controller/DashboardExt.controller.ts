import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import GenericTile from "sap/m/GenericTile";
import TileContent from "sap/m/TileContent";
import NumericContent from "sap/m/NumericContent";
import Text from "sap/m/Text";
import Icon from "sap/ui/core/Icon";
import Title from "sap/m/Title";
import Panel from "sap/m/Panel";
import Bar from "sap/m/Bar";
import FlexBox from "sap/m/FlexBox";
import { openAIResultDialog, runWithBusy } from "../util/AIResponseDialog";
import Button from "sap/m/Button";

interface StoreSummaryRow {
    storeId: number;
    storeName: string;
    location: string;
    recordCount: number;
    totalQuantity: number;
    criticalCount: number;
    totalValue: number;
    summaryCriticality: number;
}

interface KPITotals {
    totalValue: number;
    totalQuantity: number;
    criticalCount: number;
    storeCount: number;
    healthyStores: number;
}

/**
 * Dashboard sayfası controller extension'ı.
 * StockSummaryByStore verisini okuyup üst kısma KPI kartları ve
 * mağaza bazlı mini göstergeler ekler.
 */
export default class DashboardExt extends ControllerExtension<any> {

    private _kpiModel: JSONModel = new JSONModel({ kpis: null });

    static overrides = {
        onInit(this: DashboardExt): void {
            this.getView()?.setModel(this._kpiModel, "kpi");
            this._loadAndRenderKPIs();
        },
        onAfterRendering(this: DashboardExt): void {
            // Sayfa her render sonrası KPI panelini kontrol et;
            // panel yoksa (ilk render) ekle.
            if (!document.getElementById("stDashboardKpiPanel")) {
                this._injectKPIPanel();
            }
        }
    };

    // ─── Veri yükleme ────────────────────────────────────────────────────────

    private async _loadAndRenderKPIs(): Promise<void> {
        try {
            const model = this.getView()?.getModel() as ODataModel;
            const listBinding = model.bindList("/StockSummaryByStore");
            const contexts = await listBinding.requestContexts(0, 100);
            const rows: StoreSummaryRow[] = contexts.map(ctx => ctx.getObject() as StoreSummaryRow);

            const totals = this._computeTotals(rows);
            this._kpiModel.setData({ kpis: totals, rows });
            this._injectKPIPanel(totals, rows);
        } catch (error) {
            console.error("Dashboard KPI yükleme hatası:", error);
        }
    }

    private _computeTotals(rows: StoreSummaryRow[]): KPITotals {
        return {
            totalValue: rows.reduce((s, r) => s + (r.totalValue ?? 0), 0),
            totalQuantity: rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0),
            criticalCount: rows.reduce((s, r) => s + (r.criticalCount ?? 0), 0),
            storeCount: rows.length,
            healthyStores: rows.filter(r => (r.criticalCount ?? 0) === 0).length
        };
    }

    // ─── KPI panel enjeksiyonu ────────────────────────────────────────────────

    private _injectKPIPanel(totals?: KPITotals, rows?: StoreSummaryRow[]): void {
        // Sayfa DOM hazır olmayabilir; kısa gecikmeyle tekrar dene
        setTimeout(() => {
            const listPage = document.querySelector(".sapFDynamicPageContent, .sapUiRespGridMedia, .sapMListPage, .sapMPage");
            if (!listPage || document.getElementById("stDashboardKpiPanel")) return;
            if (!totals) return;

            const panel = document.createElement("div");
            panel.id = "stDashboardKpiPanel";
            panel.className = "stDashboardKpiPanel";
            panel.innerHTML = this._buildKPIPanelHTML(totals, rows ?? []);
            listPage.insertBefore(panel, listPage.firstChild);
        }, 600);
    }

    private _buildKPIPanelHTML(totals: KPITotals, rows: StoreSummaryRow[]): string {
        const fmt = (n: number) => n.toLocaleString("tr-TR");
        const fmtCurrency = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";

        const healthPct = totals.storeCount > 0
            ? Math.round((totals.healthyStores / totals.storeCount) * 100)
            : 100;

        const kpiCards = [
            {
                icon: "💰",
                label: "Toplam Stok Değeri",
                value: fmtCurrency(totals.totalValue),
                sub: `${totals.storeCount} mağaza`,
                state: "neutral"
            },
            {
                icon: "📦",
                label: "Toplam Stok Adedi",
                value: fmt(totals.totalQuantity),
                sub: "Tüm mağazalar",
                state: "neutral"
            },
            {
                icon: totals.criticalCount > 0 ? "⚠️" : "✅",
                label: "Kritik Ürün Sayısı",
                value: String(totals.criticalCount),
                sub: totals.criticalCount > 0 ? "Acil aksiyon gerekli" : "Tüm stoklar sağlıklı",
                state: totals.criticalCount > 0 ? "critical" : "good"
            },
            {
                icon: "🏪",
                label: "Sağlıklı Mağaza",
                value: `${totals.healthyStores} / ${totals.storeCount}`,
                sub: `%${healthPct} kritik ürünsüz`,
                state: healthPct === 100 ? "good" : healthPct >= 50 ? "warning" : "critical"
            }
        ];

        const kpiHtml = kpiCards.map(c => `
            <div class="stKpiCard stKpiCard--${c.state}">
                <div class="stKpiCard__icon">${c.icon}</div>
                <div class="stKpiCard__body">
                    <div class="stKpiCard__value">${c.value}</div>
                    <div class="stKpiCard__label">${c.label}</div>
                    <div class="stKpiCard__sub">${c.sub}</div>
                </div>
            </div>
        `).join("");

        const sparkRows = rows.map(r => {
            const pct = totals.totalValue > 0 ? Math.round((r.totalValue / totals.totalValue) * 100) : 0;
            const statusClass = r.criticalCount > 0 ? "stSparkRow--critical" : "stSparkRow--ok";
            return `
                <div class="stSparkRow ${statusClass}">
                    <div class="stSparkRow__label">
                        <span class="stSparkRow__dot"></span>
                        <strong>${r.storeName}</strong>
                        <span class="stSparkRow__loc">${r.location}</span>
                    </div>
                    <div class="stSparkRow__bar">
                        <div class="stSparkRow__fill" style="width:${pct}%"></div>
                    </div>
                    <div class="stSparkRow__stats">
                        <span>${r.totalQuantity.toLocaleString("tr-TR")} adet</span>
                        ${r.criticalCount > 0 ? `<span class="stSparkRow__crit">⚠ ${r.criticalCount} kritik</span>` : `<span class="stSparkRow__ok">✓</span>`}
                        <span>${r.totalValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺</span>
                    </div>
                </div>
            `;
        }).join("");

        return `
            <div class="stDashboardHeader">
                <div class="stDashboardHeaderLeft">
                    <span class="stDashboardHeaderIcon">📊</span>
                    <div>
                        <div class="stDashboardTitle">Tedarik Zinciri Dashboard</div>
                        <div class="stDashboardSubtitle">Mağaza stok özeti ve KPI göstergeleri</div>
                    </div>
                </div>
            </div>
            <div class="stKpiGrid">${kpiHtml}</div>
            <div class="stSparkSection">
                <div class="stSparkSection__title">Mağaza Bazlı Stok Dağılımı</div>
                ${sparkRows}
            </div>
        `;
    }

    // ─── Public action — AI Analiz (Dashboard'dan çağrılabilir) ──────────────

    public async onAnalyzeDashboard(): Promise<void> {
        const model = this.getView()?.getModel() as ODataModel;
        const result = await runWithBusy("Dashboard AI analizi yapılıyor...", async () => {
            const binding = model.bindContext("/analyzeStockWithAI(...)");
            await binding.execute();
            return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
        });
        if (result !== undefined) {
            openAIResultDialog({ title: "Dashboard AI Analiz Raporu", text: result });
        }
    }

    public onRefreshDashboard(): void {
        const panel = document.getElementById("stDashboardKpiPanel");
        if (panel) panel.remove();
        this._loadAndRenderKPIs();
    }
}
