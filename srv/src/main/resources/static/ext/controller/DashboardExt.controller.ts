import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import { openAIResultDialog, runWithBusy } from "../util/AIResponseDialog";
import { buildPieChart, buildHorizontalBarChart, buildFunnelChart } from "../util/ChartBuilder";

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

interface Product { ID: number; name: string; category: string; unitPrice: number; }
interface StockLevel { ID: number; quantity: number; criticalThreshold: number; store_ID: number; product_ID: number; }
interface PurchaseOrder { status: string; orderQuantity: number; product_ID: number; supplier_ID: number; createdAt: string; deliveredAt: string; }
interface Supplier { ID: number; name: string; leadTimeDays: number; }

/**
 * Dashboard sayfası controller extension'ı.
 * KPI kartları, mağaza dağılımı ve 3 analitik grafik içerir:
 *  1. Kategori bazlı stok pasta grafiği
 *  2. Sipariş durumu funnel grafiği
 *  3. Tedarikçi performans karşılaştırma bar grafiği
 */
export default class DashboardExt extends ControllerExtension<any> {

    private _kpiModel: JSONModel = new JSONModel({ kpis: null });

    static overrides = {
        onInit(this: DashboardExt): void {
            this.getView()?.setModel(this._kpiModel, "kpi");
            this._loadAndRender();
        },
        onAfterRendering(this: DashboardExt): void {
            if (!document.getElementById("stDashboardKpiPanel")) {
                this._loadAndRender();
            }
        }
    };

    // ─── Veri yükleme ────────────────────────────────────────────────────────────

    private async _loadAndRender(): Promise<void> {
        try {
            const model = this.getView()?.getModel() as ODataModel;

            const [summaryRows, products, stockLevels, orders, suppliers] = await Promise.all([
                this._fetchList<StoreSummaryRow>(model, "/StockSummaryByStore"),
                this._fetchList<Product>(model, "/Products"),
                this._fetchList<StockLevel>(model, "/StockLevels"),
                this._fetchList<PurchaseOrder>(model, "/PurchaseOrders"),
                this._fetchList<Supplier>(model, "/Suppliers")
            ]);

            const totals = this._computeTotals(summaryRows);
            this._kpiModel.setData({ kpis: totals, rows: summaryRows });

            setTimeout(() => this._injectAll(totals, summaryRows, products, stockLevels, orders, suppliers), 600);
        } catch (error) {
            console.error("Dashboard yükleme hatası:", error);
        }
    }

    private async _fetchList<T>(model: ODataModel, path: string): Promise<T[]> {
        const binding = model.bindList(path);
        const contexts = await binding.requestContexts(0, 200);
        return contexts.map(c => c.getObject() as T);
    }

    // ─── Ana enjeksiyon ──────────────────────────────────────────────────────────

    private _injectAll(
        totals: KPITotals,
        summaryRows: StoreSummaryRow[],
        products: Product[],
        stockLevels: StockLevel[],
        orders: PurchaseOrder[],
        suppliers: Supplier[]
    ): void {
        const container = document.querySelector(
            ".sapFDynamicPageContent, .sapUiRespGridMedia, .sapMListPage, .sapMPage"
        );
        if (!container) return;
        if (document.getElementById("stDashboardKpiPanel")) return;

        const panel = document.createElement("div");
        panel.id = "stDashboardKpiPanel";
        panel.className = "stDashboardKpiPanel";
        panel.innerHTML = [
            this._buildHeaderAndKPIs(totals, summaryRows),
            this._buildChartsSection(summaryRows, products, stockLevels, orders, suppliers)
        ].join("");

        container.insertBefore(panel, container.firstChild);
    }

    // ─── KPI Kartları + Mağaza Spark ─────────────────────────────────────────────

