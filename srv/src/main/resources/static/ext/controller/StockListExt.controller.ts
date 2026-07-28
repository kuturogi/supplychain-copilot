import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import UIComponent from "sap/ui/core/UIComponent";

import { openAIResultDialog, runWithBusy } from "../util/AIResponseDialog";

/**
 * Stok listesi sayfası controller extension'ı.
 */
export default class StockListExt extends ControllerExtension<any> {

    static overrides = {
        onInit(this: StockListExt): void {
            console.log("StockListExt Controller Extension yüklendi.");
        }
    };

    public async onAIAnalyze(): Promise<void> {
        const model = this.getView()?.getModel() as ODataModel;
        const result = await runWithBusy("AI stok analizi yapılıyor...", async () => {
            const binding = model.bindContext("/analyzeStockWithAI(...)");
            await binding.execute();
            return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
        });
        if (result !== undefined) {
            openAIResultDialog({ title: "AI Stok Analiz Raporu", text: result });
        }
    }

    public onOpenDashboard(): void {
        const view = this.getView();
        if (!view) return;
        const router = UIComponent.getRouterFor(view);
        router.navTo("StockSummaryList");
    }
}
