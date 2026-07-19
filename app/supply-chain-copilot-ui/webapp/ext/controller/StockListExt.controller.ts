import ControllerExtension from "sap/ui/core/mvc/ControllerExtension";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

export default class StockListExt extends ControllerExtension<any> {

    static overrides = {
        onInit(this: StockListExt): void {
            console.log(
                "StockListExt Controller Extension yüklendi."
            );
        }
    };
}

/**
 * AI Analyze butonuna basıldığında çalışır.
 */
export async function onAIAnalyze(this: any): Promise<void> {
    try {
        console.log("AI Analyze butonuna basıldı.");

        const model = this
            .getView()
            .getModel() as ODataModel;

        const actionBinding = model.bindContext(
            "/analyzeStockWithAI(...)"
        );

        await actionBinding.execute();

        const actionContext =
            actionBinding.getBoundContext();

        const result = actionContext?.getObject() as {
            value?: string;
        };

        MessageBox.success(
            result?.value ??
            "Stok analizi başarıyla tamamlandı."
        );

    } catch (error) {
        console.error(
            "AI analiz hatası:",
            error
        );

        MessageBox.error(
            "Stok analizi sırasında bir hata oluştu."
        );
    }
}