    private _computeTotals(rows: StoreSummaryRow[]): KPITotals {
        return {
            totalValue:     rows.reduce((s, r) => s + (r.totalValue ?? 0), 0),
            totalQuantity:  rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0),
            criticalCount:  rows.reduce((s, r) => s + (r.criticalCount ?? 0), 0),
            storeCount:     rows.length,
            healthyStores:  rows.filter(r => (r.criticalCount ?? 0) === 0).length
        };
    }

    private _buildHeaderAndKPIs(totals: KPITotals, rows: StoreSummaryRow[]): string {
        const fmtCurrency = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
        const healthPct = totals.storeCount > 0
            ? Math.round((totals.healthyStores / totals.storeCount) * 100) : 100;

        const kpiCards = [
            { icon: "💰", label: "Toplam Stok Değeri",  value: fmtCurrency(totals.totalValue),                     sub: `${totals.storeCount} mağaza`,                                           state: "neutral"  },
            { icon: "📦", label: "Toplam Stok Adedi",   value: totals.totalQuantity.toLocaleString("tr-TR"),        sub: "Tüm mağazalar",                                                         state: "neutral"  },
            { icon: totals.criticalCount > 0 ? "⚠️" : "✅", label: "Kritik Ürün", value: String(totals.criticalCount), sub: totals.criticalCount > 0 ? "Acil aksiyon gerekli" : "Tüm stoklar sağlıklı", state: totals.criticalCount > 0 ? "critical" : "good" },
            { icon: "🏪", label: "Sağlıklı Mağaza",     value: `${totals.healthyStores} / ${totals.storeCount}`,   sub: `%${healthPct} kritik ürünsüz`,                                          state: healthPct === 100 ? "good" : healthPct >= 50 ? "warning" : "critical" }
        ].map(c => `
            <div class="stKpiCard stKpiCard--${c.state}">
                <div class="stKpiCard__icon">${c.icon}</div>
                <div class="stKpiCard__body">
                    <div class="stKpiCard__value">${c.value}</div>
                    <div class="stKpiCard__label">${c.label}</div>
                    <div class="stKpiCard__sub">${c.sub}</div>
                </div>
            </div>`).join("");

        const sparkRows = rows.map(r => {
            const pct = totals.totalValue > 0 ? Math.round((r.totalValue / totals.totalValue) * 100) : 0;
            const cls = r.criticalCount > 0 ? "stSparkRow--critical" : "stSparkRow--ok";
            return `
                <div class="stSparkRow ${cls}">
                    <div class="stSparkRow__label">
                        <span class="stSparkRow__dot"></span>
                        <strong>${r.storeName}</strong>
                        <span class="stSparkRow__loc">${r.location}</span>
                    </div>
                    <div class="stSparkRow__bar"><div class="stSparkRow__fill" style="width:${pct}%"></div></div>
                    <div class="stSparkRow__stats">
                        <span>${r.totalQuantity.toLocaleString("tr-TR")} adet</span>
                        ${r.criticalCount > 0 ? `<span class="stSparkRow__crit">⚠ ${r.criticalCount} kritik</span>` : `<span class="stSparkRow__ok">✓</span>`}
                        <span>${r.totalValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺</span>
                    </div>
                </div>`;
        }).join("");

        return `
            <div class="stDashboardHeader">
                <div class="stDashboardHeaderLeft">
                    <span class="stDashboardHeaderIcon">📊</span>
                    <div>
                        <div class="stDashboardTitle">Tedarik Zinciri Dashboard</div>
                        <div class="stDashboardSubtitle">Mağaza stok özeti ve analitik göstergeler</div>
                    </div>
                </div>
            </div>
            <div class="stKpiGrid">${kpiCards}</div>
            <div class="stSparkSection">
                <div class="stSparkSection__title">Mağaza Bazlı Stok Dağılımı</div>
                ${sparkRows}
            </div>`;
    }

    // ─── Grafik Bölümü ────────────────────────────────────────────────────────────

    private _buildChartsSection(
        summaryRows: StoreSummaryRow[],
        products: Product[],
        stockLevels: StockLevel[],
        orders: PurchaseOrder[],
        suppliers: Supplier[]
    ): string {
        const pie    = this._buildCategoryPie(products, stockLevels);
        const funnel = this._buildOrderFunnel(orders);
        const bar    = this._buildSupplierBar(suppliers, orders);
        const storeBar = this._buildStoreComparisonBar(summaryRows);

        return `
            <div class="stChartSectionTitle">📈 Analitik Grafikler</div>
            <div class="stChartsGrid">
                ${pie}
                ${funnel}
                ${bar}
                ${storeBar}
            </div>`;
    }

    // ─── 1. Kategori Pasta Grafiği ────────────────────────────────────────────────

    private _buildCategoryPie(products: Product[], stockLevels: StockLevel[]): string {
        const categoryMap: Record<string, number> = {};

        stockLevels.forEach(sl => {
            const product = products.find(p => p.ID === sl.product_ID);
            const cat = product?.category ?? "Diğer";
            categoryMap[cat] = (categoryMap[cat] ?? 0) + sl.quantity;
        });

        const slices = Object.entries(categoryMap).map(([label, value]) => ({ label, value }));
        return buildPieChart(slices, "Kategori Bazlı Stok Dağılımı");
    }

    // ─── 2. Sipariş Funnel ────────────────────────────────────────────────────────

    private _buildOrderFunnel(orders: PurchaseOrder[]): string {
        const counts: Record<string, number> = { "Taslak": 0, "Onaylandı": 0, "Teslim Edildi": 0 };
        orders.forEach(o => {
            if (counts[o.status] !== undefined) counts[o.status]++;
        });

        const steps = [
            { label: "Taslak",        value: counts["Taslak"],        color: "#6c8ebf" },
            { label: "Onaylandı",     value: counts["Onaylandı"],     color: "#e76500" },
            { label: "Teslim Edildi", value: counts["Teslim Edildi"], color: "#107e3e" }
        ].filter(s => s.value > 0);

        if (steps.length === 0) {
            steps.push(
                { label: "Taslak", value: 0, color: "#6c8ebf" },
                { label: "Onaylandı", value: 0, color: "#e76500" },
                { label: "Teslim Edildi", value: 0, color: "#107e3e" }
            );
        }

        return buildFunnelChart(steps, "Sipariş Durumu Akışı");
    }

    // ─── 3. Tedarikçi Performans Bar ──────────────────────────────────────────────

    private _buildSupplierBar(suppliers: Supplier[], orders: PurchaseOrder[]): string {
        const items = suppliers.map(s => {
            const delivered = orders.filter(o =>
                o.supplier_ID === s.ID && o.status === "Teslim Edildi" &&
                o.createdAt && o.deliveredAt
            );

            let avgActual = 0;
            if (delivered.length > 0) {
                const totalDays = delivered.reduce((sum, o) => {
                    const diff = (new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime()) / 86400000;
                    return sum + diff;
                }, 0);
                avgActual = Math.round((totalDays / delivered.length) * 10) / 10;
            }

            return {
                label: s.name.split(" ")[0],
                value: s.leadTimeDays,
                value2: avgActual > 0 ? avgActual : undefined,
                color: "#0064d9",
                color2: avgActual > s.leadTimeDays ? "#bb0000" : "#107e3e",
                tooltip: `${s.name} — Söz verilen: ${s.leadTimeDays} gün`,
                tooltip2: `${s.name} — Gerçekleşen: ${avgActual} gün`
            };
        });

        return buildHorizontalBarChart(items, "Tedarikçi Teslimat Performansı (gün)", "Söz Verilen", "Gerçekleşen");
    }

    // ─── 4. Mağaza Karşılaştırma Bar ──────────────────────────────────────────────

    private _buildStoreComparisonBar(rows: StoreSummaryRow[]): string {
        const items = rows.map(r => ({
            label: r.storeName.split(" ")[0],
            value: r.totalQuantity,
            value2: r.criticalCount,
            color: "#0064d9",
            color2: "#bb0000",
            tooltip: `${r.storeName} — Toplam: ${r.totalQuantity} adet`,
            tooltip2: `${r.storeName} — Kritik: ${r.criticalCount} ürün`
        }));

        return buildHorizontalBarChart(items, "Mağaza Stok Karşılaştırması", "Toplam Stok", "Kritik Ürün");
    }

    // ─── Public aksiyonlar ────────────────────────────────────────────────────────

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
        this._loadAndRender();
    }
}
