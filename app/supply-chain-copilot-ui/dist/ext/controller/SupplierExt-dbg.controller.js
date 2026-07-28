sap.ui.define(["sap/ui/core/mvc/ControllerExtension", "../util/AIResponseDialog", "../util/ChartBuilder"], function (ControllerExtension, ___util_AIResponseDialog, ___util_ChartBuilder) {
  "use strict";

  const openAIResultDialog = ___util_AIResponseDialog["openAIResultDialog"];
  const runWithBusy = ___util_AIResponseDialog["runWithBusy"];
  const buildHorizontalBarChart = ___util_ChartBuilder["buildHorizontalBarChart"];
  /**
   * Tedarikçiler sayfası controller extension'ı.
   * Performans rozeti ve tedarikçi karnesi grafiğini enjekte eder.
   */
  const SupplierExt = ControllerExtension.extend("webapp.ext.controller.SupplierExt", {
    override: {
      onInit() {
        console.log("SupplierExt yüklendi.");
      },
      onAfterRendering() {
        if (!document.getElementById("stSupplierScorePanel")) {
          this._injectScorePanel();
        }
      }
    },
    _injectScorePanel: async function _injectScorePanel() {
      await new Promise(r => setTimeout(r, 700));
      const model = this.getView()?.getModel();
      const [suppliers, orders] = await Promise.all([this._fetch(model, "/Suppliers"), this._fetch(model, "/PurchaseOrders")]);
      const items = suppliers.map(s => {
        const delivered = orders.filter(o => o.supplier_ID === s.ID && o.status === "Teslim Edildi" && o.createdAt && o.deliveredAt);
        let avgActual = 0;
        if (delivered.length > 0) {
          const total = delivered.reduce((sum, o) => sum + (new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime()) / 86400000, 0);
          avgActual = Math.round(total / delivered.length * 10) / 10;
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
      const chart = buildHorizontalBarChart(items, "Tedarikçi Teslimat Performansı (gün)", "Söz Verilen", "Gerçekleşen");
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
    },
    _fetch: async function _fetch(model, path) {
      const binding = model.bindList(path);
      const contexts = await binding.requestContexts(0, 200);
      return contexts.map(c => c.getObject());
    },
    onViewScorecard: async function _onViewScorecard() {
      const model = this.getView()?.getModel();
      const result = await runWithBusy("Tedarikçi karnesi hesaplanıyor...", async () => {
        const binding = model.bindContext("/supplierScorecard(...)");
        await binding.execute();
        return binding.getBoundContext()?.getObject()?.value;
      });
      if (result !== undefined) {
        openAIResultDialog({
          title: "Tedarikçi Performans Karnesi",
          text: result,
          state: "Information"
        });
      }
    }
  });
  return SupplierExt;
});
//# sourceMappingURL=SupplierExt-dbg.controller.js.map
