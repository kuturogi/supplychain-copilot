import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Button from "sap/m/Button";
import Text from "sap/m/Text";
import VBox from "sap/m/VBox";

/**
 * Fiori Elements custom action handler modülü.
 * FE, manifest'teki press string'ini bu modüldeki fonksiyona çözer;
 * fonksiyon içinde `this` = ExtensionAPI, ilk parametre = sayfanın binding context'i.
 */

function resolveStockLevelId(oContext: unknown): number | undefined {
    if (
        oContext &&
        typeof (oContext as { getProperty?: unknown }).getProperty === "function"
    ) {
        return (oContext as { getProperty(p: string): number }).getProperty("ID");
    }
    // Context gelmezse URL'deki StockLevels(1002) deseninden ID'yi çıkar
    const match = window.location.hash.match(/StockLevels\((\d+)\)/);
    return match ? parseInt(match[1], 10) : undefined;
}

async function callUnboundAction(
    model: ODataModel,
    actionPath: string,
    parameters: Record<string, unknown>
): Promise<string | undefined> {
    const actionBinding = model.bindContext(actionPath);
    for (const [name, value] of Object.entries(parameters)) {
        actionBinding.setParameter(name, value);
    }
    await actionBinding.execute();
    const result = actionBinding.getBoundContext()?.getObject() as {
        value?: string;
    };
    return result?.value;
}

/**
 * Liste sayfası — AI Analyze butonu.
 */
export async function onAIAnalyze(this: any): Promise<void> {
    try {
        console.log("AI Analyze butonuna basıldı.");
        const model = this.getModel() as ODataModel;
        const value = await callUnboundAction(model, "/analyzeStockWithAI(...)", {});
        MessageBox.success(value ?? "Stok analizi başarıyla tamamlandı.");
    } catch (error) {
        console.error("AI analiz hatası:", error);
        MessageBox.error("Stok analizi sırasında bir hata oluştu.");
    }
}

/**
 * Liste sayfası — Tedarikçi Karnesi butonu.
 * Söz verilen vs gerçekleşen teslimat sürelerini karşılaştırır.
 */
export async function onSupplierScorecard(this: any): Promise<void> {
    try {
        console.log("Tedarikçi Karnesi butonuna basıldı.");
        const model = this.getModel() as ODataModel;
        const value = await callUnboundAction(model, "/supplierScorecard(...)", {});
        MessageBox.information(value ?? "Karne alınamadı.");
    } catch (error) {
        console.error("Tedarikçi karnesi hatası:", error);
        MessageBox.error("Tedarikçi karnesi alınırken bir hata oluştu.");
    }
}

/**
 * Liste sayfası — Dashboard butonu.
 */
export function onOpenDashboard(this: any): void {
    console.log("Dashboard butonuna basıldı.");
    try {
        this.routing.navigateToRoute("StockSummaryList");
    } catch (error) {
        console.error("Router ile gidilemedi, hash fallback:", error);
        // FLP içinde app-içi rota "&/" sonrasına yazılır
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/StockSummaryByStore";
    }
}

/**
 * Liste sayfası — Copilot'a Sor butonu.
 * Serbest metinle soru sorulan bir dialog açar; cevap backend'deki askCopilot
 * aksiyonundan gelir (AI Core yapılandırılmışsa LLM, yoksa kural tabanlı demo).
 */
export function onAskCopilot(this: any): void {
    console.log("Copilot'a Sor butonuna basıldı.");
    const model = this.getModel() as ODataModel;

    const answerText = new Text({
        text: "Örnek sorular: \"Hangi ürünler kritik?\", \"Transfer önerisi var mı?\", \"Trabzon'da durum ne?\"",
        renderWhitespace: true
    });

    const questionInput = new Input({
        placeholder: "Sorunuzu yazın...",
        width: "100%"
    });

    const ask = async () => {
        const question = questionInput.getValue().trim();
        if (!question) {
            return;
        }
        answerText.setText("Copilot düşünüyor...");
        try {
            const actionBinding = model.bindContext("/askCopilot(...)");
            actionBinding.setParameter("question", question);
            await actionBinding.execute();
            const result = actionBinding.getBoundContext()?.getObject() as {
                value?: string;
            };
            answerText.setText(result?.value ?? "Cevap alınamadı.");
        } catch (error) {
            console.error("Copilot hatası:", error);
            answerText.setText("Bir hata oluştu, lütfen tekrar deneyin.");
        }
    };

    questionInput.attachSubmit(ask);

    const dialog = new Dialog({
        title: "Supply Chain Copilot",
        contentWidth: "640px",
        content: [
            new VBox({
                items: [questionInput, answerText]
            }).addStyleClass("sapUiSmallMargin")
        ],
        beginButton: new Button({
            text: "Sor",
            type: "Emphasized",
            press: ask
        }),
        endButton: new Button({
            text: "Kapat",
            press: () => dialog.close()
        }),
        afterClose: () => dialog.destroy()
    });

    dialog.open();
}

/**
 * Detay sayfası — Talep Tahmini (AI) butonu.
 */
export async function onForecastDemand(this: any, oContext: unknown): Promise<void> {
    try {
        console.log("Talep Tahmini butonuna basıldı.");
        const stockLevelId = resolveStockLevelId(oContext);
        if (stockLevelId === undefined) {
            MessageBox.error("Stok kaydı belirlenemedi.");
            return;
        }
        const model = this.getModel() as ODataModel;
        const value = await callUnboundAction(model, "/forecastDemand(...)", {
            stockLevelId: stockLevelId
        });
        MessageBox.information(value ?? "Talep tahmini tamamlandı.");
    } catch (error) {
        console.error("Talep tahmini hatası:", error);
        MessageBox.error("Talep tahmini sırasında bir hata oluştu.");
    }
}

/**
 * Detay sayfası — Sipariş Oluştur butonu.
 * Miktar 0 gönderilir; backend 30 günlük tüketimden öneriyi kendisi hesaplar.
 */
export async function onCreateOrder(this: any, oContext: unknown): Promise<void> {
    try {
        console.log("Sipariş Oluştur butonuna basıldı.");
        const stockLevelId = resolveStockLevelId(oContext);
        if (stockLevelId === undefined) {
            MessageBox.error("Stok kaydı belirlenemedi.");
            return;
        }
        const model = this.getModel() as ODataModel;
        const value = await callUnboundAction(model, "/createPurchaseOrder(...)", {
            stockLevelId: stockLevelId,
            quantity: 0
        });
        MessageBox.success(value ?? "Sipariş taslağı oluşturuldu.");
    } catch (error) {
        console.error("Sipariş oluşturma hatası:", error);
        MessageBox.error("Sipariş oluşturulurken bir hata oluştu.");
    }
}
