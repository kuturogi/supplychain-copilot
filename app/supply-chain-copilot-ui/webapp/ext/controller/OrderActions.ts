import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import { openAIResultDialog, runWithBusy } from "../util/AIResponseDialog";

/**
 * Sipariş sayfası aksiyon handler'ları.
 * Taslak → Onaylandı → Teslim Edildi akışını yönetir.
 */

async function callOrderAction(
    model: ODataModel,
    actionPath: string,
    orderId: string,
    busyText: string,
    successTitle: string
): Promise<void> {
    const result = await runWithBusy(busyText, async () => {
        const binding = model.bindContext(actionPath);
        binding.setParameter("orderId", orderId);
        await binding.execute();
        return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
    });
    if (result !== undefined) {
        openAIResultDialog({ title: successTitle, text: result, state: "Success" });
        // Sayfayı yenile
        (model as any).refresh();
    }
}

function resolveOrderId(oContext: unknown): string | undefined {
    if (oContext && typeof (oContext as any).getProperty === "function") {
        return (oContext as any).getProperty("ID");
    }
    const match = window.location.hash.match(/PurchaseOrders\(([^)]+)\)/);
    return match ? match[1] : undefined;
}

export async function onApproveOrder(this: any, oContext: unknown): Promise<void> {
    const orderId = resolveOrderId(oContext);
    if (!orderId) { MessageBox.error("Sipariş kaydı belirlenemedi."); return; }
    const model = this.getModel() as ODataModel;
    await callOrderAction(model, "/approvePurchaseOrder(...)", orderId,
        "Sipariş onaylanıyor...", "Sipariş Onaylandı");
}

export async function onMarkDelivered(this: any, oContext: unknown): Promise<void> {
    const orderId = resolveOrderId(oContext);
    if (!orderId) { MessageBox.error("Sipariş kaydı belirlenemedi."); return; }
    const model = this.getModel() as ODataModel;
    await callOrderAction(model, "/markOrderDelivered(...)", orderId,
        "Teslim edildi işaretleniyor...", "Teslimat Tamamlandı");
}

export async function onCancelOrder(this: any, oContext: unknown): Promise<void> {
    const orderId = resolveOrderId(oContext);
    if (!orderId) { MessageBox.error("Sipariş kaydı belirlenemedi."); return; }

    MessageBox.confirm("Bu siparişi iptal etmek istediğinizden emin misiniz?", {
        onClose: async (action: string) => {
            if (action !== "OK") return;
            const model = this.getModel() as ODataModel;
            await callOrderAction(model, "/cancelPurchaseOrder(...)", orderId,
                "Sipariş iptal ediliyor...", "Sipariş İptal Edildi");
        }
    });
}
