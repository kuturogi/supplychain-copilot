import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { openAIResultDialog, runWithBusy } from "../util/AIResponseDialog";
import { buildHorizontalBarChart } from "../util/ChartBuilder";

interface Supplier { ID: number; name: string; category: string; leadTimeDays: number; }
interface PurchaseOrder { supplier_ID: number; status: string; createdAt: string; deliveredAt: string; }

/**
 * Tedarikçiler sayfası controller extension'ı.
 * Performans rozeti ve tedarikçi karnesi grafiğini enjekte eder.
 */
export default class SupplierExt extends ControllerExtension<any> {

    static overrides = {
        onInit(this: SupplierExt): void {
            console.log("SupplierExt yüklendi.");
        },
        onAfterRendering(this: SupplierExt): void {
            if (!document.getElementById("stSupplierScorePanel")) {
                this._injectScorePanel();
            }
        }
    };

    private async _injectScorePanel(): Promise<void> {
        await new Promise(r => setTimeout(r, 700));
        const model = this.getView()?.getModel() as ODataModel;

        const [suppliers, orders] = await Promise.all([
            this._fetch<Supplier>(model, "/Suppliers"),
            this._fetch<PurchaseOrder>(model, "/PurchaseOrders")
        ]);

        const items = suppliers.map(s => {
            const delivered = orders.filter(o =>
                o.supplier_ID === s.ID && o.status === "Teslim Edildi" &&
                o.createdAt && o.deliveredAt
            );
            let avgActual = 0;
            if (delivered.length > 0) {
                const total = delivered.reduce((sum, o) =>
                    sum + (new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime()) / 86400000, 0);
                avgActual = Math.round((total / delivered.length) * 10) / 10;
            }
            const isLate = avgActual > s.leadTimeDays + 0.5;
            return {
                label: s.name.length > 18 ? s.name.slice(0, 18) + "…" : s.name,
                value: s.leadTimeDays,
                value2: avgActual > 0 ? avgActual : undefined,
                color: "#0064d9",
                color2: isLate ? "#bb0000" : "#107e3e",
                tooltip: `${s.name} — Söz: ${s.leadTimeDays} gün`,
                tooltip2: `${s.name} — Gerçekleşen: ${avgActual} gün`
            };
        });

        const chart = buildHorizontalBarChart(items,
            "Tedarikçi Teslimat Performansı (gün)", "Söz Verilen", "Gerçekleşen");

        const panel = document.createElement("div");
        panel.id = "stSupplierScorePanel";
        panel.className = "stDashboardKpiPanel";
        panel.innerHTML = `
            <div class="stDashboardHeader">
                <div class="stDashboardHeaderLeft">
                    <span class="stDashboardHeaderIcon">🏭</span>
                    <div>
                        <div class="stDashboardTitle">Tedarikçi Performans Özeti</div>
                        <div class="stDashboardSubtitle">Söz verilen vs gerçekleşen teslimat süreleri</div>
                    </div>
                </div>
            </div>
            <div style="max-width:600px">${chart}</div>
        `;

        const container = document.querySelector(".sapFDynamicPageContent, .sapMListPage, .sapMPage");
        if (container && !document.getElementById("stSupplierScorePanel")) {
            container.insertBefore(panel, container.firstChild);
        }
    }

    private async _fetch<T>(model: ODataModel, path: string): Promise<T[]> {
        const binding = model.bindList(path);
        const contexts = await binding.requestContexts(0, 200);
        return contexts.map(c => c.getObject() as T);
    }

    public async onViewScorecard(this: any): Promise<void> {
        const model = this.getView()?.getModel() as ODataModel;
        const result = await runWithBusy("Tedarikçi karnesi hesaplanıyor...", async () => {
            const binding = model.bindContext("/supplierScorecard(...)");
            await binding.execute();
            return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
        });
        if (result !== undefined) {
            openAIResultDialog({ title: "Tedarikçi Performans Karnesi", text: result, state: "Information" });
        }
    }
}
