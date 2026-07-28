package customer.supplychaincopilot.service;

import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * AI Core'a gönderilecek prompt metinlerini oluşturan servis.
 * Tüm sistem talimatları ve veri formatlaması burada merkezi olarak yönetilir.
 */
@Service
public class PromptBuilder {

    private final StockDataRepository repo;

    public PromptBuilder(StockDataRepository repo) {
        this.repo = repo;
    }

    /**
     * Genel stok analizi için prompt.
     */
    public String buildAnalysisPrompt(StockDataRepository.StockData data) {
        StringBuilder sb = new StringBuilder();
        sb.append("Sen bir tedarik zinciri uzmanı yapay zeka asistanısın.\n");
        sb.append("Aşağıdaki stok verilerini analiz et ve Türkçe, kısa, net öneriler sun.\n\n");
        sb.append("MEVCUT STOK DURUMU:\n");

        for (Map<String, Object> stock : data.stockLevels()) {
            String store   = data.storeNames().getOrDefault(stock.get("store_ID"), "Bilinmiyor");
            String product = data.productNames().getOrDefault(stock.get("product_ID"), "Bilinmiyor");
            int qty       = repo.toInt(stock.get("quantity"));
            int threshold = repo.toInt(stock.get("criticalThreshold"));

            sb.append(String.format("- %s @ %s: Stok=%d, Kritik Eşik=%d%s\n",
                product, store, qty, threshold, qty <= threshold ? " *** KRİTİK ***" : ""));
        }

        sb.append("\nLütfen şunları belirt:\n");
        sb.append("1. Kritik stok durumları\n");
        sb.append("2. Acil sipariş önerileri\n");
        sb.append("3. Fazla/ölü stoklar ve bağlanan para\n");
        return sb.toString();
    }

    /**
     * Talep tahmini için prompt.
     */
    public String buildForecastPrompt(
            String product, String store, int quantity, int threshold,
            List<Map<String, Object>> movements,
            StockDataRepository.Forecast forecast,
            String transferSuggestion) {

        StringBuilder sb = new StringBuilder();
        sb.append("Sen bir tedarik zinciri talep tahmin uzmanısın. Türkçe, kısa ve net cevap ver.\n\n");
        sb.append(String.format("ÜRÜN: %s (Mağaza: %s)\n", product, store));
        sb.append(String.format("Mevcut stok: %d adet, Kritik eşik: %d adet\n\n", quantity, threshold));
        sb.append("SON HAREKETLER:\n");

        for (Map<String, Object> m : movements) {
            sb.append(String.format("- %s: %+d (%s)\n",
                m.get("changedAt"), repo.toInt(m.get("changeAmount")), m.get("reason")));
        }

        sb.append(String.format("\nHesaplanan: %d günde %d adet satış, günlük ort. %.2f adet\n",
            forecast.periodDays(), forecast.totalSold(), forecast.avgDailyConsumption()));

        if (transferSuggestion != null) {
            sb.append("Transfer alternatifi: ").append(transferSuggestion).append("\n");
        }

        sb.append("\nLütfen şunları belirt:\n");
        sb.append("1. Tahmini tükenme süresi (gün)\n");
        sb.append("2. Kritik eşiğe ne zaman düşer\n");
        sb.append("3. Sipariş mi transfer mi daha mantıklı, hangi miktar\n");
        return sb.toString();
    }

    /**
     * Doğal dil soru-cevap (Copilot) için prompt.
     */
    public String buildCopilotPrompt(String question, StockDataRepository.StockData data) {
        StringBuilder sb = new StringBuilder();
        sb.append("Sen 'Supply Chain Copilot' adında bir tedarik zinciri asistanısın. ");
        sb.append("Aşağıdaki verilere dayanarak kullanıcının sorusunu Türkçe, kısa ve net cevapla.\n\n");

        sb.append("STOK DURUMU:\n");
        for (Map<String, Object> s : data.stockLevels()) {
            sb.append(String.format("- Kayıt %s: %s @ %s, %d adet (eşik %d)\n",
                s.get("ID"),
                data.productNames().getOrDefault(s.get("product_ID"), "?"),
                data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                repo.toInt(s.get("quantity")), repo.toInt(s.get("criticalThreshold"))));
        }

        sb.append("\nSON HAREKETLER:\n");
        for (Map<String, Object> m : repo.findAllMovements()) {
            sb.append(String.format("- Kayıt %s: %+d, %s (%s)\n",
                m.get("stockLevel_ID"), repo.toInt(m.get("changeAmount")),
                m.get("changedAt"), m.get("reason")));
        }

        sb.append("\nSİPARİŞLER:\n");
        for (Map<String, Object> o : repo.findAllOrders()) {
            sb.append(String.format("- %s: %d adet, durum %s\n",
                data.productNames().getOrDefault(o.get("product_ID"), "?"),
                repo.toInt(o.get("orderQuantity")), o.get("status")));
        }

        sb.append("\nKULLANICI SORUSU: ").append(question).append("\n");
        return sb.toString();
    }
}
