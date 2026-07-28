import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { openAIResultDialog, runWithBusy } from "../util/AIResponseDialog";
import { _openDashboardDialog } from "./StockActions";

export default class DashboardExt extends ControllerExtension<any> {

    static overrides = {
        onInit(this: DashboardExt): void {
            // Dashboard artık Dialog üzerinden açılıyor (StockActions.onOpenDashboard)
        }
    };

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
        const model = this.getView()?.getModel() as ODataModel;
        if (model) {
            _openDashboardDialog(model);
        }
    }
}
