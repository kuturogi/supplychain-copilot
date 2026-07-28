import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";

interface StockLevel {
    ID: number;
    quantity: number;
    criticalThreshold: number;
    store_ID: number;
    product_ID: number;
    criticality?: number;
}

interface Product { ID: number; name: string; category: string; unitPrice: number; }
interface Store   { ID: number; name: string; location: string; }

/**
 * CSV/Excel dışa aktarma yardımcısı.
 * Harici kütüphane gerektirmez; tarayıcının download API'sini kullanır.
 */

function escapeCsv(value: unknown): string {
    const str = value === null || value === undefined ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function buildCsvRow(cells: unknown[]): string {
    return cells.map(escapeCsv).join(",");
}

function downloadCsv(content: string, filename: string): void {
    // UTF-8 BOM ekle — Excel Türkçe karakterleri doğru açar
    const bom = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─── Kritik Stok Export ───────────────────────────────────────────────────────

export async function exportCriticalStocks(model: ODataModel): Promise<void> {
    try {
        const [stockCtxs, productCtxs, storeCtxs] = await Promise.all([
            model.bindList("/StockLevels").requestContexts(0, 500),
            model.bindList("/Products").requestContexts(0, 200),
            model.bindList("/Stores").requestContexts(0, 100)
        ]);

        const stocks:   StockLevel[] = stockCtxs.map(c => c.getObject() as StockLevel);
        const products: Product[]    = productCtxs.map(c => c.getObject() as Product);
        const stores:   Store[]      = storeCtxs.map(c => c.getObject() as Store);

        const productMap = Object.fromEntries(products.map(p => [p.ID, p]));
        const storeMap   = Object.fromEntries(stores.map(s => [s.ID, s]));

        const critical = stocks.filter(s => s.quantity <= s.criticalThreshold);

        if (critical.length === 0) {
            MessageBox.information("Şu an kritik durumda ürün bulunmuyor.");
            return;
        }

        const header = buildCsvRow([
            "Kayıt No", "Ürün Adı", "Kategori", "Mağaza", "Konum",
            "Mevcut Stok", "Kritik Eşik", "Eksik Miktar", "Birim Fiyat (₺)", "Toplam Değer (₺)"
        ]);

        const rows = critical.map(s => {
            const product = productMap[s.product_ID];
            const store   = storeMap[s.store_ID];
            const missing = Math.max(0, s.criticalThreshold - s.quantity);
            const unitPrice = product?.unitPrice ?? 0;
            return buildCsvRow([
                s.ID,
                product?.name     ?? "?",
                product?.category ?? "?",
                store?.name       ?? "?",
                store?.location   ?? "?",
                s.quantity,
                s.criticalThreshold,
                missing,
                unitPrice,
                (missing * unitPrice).toFixed(2)
            ]);
        });

        const csv      = [header, ...rows].join("\n");
        const date     = new Date().toISOString().slice(0, 10);
        const filename = `kritik-stoklar-${date}.csv`;
        downloadCsv(csv, filename);

        MessageToast.show(`${critical.length} kritik ürün dışa aktarıldı: ${filename}`);
    } catch (error) {
        console.error("Export hatası:", error);
        MessageBox.error("Dışa aktarma sırasında hata oluştu.");
    }
}

// ─── Tüm Stok Export ─────────────────────────────────────────────────────────

export async function exportAllStocks(model: ODataModel): Promise<void> {
    try {
        const [stockCtxs, productCtxs, storeCtxs] = await Promise.all([
            model.bindList("/StockLevels").requestContexts(0, 500),
            model.bindList("/Products").requestContexts(0, 200),
            model.bindList("/Stores").requestContexts(0, 100)
        ]);

        const stocks:   StockLevel[] = stockCtxs.map(c => c.getObject() as StockLevel);
        const products: Product[]    = productCtxs.map(c => c.getObject() as Product);
        const stores:   Store[]      = storeCtxs.map(c => c.getObject() as Store);

        const productMap = Object.fromEntries(products.map(p => [p.ID, p]));
        const storeMap   = Object.fromEntries(stores.map(s => [s.ID, s]));

        const header = buildCsvRow([
            "Kayıt No", "Ürün Adı", "Kategori", "Mağaza", "Konum",
            "Mevcut Stok", "Kritik Eşik", "Durum", "Birim Fiyat (₺)", "Stok Değeri (₺)"
        ]);

        const rows = stocks.map(s => {
            const product  = productMap[s.product_ID];
            const store    = storeMap[s.store_ID];
            const unitPrice = product?.unitPrice ?? 0;
            const status   = s.quantity <= s.criticalThreshold ? "KRİTİK"
                           : s.quantity <= s.criticalThreshold * 1.5 ? "UYARI" : "NORMAL";
            return buildCsvRow([
                s.ID,
                product?.name     ?? "?",
                product?.category ?? "?",
                store?.name       ?? "?",
                store?.location   ?? "?",
                s.quantity,
                s.criticalThreshold,
                status,
                unitPrice,
                (s.quantity * unitPrice).toFixed(2)
            ]);
        });

        const csv      = [header, ...rows].join("\n");
        const date     = new Date().toISOString().slice(0, 10);
        const filename = `stok-raporu-${date}.csv`;
        downloadCsv(csv, filename);

        MessageToast.show(`${stocks.length} kayıt dışa aktarıldı: ${filename}`);
    } catch (error) {
        console.error("Export hatası:", error);
        MessageBox.error("Dışa aktarma sırasında hata oluştu.");
    }
}

// ─── Sipariş Export ───────────────────────────────────────────────────────────

export async function exportOrders(model: ODataModel): Promise<void> {
    try {
        const [orderCtxs, productCtxs, storeCtxs, supplierCtxs] = await Promise.all([
            model.bindList("/PurchaseOrders").requestContexts(0, 500),
            model.bindList("/Products").requestContexts(0, 200),
            model.bindList("/Stores").requestContexts(0, 100),
            model.bindList("/Suppliers").requestContexts(0, 100)
        ]);

        const orders    = orderCtxs.map(c => c.getObject() as any);
        const productMap = Object.fromEntries(productCtxs.map(c => { const p = c.getObject() as Product; return [p.ID, p]; }));
        const storeMap   = Object.fromEntries(storeCtxs.map(c => { const s = c.getObject() as Store; return [s.ID, s]; }));
        const supplierMap = Object.fromEntries(supplierCtxs.map(c => { const s = c.getObject() as any; return [s.ID, s]; }));

        const header = buildCsvRow([
            "Sipariş No", "Ürün", "Mağaza", "Tedarikçi",
            "Miktar", "Durum", "Sipariş Tarihi", "Teslim Tarihi"
        ]);

        const rows = orders.map((o: any) => buildCsvRow([
            o.ID,
            productMap[o.product_ID]?.name  ?? "?",
            storeMap[o.store_ID]?.name      ?? "?",
            supplierMap[o.supplier_ID]?.name ?? "?",
            o.orderQuantity,
            o.status,
            o.createdAt  ? new Date(o.createdAt).toLocaleDateString("tr-TR")  : "",
            o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString("tr-TR") : ""
        ]));

        const csv      = [header, ...rows].join("\n");
        const date     = new Date().toISOString().slice(0, 10);
        const filename = `siparisler-${date}.csv`;
        downloadCsv(csv, filename);

        MessageToast.show(`${orders.length} sipariş dışa aktarıldı: ${filename}`);
    } catch (error) {
        console.error("Export hatası:", error);
        MessageBox.error("Dışa aktarma sırasında hata oluştu.");
    }
}
