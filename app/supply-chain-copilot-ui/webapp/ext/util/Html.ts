/**
 * HTML kaçış yardımcıları.
 *
 * Uygulamada birden çok yer (dashboard KPI kartları, SVG grafikler, AI cevap
 * dialog'u) veritabanından gelen metni doğrudan HTML/SVG string'ine gömüyor.
 * Bu metinler OData üzerinden düzenlenebildiği için escape edilmeden basılmaları
 * depolanmış XSS'e yol açar. Tek bir kaçış fonksiyonunu paylaşarak her yeni
 * şablonun aynı davranışı almasını sağlıyoruz.
 */

/**
 * Metni HTML/SVG metin içeriğine ve tırnaklı öznitelik değerlerine gömülebilecek
 * biçimde kaçırır. null/undefined boş string'e düşer.
 */
export function escapeHtml(input: unknown): string {
    if (input === null || input === undefined) {
        return "";
    }
    return String(input)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
