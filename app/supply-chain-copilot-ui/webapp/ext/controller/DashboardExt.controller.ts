import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import VBox from "sap/m/VBox";
import HBox from "sap/m/HBox";
import FlexBox from "sap/m/FlexBox";
import Text from "sap/m/Text";
import HTML from "sap/ui/core/HTML";
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

export default class DashboardExt extends ControllerExtension<any> {

    private _loaded = false;

    static overrides = {
        onInit(this: DashboardExt): void {
            // onInit'te view henüz render edilmemiş, veri yüklemeyi geciktir
        },
        onAfterRendering(this: DashboardExt): void {
            if (!this._loaded) {
                this._loaded = true;
                this._loadAndRender();
            }
        }
    };

    private async _loadAndRender(): Promise<void> {
        try {
            const model = this.getView()?.getModel() as ODataModel;
            if (!model) return;

            const [summaryRows, products, stockLevels, orders, suppliers] = await Promise.all([
                this._fetchList<StoreSummaryRow>(model, "/StockSummaryByStore"),
                this._fetchList<Product>(model, "/Products"),
                this._fetchList<StockLevel>(model, "/StockLevels"),
                this._fetchList<PurchaseOrder>(model, "/PurchaseOrders"),
                this._fetchList<Supplier>(model, "/Suppliers")
            ]);

            const totals = this._computeTotals(summaryRows);
            this._renderKPIs(totals, summaryRows);
            this._renderCharts(summaryRows, products, stockLevels, orders, suppliers);
        } catch (error) {
            console.error("Dashboard yükleme hatası:", error);
        }
    }

    private async _fetchList<T>(model: ODataModel, path: string): Promise<T[]> {
        const binding = model.bindList(path);
        const contexts = await binding.requestContexts(0, 200);
        return contexts.map(c => c.getObject() as T);
    }

