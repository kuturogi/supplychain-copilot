sap.ui.define(["sap/ui/core/mvc/ControllerExtension", "sap/ui/model/json/JSONModel", "../util/AIResponseDialog", "../util/ChartBuilder"], function (ControllerExtension, JSONModel, ___util_AIResponseDialog, ___util_ChartBuilder) {
  "use strict";

  const openAIResultDialog = ___util_AIResponseDialog["openAIResultDialog"];
  const runWithBusy = ___util_AIResponseDialog["runWithBusy"];
  const buildPieChart = ___util_ChartBuilder["buildPieChart"];
  const buildHorizontalBarChart = ___util_ChartBuilder["buildHorizontalBarChart"];
  const buildFunnelChart = ___util_ChartBuilder["buildFunnelChart"];
  /**
   * Dashboard sayfası controller extension'ı.
   * KPI kartları, mağaza dağılımı ve 3 analitik grafik içerir:
   *  1. Kategori bazlı stok pasta grafiği
   *  2. Sipariş durumu funnel grafiği
   *  3. Tedarikçi performans karşılaştırma bar grafiği
   */
  const DashboardExt = ControllerExtension.extend("webapp.ext.controller.DashboardExt", {
    constructor: function constructor() {
      ControllerExtension.prototype.constructor.apply(this, arguments);
      this._kpiModel = new JSONModel({
        kpis: null
      });
      this._renderInterval = null;
      this._lastHtml = "";
    },
    override: {
      onInit() {
        this.getView()?.setModel(this._kpiModel, "kpi");
        this._loadAndRender();
      },
      onAfterRendering() {
        this._startWatcher();
      },
      onExit() {
        if (this._renderInterval) clearInterval(this._renderInterval);
      }
    },
    _startWatcher: function _startWatcher() {
      if (this._renderInterval) return;
      this._renderInterval = setInterval(() => {
        const panel = document.getElementById("stDashboardKpiPanel");
        if (!panel && this._lastHtml) {
          this._injectPanel(this._lastHtml);
        }
      }, 800);
    },
    // ─── Veri yükleme ────────────────────────────────────────────────────────────
    _loadAndRender: async function _loadAndRender() {
      try {
        const model = this.getView()?.getModel();
        const [summaryRows, products, stockLevels, orders, suppliers] = await Promise.all([this._fetchList(model, "/StockSummaryByStore"), this._fetchList(model, "/Products"), this._fetchList(model, "/StockLevels"), this._fetchList(model, "/PurchaseOrders"), this._fetchList(model, "/Suppliers")]);
        const totals = this._computeTotals(summaryRows);
        this._kpiModel.setData({
          kpis: totals,
          rows: summaryRows
        });
        setTimeout(() => this._injectAll(totals, summaryRows, products, stockLevels, orders, suppliers), 600);
      } catch (error) {
        console.error("Dashboard yükleme hatası:", error);
      }
    },
    _fetchList: async function _fetchList(model, path) {
      const binding = model.bindList(path);
      const contexts = await binding.requestContexts(0, 200);
      return contexts.map(c => c.getObject());
    },
    // ─── Ana enjeksiyon ──────────────────────────────────────────────────────────
    _injectAll: function _injectAll(totals, summaryRows, products, stockLevels, orders, suppliers) {
      const html = [this._buildHeaderAndKPIs(totals, summaryRows), this._buildChartsSection(summaryRows, products, stockLevels, orders, suppliers)].join("");
      this._lastHtml = html;
      this._injectPanel(html);
    },
    _injectPanel: function _injectPanel(html) {
      const container = document.querySelector(".sapFDynamicPageContent, .sapUiRespGridMedia, .sapMListPage, .sapMPage");
      if (!container) return;
      if (document.getElementById("stDashboardKpiPanel")) return;
      const panel = document.createElement("div");
      panel.id = "stDashboardKpiPanel";
      panel.className = "stDashboardKpiPanel";
      panel.innerHTML = html;
      container.insertBefore(panel, container.firstChild);
    },
    // ─── KPI Kartları + Mağaza Spark ─────────────────────────────────────────────
    _computeTotals: function _computeTotals(rows) {
      return {
        totalValue: rows.reduce((s, r) => s + (r.totalValue ?? 0), 0),
        totalQuantity: rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0),
        criticalCount: rows.reduce((s, r) => s + (r.criticalCount ?? 0), 0),
        storeCount: rows.length,
        healthyStores: rows.filter(r => (r.criticalCount ?? 0) === 0).length
      };
    },
    _buildHeaderAndKPIs: function _buildHeaderAndKPIs(totals, rows) {
      const fmtCurrency = n => n.toLocaleString("tr-TR", {
        maximumFractionDigits: 0
      }) + " ₺";
      const healthPct = totals.storeCount > 0 ? Math.round(totals.healthyStores / totals.storeCount * 100) : 100;
      const kpiCards = [{
        icon: "💰",
        label: "Toplam Stok Değeri",
        value: fmtCurrency(totals.totalValue),
        sub: `${totals.storeCount} mağaza`,
        state: "neutral"
      }, {
        icon: "📦",
        label: "Toplam Stok Adedi",
        value: totals.totalQuantity.toLocaleString("tr-TR"),
        sub: "Tüm mağazalar",
        state: "neutral"
      }, {
        icon: totals.criticalCount > 0 ? "⚠️" : "✅",
        label: "Kritik Ürün",
        value: String(totals.criticalCount),
        sub: totals.criticalCount > 0 ? "Acil aksiyon gerekli" : "Tüm stoklar sağlıklı",
        state: totals.criticalCount > 0 ? "critical" : "good"
      }, {
        icon: "🏪",
        label: "Sağlıklı Mağaza",
        value: `${totals.healthyStores} / ${totals.storeCount}`,
        sub: `%${healthPct} kritik ürünsüz`,
        state: healthPct === 100 ? "good" : healthPct >= 50 ? "warning" : "critical"
      }].map(c => `
            <div class="stKpiCard stKpiCard--${c.state}">
                <div class="stKpiCard__icon">${c.icon}</div>
                <div class="stKpiCard__body">
                    <div class="stKpiCard__value">${c.value}</div>
                    <div class="stKpiCard__label">${c.label}</div>
                    <div class="stKpiCard__sub">${c.sub}</div>
                </div>
            </div>`).join("");
      const sparkRows = rows.map(r => {
        const pct = totals.totalValue > 0 ? Math.round(r.totalValue / totals.totalValue * 100) : 0;
        const cls = r.criticalCount > 0 ? "stSparkRow--critical" : "stSparkRow--ok";
        return `
                <div class="stSparkRow ${cls}">
                    <div class="stSparkRow__label">
                        <span class="stSparkRow__dot"></span>
                        <strong>${r.storeName}</strong>
                        <span class="stSparkRow__loc">${r.location}</span>
                    </div>
                    <div class="stSparkRow__bar"><div class="stSparkRow__fill" style="width:${pct}%"></div></div>
                    <div class="stSparkRow__stats">
                        <span>${r.totalQuantity.toLocaleString("tr-TR")} adet</span>
                        ${r.criticalCount > 0 ? `<span class="stSparkRow__crit">⚠ ${r.criticalCount} kritik</span>` : `<span class="stSparkRow__ok">✓</span>`}
                        <span>${r.totalValue.toLocaleString("tr-TR", {
          maximumFractionDigits: 0
        })} ₺</span>
                    </div>
                </div>`;
      }).join("");
      return `
            <div class="stDashboardHeader">
                <div class="stDashboardHeaderLeft">
                    <span class="stDashboardHeaderIcon">📊</span>
                    <div>
                        <div class="stDashboardTitle">Tedarik Zinciri Dashboard</div>
                        <div class="stDashboardSubtitle">Mağaza stok özeti ve analitik göstergeler</div>
                    </div>
                </div>
            </div>
            <div class="stKpiGrid">${kpiCards}</div>
            <div class="stSparkSection">
                <div class="stSparkSection__title">Mağaza Bazlı Stok Dağılımı</div>
                ${sparkRows}
            </div>`;
    },
    // ─── Grafik Bölümü ────────────────────────────────────────────────────────────
    _buildChartsSection: function _buildChartsSection(summaryRows, products, stockLevels, orders, suppliers) {
      const pie = this._buildCategoryPie(products, stockLevels);
      const funnel = this._buildOrderFunnel(orders);
      const bar = this._buildSupplierBar(suppliers, orders);
      const storeBar = this._buildStoreComparisonBar(summaryRows);
      return `
            <div class="stChartSectionTitle">📈 Analitik Grafikler</div>
            <div class="stChartsGrid">
                ${pie}
                ${funnel}
                ${bar}
                ${storeBar}
            </div>`;
    },
    // ─── 1. Kategori Pasta Grafiği ────────────────────────────────────────────────
    _buildCategoryPie: function _buildCategoryPie(products, stockLevels) {
      const categoryMap = {};
      stockLevels.forEach(sl => {
        const product = products.find(p => p.ID === sl.product_ID);
        const cat = product?.category ?? "Diğer";
        categoryMap[cat] = (categoryMap[cat] ?? 0) + sl.quantity;
      });
      const slices = Object.entries(categoryMap).map(([label, value]) => ({
        label,
        value
      }));
      return buildPieChart(slices, "Kategori Bazlı Stok Dağılımı");
    },
    // ─── 2. Sipariş Funnel ────────────────────────────────────────────────────────
    _buildOrderFunnel: function _buildOrderFunnel(orders) {
      const counts = {
        "Taslak": 0,
        "Onaylandı": 0,
        "Teslim Edildi": 0
      };
      orders.forEach(o => {
        if (counts[o.status] !== undefined) counts[o.status]++;
      });
      const steps = [{
        label: "Taslak",
        value: counts["Taslak"],
        color: "#6c8ebf"
      }, {
        label: "Onaylandı",
        value: counts["Onaylandı"],
        color: "#e76500"
      }, {
        label: "Teslim Edildi",
        value: counts["Teslim Edildi"],
        color: "#107e3e"
      }].filter(s => s.value > 0);
      if (steps.length === 0) {
        steps.push({
          label: "Taslak",
          value: 0,
          color: "#6c8ebf"
        }, {
          label: "Onaylandı",
          value: 0,
          color: "#e76500"
        }, {
          label: "Teslim Edildi",
          value: 0,
          color: "#107e3e"
        });
      }
      return buildFunnelChart(steps, "Sipariş Durumu Akışı");
    },
    // ─── 3. Tedarikçi Performans Bar ──────────────────────────────────────────────
    _buildSupplierBar: function _buildSupplierBar(suppliers, orders) {
      const items = suppliers.map(s => {
        const delivered = orders.filter(o => o.supplier_ID === s.ID && o.status === "Teslim Edildi" && o.createdAt && o.deliveredAt);
        let avgActual = 0;
        if (delivered.length > 0) {
          const totalDays = delivered.reduce((sum, o) => {
            const diff = (new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime()) / 86400000;
            return sum + diff;
          }, 0);
          avgActual = Math.round(totalDays / delivered.length * 10) / 10;
        }
        return {
          label: s.name.split(" ")[0],
          value: s.leadTimeDays,
          value2: avgActual > 0 ? avgActual : undefined,
          color: "#0064d9",
          color2: avgActual > s.leadTimeDays ? "#bb0000" : "#107e3e",
          tooltip: `${s.name} — Söz verilen: ${s.leadTimeDays} gün`,
          tooltip2: `${s.name} — Gerçekleşen: ${avgActual} gün`
        };
      });
      return buildHorizontalBarChart(items, "Tedarikçi Teslimat Performansı (gün)", "Söz Verilen", "Gerçekleşen");
    },
    // ─── 4. Mağaza Karşılaştırma Bar ──────────────────────────────────────────────
    _buildStoreComparisonBar: function _buildStoreComparisonBar(rows) {
      const items = rows.map(r => ({
        label: r.storeName.split(" ")[0],
        value: r.totalQuantity,
        value2: r.criticalCount,
        color: "#0064d9",
        color2: "#bb0000",
        tooltip: `${r.storeName} — Toplam: ${r.totalQuantity} adet`,
        tooltip2: `${r.storeName} — Kritik: ${r.criticalCount} ürün`
      }));
      return buildHorizontalBarChart(items, "Mağaza Stok Karşılaştırması", "Toplam Stok", "Kritik Ürün");
    },
    // ─── Public aksiyonlar ────────────────────────────────────────────────────────
    onAnalyzeDashboard: async function _onAnalyzeDashboard() {
      const model = this.getView()?.getModel();
      const result = await runWithBusy("Dashboard AI analizi yapılıyor...", async () => {
        const binding = model.bindContext("/analyzeStockWithAI(...)");
        await binding.execute();
        return binding.getBoundContext()?.getObject()?.value;
      });
      if (result !== undefined) {
        openAIResultDialog({
          title: "Dashboard AI Analiz Raporu",
          text: result
        });
      }
    },
    onRefreshDashboard: function _onRefreshDashboard() {
      this._lastHtml = "";
      const panel = document.getElementById("stDashboardKpiPanel");
      if (panel) panel.remove();
      this._loadAndRender();
    }
  });
  return DashboardExt;
});
//# sourceMappingURL=DashboardExt-dbg.controller.js.map
