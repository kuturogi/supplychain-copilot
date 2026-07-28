sap.ui.define(["sap/m/MessageBox", "../util/AIResponseDialog", "../util/ExportHelper"], function (MessageBox, ___util_AIResponseDialog, ___util_ExportHelper) {
  "use strict";

  const openAIResultDialog = ___util_AIResponseDialog["openAIResultDialog"];
  const runWithBusy = ___util_AIResponseDialog["runWithBusy"];
  const exportOrders = ___util_ExportHelper["exportOrders"];
  /**
   * Sipariş sayfası aksiyon handler'ları.
   * Taslak → Onaylandı → Teslim Edildi akışını yönetir.
   */
  async function callOrderAction(model, actionPath, orderId, busyText, successTitle) {
    const result = await runWithBusy(busyText, async () => {
      const binding = model.bindContext(actionPath);
      binding.setParameter("orderId", orderId);
      await binding.execute();
      return binding.getBoundContext()?.getObject()?.value;
    });
    if (result !== undefined) {
      openAIResultDialog({
        title: successTitle,
        text: result,
        state: "Success"
      });
      // Sayfayı yenile
      model.refresh();
    }
  }
  function resolveOrderId(oContext) {
    if (oContext && typeof oContext.getProperty === "function") {
      return oContext.getProperty("ID");
    }
    const match = window.location.hash.match(/PurchaseOrders\(([^)]+)\)/);
    return match ? match[1] : undefined;
  }
  async function onApproveOrder(oContext) {
    const orderId = resolveOrderId(oContext);
    if (!orderId) {
      MessageBox.error("Sipariş kaydı belirlenemedi.");
      return;
    }
    const model = this.getModel();
    await callOrderAction(model, "/approvePurchaseOrder(...)", orderId, "Sipariş onaylanıyor...", "Sipariş Onaylandı");
  }
  async function onMarkDelivered(oContext) {
    const orderId = resolveOrderId(oContext);
    if (!orderId) {
      MessageBox.error("Sipariş kaydı belirlenemedi.");
      return;
    }
    const model = this.getModel();
    await callOrderAction(model, "/markOrderDelivered(...)", orderId, "Teslim edildi işaretleniyor...", "Teslimat Tamamlandı");
  }
  async function onCancelOrder(oContext) {
    const orderId = resolveOrderId(oContext);
    if (!orderId) {
      MessageBox.error("Sipariş kaydı belirlenemedi.");
      return;
    }
    MessageBox.confirm("Bu siparişi iptal etmek istediğinizden emin misiniz?", {
      onClose: async action => {
        if (action !== "OK") return;
        const model = this.getModel();
        await callOrderAction(model, "/cancelPurchaseOrder(...)", orderId, "Sipariş iptal ediliyor...", "Sipariş İptal Edildi");
      }
    });
  }
  async function onExportOrders() {
    const model = this.getModel();
    await exportOrders(model);
  }
  var __exports = {
    __esModule: true
  };
  __exports.onApproveOrder = onApproveOrder;
  __exports.onMarkDelivered = onMarkDelivered;
  __exports.onCancelOrder = onCancelOrder;
  __exports.onExportOrders = onExportOrders;
  return __exports;
});
//# sourceMappingURL=OrderActions-dbg.js.map
