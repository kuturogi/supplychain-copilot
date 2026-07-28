sap.ui.define(["sap/m/MessageBox", "sap/m/Dialog", "sap/m/Input", "sap/m/Button", "sap/m/VBox", "sap/m/ScrollContainer", "sap/m/Bar", "sap/m/Title", "sap/ui/core/Icon", "sap/m/CustomListItem", "sap/m/List", "sap/m/FormattedText", "sap/m/HBox", "sap/m/Text", "../util/AIResponseDialog", "../util/ExportHelper"], function (MessageBox, Dialog, Input, Button, VBox, ScrollContainer, Bar, Title, Icon, CustomListItem, List, FormattedText, HBox, Text, ___util_AIResponseDialog, ___util_ExportHelper) {
  "use strict";

  const openAIResultDialog = ___util_AIResponseDialog["openAIResultDialog"];
  const runWithBusy = ___util_AIResponseDialog["runWithBusy"];
  const formatAIText = ___util_AIResponseDialog["formatAIText"];
  const exportCriticalStocks = ___util_ExportHelper["exportCriticalStocks"];
  const exportAllStocks = ___util_ExportHelper["exportAllStocks"];
  /**
   * Fiori Elements custom action handler modülü.
   */
  function resolveStockLevelId(oContext) {
    if (oContext && typeof oContext.getProperty === "function") {
      return oContext.getProperty("ID");
    }
    const match = window.location.hash.match(/StockLevels\((\d+)\)/);
    return match ? parseInt(match[1], 10) : undefined;
  }
  async function callUnboundAction(model, actionPath, parameters) {
    const actionBinding = model.bindContext(actionPath);
    for (const [name, value] of Object.entries(parameters)) {
      actionBinding.setParameter(name, value);
    }
    await actionBinding.execute();
    const result = actionBinding.getBoundContext()?.getObject();
    return result?.value;
  }

  // ─── Stok Listesi Aksiyonları ────────────────────────────────────────────────

  async function onAIAnalyze() {
    const model = this.getModel();
    const result = await runWithBusy("AI stok analizi yapılıyor...", () => callUnboundAction(model, "/analyzeStockWithAI(...)", {}));
    if (result !== undefined) {
      openAIResultDialog({
        title: "AI Stok Analiz Raporu",
        text: result
      });
    }
  }
  async function onSupplierScorecard() {
    const model = this.getModel();
    const result = await runWithBusy("Tedarikçi karnesi hesaplanıyor...", () => callUnboundAction(model, "/supplierScorecard(...)", {}));
    if (result !== undefined) {
      openAIResultDialog({
        title: "Tedarikçi Performans Karnesi",
        text: result,
        state: "Information"
      });
    }
  }
  function onOpenDashboard() {
    try {
      this.routing.navigateToRoute("StockSummaryList");
    } catch {
      const base = window.location.hash.split("&/")[0];
      window.location.hash = base + "&/StockSummaryByStore";
    }
  }
  function onOpenOrders() {
    try {
      this.routing.navigateToRoute("PurchaseOrdersList");
    } catch {
      const base = window.location.hash.split("&/")[0];
      window.location.hash = base + "&/PurchaseOrders";
    }
  }
  function onOpenSuppliers() {
    try {
      this.routing.navigateToRoute("SuppliersList");
    } catch {
      const base = window.location.hash.split("&/")[0];
      window.location.hash = base + "&/Suppliers";
    }
  }
  function onOpenProducts() {
    try {
      this.routing.navigateToRoute("ProductsList");
    } catch {
      const base = window.location.hash.split("&/")[0];
      window.location.hash = base + "&/Products";
    }
  }
  async function onBulkOrder() {
    const model = this.getModel();
    const result = await runWithBusy("Kritik stoklar için siparişler oluşturuluyor...", async () => {
      const binding = model.bindContext("/createBulkOrders(...)");
      await binding.execute();
      return binding.getBoundContext()?.getObject()?.value;
    });
    if (result !== undefined) {
      openAIResultDialog({
        title: "Toplu Sipariş Raporu",
        text: result,
        state: "Success"
      });
      model.refresh();
    }
  }
  function onOpenAnalysisLog() {
    try {
      this.routing.navigateToRoute("AnalysisLogsList");
    } catch {
      const base = window.location.hash.split("&/")[0];
      window.location.hash = base + "&/AnalysisLogs";
    }
  }
  function onOpenStores() {
    try {
      this.routing.navigateToRoute("StoresList");
    } catch {
      const base = window.location.hash.split("&/")[0];
      window.location.hash = base + "&/Stores";
    }
  }
  async function onExportCritical() {
    const model = this.getModel();
    await exportCriticalStocks(model);
  }
  async function onExportAll() {
    const model = this.getModel();
    await exportAllStocks(model);
  }
  function onOpenNotifications() {
    try {
      this.routing.navigateToRoute("NotificationsList");
    } catch {
      const base = window.location.hash.split("&/")[0];
      window.location.hash = base + "&/Notifications";
    }
  }
  async function onMarkAllNotificationsRead() {
    const model = this.getModel();
    const result = await runWithBusy("Bildirimler güncelleniyor...", async () => {
      const binding = model.bindContext("/markAllNotificationsRead(...)");
      await binding.execute();
      return binding.getBoundContext()?.getObject()?.value;
    });
    if (result !== undefined) {
      model.refresh();
      openAIResultDialog({
        title: "Bildirimler Güncellendi",
        text: "Tüm bildirimler okundu olarak işaretlendi.",
        state: "Success"
      });
    }
  }

  // ─── Copilot Chat Dialog ─────────────────────────────────────────────────────

  let copilotDialog = null;
  let chatList = null;
  let chatScrollContainer = null;
  const chatHistory = [];
  function buildMessageItem(msg) {
    const isUser = msg.role === "user";
    const bubble = new FormattedText({
      htmlText: isUser ? "<p>" + msg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</p>" : formatAIText(msg.text)
    }).addStyleClass(isUser ? "stChatBubbleUser" : "stChatBubbleAssistant");
    const icon = new Icon({
      src: isUser ? "sap-icon://person-placeholder" : "sap-icon://ai",
      size: "1.2rem"
    }).addStyleClass(isUser ? "stChatIconUser" : "stChatIconAssistant");
    const row = new HBox({
      justifyContent: isUser ? "End" : "Start",
      items: isUser ? [bubble, icon] : [icon, bubble],
      renderType: "Bare"
    }).addStyleClass("stChatRow");
    return new CustomListItem({
      content: [row]
    }).addStyleClass("stChatListItem");
  }
  function buildTypingItem() {
    const bubble = new Text({
      text: "Copilot yanıt yazıyor..."
    }).addStyleClass("stChatTyping");
    const icon = new Icon({
      src: "sap-icon://ai",
      size: "1.2rem"
    }).addStyleClass("stChatIconAssistant");
    const row = new HBox({
      justifyContent: "Start",
      items: [icon, bubble],
      renderType: "Bare"
    }).addStyleClass("stChatRow");
    return new CustomListItem({
      content: [row]
    }).addStyleClass("stChatListItem stChatTypingItem");
  }
  function scrollToBottom() {
    if (!chatScrollContainer) return;
    const domRef = chatScrollContainer.getDomRef();
    if (domRef) {
      domRef.scrollTop = domRef.scrollHeight;
    }
  }
  function onAskCopilot() {
    const model = this.getModel();
    chatList = new List({
      showNoData: false,
      backgroundDesign: "Transparent"
    }).addStyleClass("stChatList");
    chatScrollContainer = new ScrollContainer({
      vertical: true,
      horizontal: false,
      height: "26rem",
      content: [chatList]
    }).addStyleClass("stChatScrollArea");
    const questionInput = new Input({
      placeholder: "Sorunuzu yazın... (Enter ile gönderin)",
      width: "100%"
    }).addStyleClass("stChatInput");
    const sendButton = new Button({
      icon: "sap-icon://paper-plane",
      type: "Emphasized"
    });
    const inputRow = new HBox({
      renderType: "Bare",
      items: [questionInput, sendButton]
    }).addStyleClass("stChatInputRow");
    copilotDialog = new Dialog({
      customHeader: new Bar({
        contentLeft: [new Icon({
          src: "sap-icon://ai",
          size: "1.4rem"
        }).addStyleClass("stCopilotHeaderIcon")],
        contentMiddle: [new Title({
          text: "Supply Chain Copilot",
          level: "H2"
        })]
      }),
      resizable: true,
      draggable: true,
      contentWidth: "42rem",
      content: [new VBox({
        items: [chatScrollContainer, inputRow]
      }).addStyleClass("stChatWrapper")],
      endButton: new Button({
        text: "Kapat",
        press: () => {
          copilotDialog?.close();
        }
      }),
      afterClose: () => {
        copilotDialog?.destroy();
        copilotDialog = null;
        chatList = null;
        chatScrollContainer = null;
      }
    }).addStyleClass("stCopilotDialog");

    // Karşılama mesajı
    if (chatHistory.length === 0) {
      const welcome = {
        role: "assistant",
        text: "Merhaba! Ben Supply Chain Copilot.\n\nŞunları sorabilirsiniz:\n- Hangi ürünler kritik durumda?\n- Transfer önerisi var mı?\n- Tedarikçi gecikmeleri neler?\n- İstanbul'da stok durumu nedir?\n- Satışlar ve sipariş özetleri"
      };
      chatHistory.push(welcome);
      chatList.addItem(buildMessageItem(welcome));
    } else {
      chatHistory.forEach(msg => chatList.addItem(buildMessageItem(msg)));
    }
    const handleSend = async () => {
      const question = questionInput.getValue().trim();
      if (!question || !chatList) return;
      questionInput.setValue("");
      questionInput.setEnabled(false);
      sendButton.setEnabled(false);
      const userMsg = {
        role: "user",
        text: question
      };
      chatHistory.push(userMsg);
      chatList.addItem(buildMessageItem(userMsg));
      const typingItem = buildTypingItem();
      chatList.addItem(typingItem);
      setTimeout(scrollToBottom, 50);
      try {
        const actionBinding = model.bindContext("/askCopilot(...)");
        actionBinding.setParameter("question", question);
        await actionBinding.execute();
        const result = actionBinding.getBoundContext()?.getObject();
        const answer = result?.value ?? "Cevap alınamadı.";
        const assistantMsg = {
          role: "assistant",
          text: answer
        };
        chatHistory.push(assistantMsg);
        chatList.removeItem(typingItem);
        typingItem.destroy();
        chatList.addItem(buildMessageItem(assistantMsg));
      } catch (error) {
        chatList.removeItem(typingItem);
        typingItem.destroy();
        const errMsg = {
          role: "assistant",
          text: "Hata: İstek işlenemedi, lütfen tekrar deneyin."
        };
        chatHistory.push(errMsg);
        chatList.addItem(buildMessageItem(errMsg));
      } finally {
        questionInput.setEnabled(true);
        sendButton.setEnabled(true);
        questionInput.focus();
        setTimeout(scrollToBottom, 100);
      }
    };
    questionInput.attachSubmit(handleSend);
    sendButton.attachPress(handleSend);
    copilotDialog.open();
    setTimeout(scrollToBottom, 200);
  }

  // ─── Detay Sayfası Aksiyonları ───────────────────────────────────────────────

  async function onForecastDemand(oContext) {
    const stockLevelId = resolveStockLevelId(oContext);
    if (stockLevelId === undefined) {
      MessageBox.error("Stok kaydı belirlenemedi.");
      return;
    }
    const model = this.getModel();
    const result = await runWithBusy("Talep tahmini hesaplanıyor...", () => callUnboundAction(model, "/forecastDemand(...)", {
      stockLevelId
    }));
    if (result !== undefined) {
      openAIResultDialog({
        title: "Talep Tahmini Raporu",
        text: result
      });
    }
  }
  async function onCreateOrder(oContext) {
    const stockLevelId = resolveStockLevelId(oContext);
    if (stockLevelId === undefined) {
      MessageBox.error("Stok kaydı belirlenemedi.");
      return;
    }
    const model = this.getModel();
    const result = await runWithBusy("Sipariş taslağı oluşturuluyor...", () => callUnboundAction(model, "/createPurchaseOrder(...)", {
      stockLevelId,
      quantity: 0
    }));
    if (result !== undefined) {
      openAIResultDialog({
        title: "Sipariş Taslağı Oluşturuldu",
        text: result,
        state: "Success"
      });
    }
  }
  var __exports = {
    __esModule: true
  };
  __exports.onAIAnalyze = onAIAnalyze;
  __exports.onSupplierScorecard = onSupplierScorecard;
  __exports.onOpenDashboard = onOpenDashboard;
  __exports.onOpenOrders = onOpenOrders;
  __exports.onOpenSuppliers = onOpenSuppliers;
  __exports.onOpenProducts = onOpenProducts;
  __exports.onBulkOrder = onBulkOrder;
  __exports.onOpenAnalysisLog = onOpenAnalysisLog;
  __exports.onOpenStores = onOpenStores;
  __exports.onExportCritical = onExportCritical;
  __exports.onExportAll = onExportAll;
  __exports.onOpenNotifications = onOpenNotifications;
  __exports.onMarkAllNotificationsRead = onMarkAllNotificationsRead;
  __exports.onAskCopilot = onAskCopilot;
  __exports.onForecastDemand = onForecastDemand;
  __exports.onCreateOrder = onCreateOrder;
  return __exports;
});
//# sourceMappingURL=StockActions-dbg.js.map
