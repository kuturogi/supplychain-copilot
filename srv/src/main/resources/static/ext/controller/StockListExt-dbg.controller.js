sap.ui.define(["sap/ui/core/mvc/ControllerExtension", "sap/ui/core/UIComponent", "../util/AIResponseDialog"], function (ControllerExtension, UIComponent, ___util_AIResponseDialog) {
  "use strict";

  const openAIResultDialog = ___util_AIResponseDialog["openAIResultDialog"];
  const runWithBusy = ___util_AIResponseDialog["runWithBusy"];
  /**
   * Stok listesi sayfası controller extension'ı.
   */
  const StockListExt = ControllerExtension.extend("webapp.ext.controller.StockListExt", {
    override: {
      onInit() {
        console.log("StockListExt Controller Extension yüklendi.");
      }
    },
    onAIAnalyze: async function _onAIAnalyze() {
      const model = this.getView()?.getModel();
      const result = await runWithBusy("AI stok analizi yapılıyor...", async () => {
        const binding = model.bindContext("/analyzeStockWithAI(...)");
        await binding.execute();
        return binding.getBoundContext()?.getObject()?.value;
      });
      if (result !== undefined) {
        openAIResultDialog({
          title: "AI Stok Analiz Raporu",
          text: result
        });
      }
    },
    onOpenDashboard: function _onOpenDashboard() {
      const view = this.getView();
      if (!view) return;
      const router = UIComponent.getRouterFor(view);
      router.navTo("StockSummaryList");
    }
  });
  return StockListExt;
});
//# sourceMappingURL=StockListExt-dbg.controller.js.map
