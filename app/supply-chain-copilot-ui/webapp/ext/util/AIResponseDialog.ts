import Dialog from "sap/m/Dialog";
import Bar from "sap/m/Bar";
import Title from "sap/m/Title";
import Icon from "sap/ui/core/Icon";
import FormattedText from "sap/m/FormattedText";
import Button from "sap/m/Button";
import BusyDialog from "sap/m/BusyDialog";
import MessageToast from "sap/m/MessageToast";
import { escapeHtml } from "./Html";

/**
 * AI aksiyonlarının (analyzeStockWithAI, forecastDemand, createPurchaseOrder,
 * supplierScorecard) düz metin cevaplarını sade bir MessageBox yerine
 * biçimlendirilmiş, ikonlu bir Dialog içinde göstermek için ortak yardımcı modül.
 */

export type AIResultState = "Success" | "Warning" | "Error" | "Information";

const STATE_ICON: Record<AIResultState, string> = {
    Success: "sap-icon://sys-enter-2",
    Warning: "sap-icon://alert",
    Error: "sap-icon://error",
    Information: "sap-icon://information"
};

const STATE_STYLE_CLASS: Record<AIResultState, string> = {
    Success: "stAiPanelSuccess",
    Warning: "stAiPanelWarning",
    Error: "stAiPanelError",
    Information: "stAiPanelInformation"
};

const SECTION_HEADER_RE = /^[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9 /()%.,:+-]*:$/;
const NUMBERED_RE = /^(\d+)\.\s+(.*)$/;
const BULLET_RE = /^-\s+(.*)$/;
const UNDERLINE_RE = /^=+$/;

/**
 * Backend'den gelen sabit anahtar kelimeleri <strong>/<em> ile öne çıkarır.
 * FormattedText'in izinli etiket listesiyle sınırlı kalmak için span/class
 * yerine sadece temel vurgu etiketleri kullanılır.
 */
function highlightKeywords(escaped: string): string {
    return escaped
        .replace(/\*\*\*\s*KRİTİK\s*\*\*\*/g, "<strong>⚠ KRİTİK ⚠</strong>")
        .replace(/\bACİL\b/g, "<strong>ACİL</strong>")
        .replace(/\bDİKKAT\b/g, "<strong>DİKKAT</strong>")
        .replace(/GÜVENİLİRLİK YÖNLENDİRMESİ:/g, "<strong>GÜVENİLİRLİK YÖNLENDİRMESİ:</strong>")
        .replace(/GÜVENİLİR ✓/g, "<strong>GÜVENİLİR ✓</strong>")
        .replace(/HAFİF GECİKMELİ/g, "<em>HAFİF GECİKMELİ</em>")
        .replace(/GECİKMELİ ✗/g, "<strong>GECİKMELİ ✗</strong>");
}

/**
 * "BAŞLIK\n====\n" desenindeki başlık + alt çizgi satırlarını kaldırır;
 * dialog zaten kendi başlığını gösterdiği için tekrarı önler.
 */
function stripRedundantTitle(lines: string[]): string[] {
    const cleaned: string[] = [];
    for (let idx = 0; idx < lines.length; idx++) {
        const current = lines[idx].trim();
        const next = lines[idx + 1] !== undefined ? lines[idx + 1].trim() : "";
        if (current.length > 0 && UNDERLINE_RE.test(next) && !BULLET_RE.test(current)) {
            idx++;
            continue;
        }
        cleaned.push(lines[idx]);
    }
    return cleaned;
}

/**
 * Backend'in ürettiği düz metni (başlık/alt çizgi/madde işareti/numaralı liste
 * desenleriyle) sap.m.FormattedText'in izin verdiği sade HTML alt kümesine çevirir.
 */
