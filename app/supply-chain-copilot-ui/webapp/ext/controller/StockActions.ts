import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Button from "sap/m/Button";
import VBox from "sap/m/VBox";
import ScrollContainer from "sap/m/ScrollContainer";
import Bar from "sap/m/Bar";
import Title from "sap/m/Title";
import Icon from "sap/ui/core/Icon";
import CustomListItem from "sap/m/CustomListItem";
import List from "sap/m/List";
import FormattedText from "sap/m/FormattedText";
import HBox from "sap/m/HBox";
import Text from "sap/m/Text";
import FlexBox from "sap/m/FlexBox";
import HTML from "sap/ui/core/HTML";

import { openAIResultDialog, runWithBusy, formatAIText } from "../util/AIResponseDialog";
import { exportCriticalStocks, exportAllStocks } from "../util/ExportHelper";
import { buildPieChart, buildHorizontalBarChart, buildFunnelChart } from "../util/ChartBuilder";

/**
 * Fiori Elements custom action handler modülü.
 */

function resolveStockLevelId(oContext: unknown): number | undefined {
    if (
        oContext &&
        typeof (oContext as { getProperty?: unknown }).getProperty === "function"
    ) {
        return (oContext as { getProperty(p: string): number }).getProperty("ID");
    }
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

// ─── Stok Listesi Aksiyonları ────────────────────────────────────────────────

export async function onAIAnalyze(this: any): Promise<void> {
    const model = this.getModel() as ODataModel;
    const result = await runWithBusy("AI stok analizi yapılıyor...", () =>
        callUnboundAction(model, "/analyzeStockWithAI(...)", {})
    );
    if (result !== undefined) {
        openAIResultDialog({
            title: "AI Stok Analiz Raporu",
            text: result
        });
    }
}

export async function onSupplierScorecard(this: any): Promise<void> {
    const model = this.getModel() as ODataModel;
    const result = await runWithBusy("Tedarikçi karnesi hesaplanıyor...", () =>
        callUnboundAction(model, "/supplierScorecard(...)", {})
    );
    if (result !== undefined) {
        openAIResultDialog({
            title: "Tedarikçi Performans Karnesi",
            text: result,
            state: "Information"
        });
    }
}

export function onOpenDashboard(this: any): void {
    const model = this.getModel() as ODataModel;
    _openDashboardDialog(model);
}

export function onOpenOrders(this: any): void {
    try {
        this.routing.navigateToRoute("PurchaseOrdersList");
    } catch {
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/PurchaseOrders";
    }
}

export function onOpenSuppliers(this: any): void {
    try {
        this.routing.navigateToRoute("SuppliersList");
    } catch {
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/Suppliers";
    }
}

export function onOpenProducts(this: any): void {
    try {
        this.routing.navigateToRoute("ProductsList");
    } catch {
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/Products";
    }
}

export async function onBulkOrder(this: any): Promise<void> {
    const model = this.getModel() as ODataModel;
    const result = await runWithBusy("Kritik stoklar için siparişler oluşturuluyor...", async () => {
        const binding = model.bindContext("/createBulkOrders(...)");
        await binding.execute();
        return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
    });
    if (result !== undefined) {
        openAIResultDialog({ title: "Toplu Sipariş Raporu", text: result, state: "Success" });
        model.refresh();
    }
}

export function onOpenAnalysisLog(this: any): void {
    try {
        this.routing.navigateToRoute("AnalysisLogsList");
    } catch {
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/AnalysisLogs";
    }
}

export function onOpenStores(this: any): void {
    try {
        this.routing.navigateToRoute("StoresList");
    } catch {
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/Stores";
    }
}

export async function onExportCritical(this: any): Promise<void> {
    const model = this.getModel() as ODataModel;
    await exportCriticalStocks(model);
}

export async function onExportAll(this: any): Promise<void> {
    const model = this.getModel() as ODataModel;
    await exportAllStocks(model);
}

export function onOpenNotifications(this: any): void {
    try {
        this.routing.navigateToRoute("NotificationsList");
    } catch {
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/Notifications";
    }
}

export async function onMarkAllNotificationsRead(this: any): Promise<void> {
    const model = this.getModel() as ODataModel;
    const result = await runWithBusy("Bildirimler güncelleniyor...", async () => {
        const binding = model.bindContext("/markAllNotificationsRead(...)");
        await binding.execute();
        return (binding.getBoundContext()?.getObject() as { value?: string })?.value;
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

interface ChatMessage {
    role: "user" | "assistant";
    text: string;
}

let copilotDialog: Dialog | null = null;
let chatList: List | null = null;
let chatScrollContainer: ScrollContainer | null = null;
const chatHistory: ChatMessage[] = [];

function buildMessageItem(msg: ChatMessage): CustomListItem {
    const isUser = msg.role === "user";

    const bubble = new FormattedText({
        htmlText: isUser
            ? "<p>" + msg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</p>"
            : formatAIText(msg.text)
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

function buildTypingItem(): CustomListItem {
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

function scrollToBottom(): void {
    if (!chatScrollContainer) return;
    const domRef = chatScrollContainer.getDomRef();
    if (domRef) {
        domRef.scrollTop = domRef.scrollHeight;
    }
}

export function onAskCopilot(this: any): void {
    const model = this.getModel() as ODataModel;

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
            contentLeft: [new Icon({ src: "sap-icon://ai", size: "1.4rem" }).addStyleClass("stCopilotHeaderIcon")],
            contentMiddle: [new Title({ text: "Supply Chain Copilot", level: "H2" })]
        }),
        resizable: true,
        draggable: true,
        contentWidth: "42rem",
        content: [
            new VBox({
                items: [chatScrollContainer, inputRow]
            }).addStyleClass("stChatWrapper")
        ],
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
        const welcome: ChatMessage = {
            role: "assistant",
            text: "Merhaba! Ben Supply Chain Copilot.\n\nŞunları sorabilirsiniz:\n- Hangi ürünler kritik durumda?\n- Transfer önerisi var mı?\n- Tedarikçi gecikmeleri neler?\n- İstanbul'da stok durumu nedir?\n- Satışlar ve sipariş özetleri"
        };
        chatHistory.push(welcome);
        chatList.addItem(buildMessageItem(welcome));
    } else {
        chatHistory.forEach(msg => chatList!.addItem(buildMessageItem(msg)));
    }

    const handleSend = async (): Promise<void> => {
        const question = questionInput.getValue().trim();
        if (!question || !chatList) return;

        questionInput.setValue("");
        questionInput.setEnabled(false);
        sendButton.setEnabled(false);

        const userMsg: ChatMessage = { role: "user", text: question };
        chatHistory.push(userMsg);
        chatList.addItem(buildMessageItem(userMsg));

        const typingItem = buildTypingItem();
        chatList.addItem(typingItem);
        setTimeout(scrollToBottom, 50);

        try {
            const actionBinding = model.bindContext("/askCopilot(...)");
            actionBinding.setParameter("question", question);
            await actionBinding.execute();
            const result = actionBinding.getBoundContext()?.getObject() as { value?: string };
            const answer = result?.value ?? "Cevap alınamadı.";

            const assistantMsg: ChatMessage = { role: "assistant", text: answer };
            chatHistory.push(assistantMsg);
            chatList.removeItem(typingItem);
            typingItem.destroy();
            chatList.addItem(buildMessageItem(assistantMsg));
        } catch (error) {
            chatList.removeItem(typingItem);
            typingItem.destroy();
            const errMsg: ChatMessage = { role: "assistant", text: "Hata: İstek işlenemedi, lütfen tekrar deneyin." };
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

export async function onForecastDemand(this: any, oContext: unknown): Promise<void> {
    const stockLevelId = resolveStockLevelId(oContext);
    if (stockLevelId === undefined) {
        MessageBox.error("Stok kaydı belirlenemedi.");
        return;
    }
    const model = this.getModel() as ODataModel;
    const result = await runWithBusy("Talep tahmini hesaplanıyor...", () =>
        callUnboundAction(model, "/forecastDemand(...)", { stockLevelId })
    );
    if (result !== undefined) {
        openAIResultDialog({
            title: "Talep Tahmini Raporu",
            text: result
        });
    }
}

export async function onCreateOrder(this: any, oContext: unknown): Promise<void> {
    const stockLevelId = resolveStockLevelId(oContext);
    if (stockLevelId === undefined) {
        MessageBox.error("Stok kaydı belirlenemedi.");
        return;
    }
    const model = this.getModel() as ODataModel;
    const result = await runWithBusy("Sipariş taslağı oluşturuluyor...", () =>
        callUnboundAction(model, "/createPurchaseOrder(...)", { stockLevelId, quantity: 0 })
    );
    if (result !== undefined) {
        openAIResultDialog({
            title: "Sipariş Taslağı Oluşturuldu",
            text: result,
            state: "Success"
        });
    }
}

// ─── Dashboard Dialog ─────────────────────────────────────────────────────────

interface StoreSummaryRow { storeId: number; storeName: string; location: string; totalQuantity: number; criticalCount: number; totalValue: number; }
interface DProduct { ID: number; name: string; category: string; unitPrice: number; }
interface DStockLevel { ID: number; quantity: number; criticalThreshold: number; store_ID: number; product_ID: number; }
interface DOrder { status: string; orderQuantity: number; product_ID: number; supplier_ID: number; createdAt: string; deliveredAt: string; }
interface DSupplier { ID: number; name: string; leadTimeDays: number; }

async function _fetchList<T>(model: ODataModel, path: string): Promise<T[]> {
    const binding = model.bindList(path);
    const contexts = await binding.requestContexts(0, 200);
    return contexts.map(c => c.getObject() as T);
}

function _fmtCurrency(n: number): string {
    return n.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
}

function _buildKpiHtml(rows: StoreSummaryRow[]): string {
    const totalValue    = rows.reduce((s, r) => s + (r.totalValue ?? 0), 0);
    const totalQty      = rows.reduce((s, r) => s + (r.totalQuantity ?? 0), 0);
    const criticalCount = rows.reduce((s, r) => s + (r.criticalCount ?? 0), 0);
    const healthy       = rows.filter(r => (r.criticalCount ?? 0) === 0).length;
    const healthPct     = rows.length > 0 ? Math.round((healthy / rows.length) * 100) : 100;

    const cards = [
        { icon: "💰", label: "Toplam Stok Değeri",  value: _fmtCurrency(totalValue),                  sub: `${rows.length} mağaza`,                                                    cls: "neutral"  },
        { icon: "📦", label: "Toplam Stok Adedi",   value: totalQty.toLocaleString("tr-TR"),           sub: "Tüm mağazalar",                                                            cls: "neutral"  },
        { icon: criticalCount > 0 ? "⚠️" : "✅",    label: "Kritik Ürün",                             value: String(criticalCount), sub: criticalCount > 0 ? "Acil aksiyon" : "Tümü sağlıklı", cls: criticalCount > 0 ? "critical" : "good" },
        { icon: "🏪", label: "Sağlıklı Mağaza",     value: `${healthy} / ${rows.length}`,             sub: `%${healthPct} kritik ürünsüz`,                                             cls: healthPct === 100 ? "good" : healthPct >= 50 ? "warning" : "critical" }
    ];

    const cardsHtml = cards.map(c => `
        <div class="stKpiCard stKpiCard--${c.cls}">
            <div class="stKpiCard__icon">${c.icon}</div>
            <div class="stKpiCard__body">
                <div class="stKpiCard__value">${c.value}</div>
                <div class="stKpiCard__label">${c.label}</div>
                <div class="stKpiCard__sub">${c.sub}</div>
            </div>
        </div>`).join("");

    const sparkHtml = rows.map(r => {
        const pct = totalValue > 0 ? Math.round((r.totalValue / totalValue) * 100) : 0;
        const cls = r.criticalCount > 0 ? "stSparkRow--critical" : "stSparkRow--ok";
        return `<div class="stSparkRow ${cls}">
            <div class="stSparkRow__label">
                <span class="stSparkRow__dot"></span>
                <strong>${r.storeName}</strong>
                <span class="stSparkRow__loc">${r.location}</span>
            </div>
            <div class="stSparkRow__bar"><div class="stSparkRow__fill" style="width:${pct}%"></div></div>
            <div class="stSparkRow__stats">
                <span>${r.totalQuantity.toLocaleString("tr-TR")} adet</span>
                ${r.criticalCount > 0 ? `<span class="stSparkRow__crit">⚠ ${r.criticalCount} kritik</span>` : `<span class="stSparkRow__ok">✓</span>`}
                <span>${r.totalValue.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ₺</span>
            </div>
        </div>`;
    }).join("");

    return `
        <div class="stDashboardDialogBody">
            <div class="stNttBadgeInline">
                <svg viewBox="0 0 140 36" xmlns="http://www.w3.org/2000/svg" width="140" height="36">
                    <rect width="140" height="36" rx="6" fill="#003087"/>
                    <text x="8" y="14" font-family="Arial,sans-serif" font-size="11" font-weight="900" fill="#fff" letter-spacing="1">NTT DATA</text>
                    <text x="8" y="28" font-family="Arial,sans-serif" font-size="7.5" fill="#7eb3f5" letter-spacing="0.3">Business Solutions</text>
                    <circle cx="128" cy="18" r="7" fill="#e4002b"/>
                    <circle cx="128" cy="18" r="4" fill="#fff"/>
                    <circle cx="128" cy="18" r="2" fill="#e4002b"/>
                </svg>
            </div>
            <div class="stKpiGrid">${cardsHtml}</div>
            <div class="stSparkSection">
                <div class="stSparkSection__title">Mağaza Bazlı Stok Dağılımı</div>
                ${sparkHtml}
            </div>
        </div>`;
}

function _buildChartsHtml(
    rows: StoreSummaryRow[],
    products: DProduct[],
    stockLevels: DStockLevel[],
    orders: DOrder[],
    suppliers: DSupplier[]
): string {
    // Kategori pasta
    const catMap: Record<string, number> = {};
    stockLevels.forEach(sl => {
        const cat = products.find(p => p.ID === sl.product_ID)?.category ?? "Diğer";
        catMap[cat] = (catMap[cat] ?? 0) + sl.quantity;
    });
    const pie = buildPieChart(Object.entries(catMap).map(([label, value]) => ({ label, value })), "Kategori Bazlı Stok Dağılımı");

    // Sipariş funnel
    const counts: Record<string, number> = { "Taslak": 0, "Onaylandı": 0, "Teslim Edildi": 0 };
    orders.forEach(o => { if (counts[o.status] !== undefined) counts[o.status]++; });
    const funnel = buildFunnelChart([
        { label: "Taslak",        value: counts["Taslak"],        color: "#6c8ebf" },
        { label: "Onaylandı",     value: counts["Onaylandı"],     color: "#e76500" },
        { label: "Teslim Edildi", value: counts["Teslim Edildi"], color: "#107e3e" }
    ], "Sipariş Durumu Akışı");

    // Tedarikçi bar
    const supplierItems = suppliers.map(s => {
        const delivered = orders.filter(o => o.supplier_ID === s.ID && o.status === "Teslim Edildi" && o.createdAt && o.deliveredAt);
        let avgActual = 0;
        if (delivered.length > 0) {
            avgActual = Math.round((delivered.reduce((sum, o) =>
                sum + (new Date(o.deliveredAt).getTime() - new Date(o.createdAt).getTime()) / 86400000, 0) / delivered.length) * 10) / 10;
        }
        return { label: s.name.split(" ")[0], value: s.leadTimeDays, value2: avgActual > 0 ? avgActual : undefined, color: "#0064d9", color2: avgActual > s.leadTimeDays ? "#bb0000" : "#107e3e", tooltip: `${s.name} — Söz: ${s.leadTimeDays} gün`, tooltip2: `${s.name} — Gerçekleşen: ${avgActual} gün` };
    });
    const supplierBar = buildHorizontalBarChart(supplierItems, "Tedarikçi Teslimat Performansı (gün)", "Söz Verilen", "Gerçekleşen");

    // Mağaza bar
    const storeItems = rows.map(r => ({ label: r.storeName.split(" ")[0], value: r.totalQuantity, value2: r.criticalCount, color: "#0064d9", color2: "#bb0000", tooltip: `${r.storeName} — Toplam: ${r.totalQuantity}`, tooltip2: `${r.storeName} — Kritik: ${r.criticalCount}` }));
    const storeBar = buildHorizontalBarChart(storeItems, "Mağaza Stok Karşılaştırması", "Toplam Stok", "Kritik Ürün");

    return `<div class="stChartsGrid">${pie}${funnel}${supplierBar}${storeBar}</div>`;
}

let _dashboardDialog: Dialog | null = null;

export async function _openDashboardDialog(model: ODataModel): Promise<void> {
    if (_dashboardDialog) {
        _dashboardDialog.open();
        return;
    }

    const loadingHtml = new HTML({ content: `<div style="padding:2rem;text-align:center;color:#6a6d70">⏳ Veriler yükleniyor...</div>` });
    const kpiContainer   = new HTML({ content: "<div></div>" });
    const chartContainer = new HTML({ content: "<div></div>" });

    const scrollContent = new VBox({ items: [loadingHtml, kpiContainer, chartContainer] });

    const scroll = new ScrollContainer({
        vertical: true,
        horizontal: false,
        height: "70vh",
        content: [scrollContent]
    });

    _dashboardDialog = new Dialog({
        customHeader: new Bar({
            contentLeft: [new Icon({ src: "sap-icon://home", size: "1.3rem" })],
            contentMiddle: [new Title({ text: "📊 Tedarik Zinciri Dashboard", level: "H2" })]
        }),
        contentWidth: "90vw",
        resizable: true,
        draggable: true,
        content: [scroll],
        endButton: new Button({
            text: "Kapat",
            press: () => { _dashboardDialog?.close(); }
        }),
        afterClose: () => {
            _dashboardDialog?.destroy();
            _dashboardDialog = null;
        }
    }).addStyleClass("stDashboardDialog");

    _dashboardDialog.open();

    try {
        const [rows, products, stockLevels, orders, suppliers] = await Promise.all([
            _fetchList<StoreSummaryRow>(model, "/StockSummaryByStore"),
            _fetchList<DProduct>(model, "/Products"),
            _fetchList<DStockLevel>(model, "/StockLevels"),
            _fetchList<DOrder>(model, "/PurchaseOrders"),
            _fetchList<DSupplier>(model, "/Suppliers")
        ]);

        loadingHtml.setContent("<div></div>");
        kpiContainer.setContent(_buildKpiHtml(rows));
        chartContainer.setContent(`<div class="stChartSectionTitle">📈 Analitik Grafikler</div>` + _buildChartsHtml(rows, products, stockLevels, orders, suppliers));
    } catch (e) {
        loadingHtml.setContent(`<div style="padding:1rem;color:#bb0000">Veri yüklenemedi: ${e}</div>`);
        console.error("Dashboard veri hatası:", e);
    }
}
