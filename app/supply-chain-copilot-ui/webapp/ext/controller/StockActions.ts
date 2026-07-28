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

import { openAIResultDialog, runWithBusy, formatAIText } from "../util/AIResponseDialog";

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
    try {
        this.routing.navigateToRoute("StockSummaryList");
    } catch {
        const base = window.location.hash.split("&/")[0];
        window.location.hash = base + "&/StockSummaryByStore";
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