export function formatAIText(raw: string): string {
    const lines = stripRedundantTitle(raw.replace(/\r\n/g, "\n").split("\n"));
    const html: string[] = [];
    let listMode: "ul" | "ol" | null = null;
    let paragraphBuffer: string[] = [];

    const flushParagraph = (): void => {
        if (paragraphBuffer.length > 0) {
            html.push("<p>" + paragraphBuffer.join("<br/>") + "</p>");
            paragraphBuffer = [];
        }
    };
    const closeList = (): void => {
        if (listMode) {
            html.push(`</${listMode}>`);
            listMode = null;
        }
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (line.length === 0) {
            flushParagraph();
            closeList();
            continue;
        }
        if (UNDERLINE_RE.test(line)) {
            continue;
        }

        const bulletMatch = line.match(BULLET_RE);
        if (bulletMatch) {
            flushParagraph();
            if (listMode !== "ul") {
                closeList();
                html.push("<ul>");
                listMode = "ul";
            }
            html.push("<li>" + highlightKeywords(escapeHtml(bulletMatch[1])) + "</li>");
            continue;
        }

        const numberedMatch = line.match(NUMBERED_RE);
        if (numberedMatch) {
            flushParagraph();
            if (listMode !== "ol") {
                closeList();
                html.push("<ol>");
                listMode = "ol";
            }
            html.push("<li>" + highlightKeywords(escapeHtml(numberedMatch[2])) + "</li>");
            continue;
        }

        closeList();

        if (line.startsWith("[") && line.endsWith("]")) {
            flushParagraph();
            html.push("<p><em>" + escapeHtml(line.slice(1, -1)) + "</em></p>");
            continue;
        }

        if (line.length > 2 && SECTION_HEADER_RE.test(line)) {
            flushParagraph();
            html.push("<h3>" + escapeHtml(line.replace(/:$/, "")) + "</h3>");
            continue;
        }

        paragraphBuffer.push(highlightKeywords(escapeHtml(line)));
    }
    flushParagraph();
    closeList();

    return html.join("");
}

/** Metindeki anahtar kelimelere göre dialog rengini/ikonunu otomatik belirler. */
export function detectState(text: string): AIResultState {
    if (/^Hata:/m.test(text) || /bağlantısında hata/i.test(text)) {
        return "Error";
    }
    if (/KRİTİK|ACİL|DİKKAT|GECİKMELİ ✗|GECİKMELİ$/m.test(text)) {
        return "Warning";
    }
    return "Success";
}

export interface AIResultDialogOptions {
    title: string;
    text: string;
    state?: AIResultState;
}

function copyToClipboard(text: string): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => MessageToast.show("Rapor panoya kopyalandı"))
            .catch(() => MessageToast.show("Kopyalama başarısız oldu"));
    } else {
        MessageToast.show("Bu tarayıcıda panoya kopyalama desteklenmiyor");
    }
}

/**
 * AI aksiyonlarından dönen düz metni ikonlu, renk kodlu ve biçimlendirilmiş
 * bir Dialog içinde gösterir. `state` verilmezse metin içeriğine göre otomatik seçilir.
 */
export function openAIResultDialog(options: AIResultDialogOptions): void {
    const state = options.state ?? detectState(options.text);

    const icon = new Icon({
        src: STATE_ICON[state],
        size: "1.75rem"
    }).addStyleClass("stAiDialogIcon");

    const header = new Bar({
        contentLeft: [icon],
        contentMiddle: [new Title({ text: options.title, level: "H2" })]
    });

    const formattedText = new FormattedText({
        htmlText: formatAIText(options.text)
    }).addStyleClass("stAiDialogContent");

    const dialog = new Dialog({
        customHeader: header,
        state,
        resizable: true,
        draggable: true,
        contentWidth: "34rem",
        content: [formattedText],
        beginButton: new Button({
            text: "Panoya Kopyala",
            icon: "sap-icon://copy",
            press: () => copyToClipboard(options.text)
        }),
        endButton: new Button({
            text: "Kapat",
            press: () => dialog.close()
        }),
        afterClose: () => dialog.destroy()
    }).addStyleClass(STATE_STYLE_CLASS[state]);

    dialog.open();
}

function extractErrorMessage(error: unknown): string {
    if (error && typeof error === "object") {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }
    return "Bilinmeyen bir hata oluştu.";
}

/**
 * Verilen async aksiyonu bir BusyDialog altında çalıştırır; başarılı sonucu
 * döner, hata durumunda kırmızı bir sonuç dialog'u gösterip undefined döner.
 */
export async function runWithBusy<T>(busyText: string, action: () => Promise<T>): Promise<T | undefined> {
    const busyDialog = new BusyDialog({ text: busyText });
    busyDialog.open();
    try {
        return await action();
    } catch (error) {
        console.error(error);
        openAIResultDialog({
            title: "İşlem Başarısız",
            text: "Hata: " + extractErrorMessage(error),
            state: "Error"
        });
        return undefined;
    } finally {
        busyDialog.close();
        busyDialog.destroy();
    }
}