    private _computeTotals(rows: StoreSummaryRow[]): KPITotals {
        return {
            totalValue:    rows.reduce((s, r) => s + (r.totalValue ?? 0), 0),
            totalQuantity: rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0),
            criticalCount: rows.reduce((s, r) => s + (r.criticalCount ?? 0), 0),
            storeCount:    rows.length,
            healthyStores: rows.filter(r => (r.criticalCount ?? 0) === 0).length
        };
    }

    // ─── KPI kartları ─────────────────────────────────────────────────────────────

    private _renderKPIs(totals: KPITotals, rows: StoreSummaryRow[]): void {
        const view = this.getView();
        const kpiGrid = view?.byId("stKpiGrid") as FlexBox;
        const sparkRows = view?.byId("stSparkRows") as VBox;
        if (!kpiGrid || !sparkRows) return;

        kpiGrid.destroyItems();
        sparkRows.destroyItems();

        const fmtCurrency = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
        const healthPct = totals.storeCount > 0 ? Math.round((totals.healthyStores / totals.storeCount) * 100) : 100;

        const cards = [
            { icon: "💰", label: "Toplam Stok Değeri",  value: fmtCurrency(totals.totalValue),               sub: `${totals.storeCount} mağaza`,                                           cls: "neutral"  },
            { icon: "📦", label: "Toplam Stok Adedi",   value: totals.totalQuantity.toLocaleString("tr-TR"),   sub: "Tüm mağazalar",                                                         cls: "neutral"  },
            { icon: totals.criticalCount > 0 ? "⚠️" : "✅", label: "Kritik Ürün",  value: String(totals.criticalCount), sub: totals.criticalCount > 0 ? "Acil aksiyon" : "Tümü sağlıklı", cls: totals.criticalCount > 0 ? "critical" : "good" },
            { icon: "🏪", label: "Sağlıklı Mağaza",     value: `${totals.healthyStores} / ${totals.storeCount}`, sub: `%${healthPct} kritik ürünsüz`,                                       cls: healthPct === 100 ? "good" : healthPct >= 50 ? "warning" : "critical" }
        ];

        cards.forEach(c => {
            kpiGrid.addItem(new HTML({
                content: `<div class="stKpiCard stKpiCard--${c.cls}">
                    <div class="stKpiCard__icon">${c.icon}</div>
                    <div class="stKpiCard__body">
                        <div class="stKpiCard__value">${c.value}</div>
                        <div class="stKpiCard__label">${c.label}</div>
                        <div class="stKpiCard__sub">${c.sub}</div>
                    </div>
                </div>`
            }));
        });

        rows.forEach(r => {
            const pct = totals.totalValue > 0 ? Math.round((r.totalValue / totals.totalValue) * 100) : 0;
            const cls = r.criticalCount > 0 ? "stSparkRow--critical" : "stSparkRow--ok";
            sparkRows.addItem(new HTML({
                content: `<div class="stSparkRow ${cls}">
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
                </div>`
            }));
        });
    }

    // ─── Grafik bölümü ────────────────────────────────────────────────────────────

    private _renderCharts(
        summaryRows: StoreSummaryRow[],
        products: Product[],
        stockLevels: StockLevel[],
        orders: PurchaseOrder[],
        suppliers: Supplier[]
    ): void {
        const view = this.getView();
        const chartsGrid = view?.byId("stChartsGrid") as FlexBox;
        if (!chartsGrid) return;

        chartsGrid.destroyItems();

        const pieHtml    = this._buildCategoryPie(products, stockLevels);
        const funnelHtml = this._buildOrderFunnel(orders);
        const supplierHtml = this._buildSupplierBar(suppliers, orders);
        const storeHtml  = this._buildStoreComparisonBar(summaryRows);

        [pieHtml, funnelHtml, supplierHtml, storeHtml].forEach(html => {
            chartsGrid.addItem(new HTML({ content: html }));
        });
    }

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

    private _buildOrderFunnel(orders: PurchaseOrder[]): string {
        const counts: Record<string, number> = { "Taslak": 0, "Onaylandı": 0, "Teslim Edildi": 0 };
        orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
        const steps = [
            { label: "Taslak",        value: counts["Taslak"],        color: "#6c8ebf" },
            { label: "Onaylandı",     value: counts["Onaylandı"],     color: "#e76500" },
            { label: "Teslim Edildi", value: counts["Teslim Edildi"], color: "#107e3e" }
        ];
        return buildFunnelChart(steps, "Sipariş Durumu Akışı");
    }

    private _buildSupplierBar(suppliers: Supplier[], orders: PurchaseOrder[]): string {
        const items = suppliers.map(s => {
            const delivered = orders.filter(o =>
                o.supplier_ID === s.ID && o.status === "Teslim Edildi" && o.createdAt && o.deliveredAt
            );
            let avgActual = 0;
            if (delivered.length > 0) {
                const total = delivered.reduce((sum, o) =>
                    sum + (new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime()) / 86400000, 0);
                avgActual = Math.round((total / delivered.length) * 10) / 10;
            }
            return {
                label: s.name.split(" ")[0],
                value: s.leadTimeDays,
                value2: avgActual > 0 ? avgActual : undefined,
                color: "#0064d9",
                color2: avgActual > s.leadTimeDays ? "#bb0000" : "#107e3e",
                tooltip:  `${s.name} — Söz: ${s.leadTimeDays} gün`,
                tooltip2: `${s.name} — Gerçekleşen: ${avgActual} gün`
            };
        });
        return buildHorizontalBarChart(items, "Tedarikçi Teslimat Performansı (gün)", "Söz Verilen", "Gerçekleşen");
    }

    private _buildStoreComparisonBar(rows: StoreSummaryRow[]): string {
        const items = rows.map(r => ({
            label: r.storeName.split(" ")[0],
            value: r.totalQuantity,
            value2: r.criticalCount,
            color: "#0064d9",
            color2: "#bb0000",
            tooltip:  `${r.storeName} — Toplam: ${r.totalQuantity} adet`,
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
        this._loaded = false;
        this._loadAndRender();
    }
}
