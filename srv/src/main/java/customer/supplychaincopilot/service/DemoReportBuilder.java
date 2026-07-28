package customer.supplychaincopilot.service;

import org.springframework.stereotype.Service;

import java.util.*;

/**
 * AI Core yapılandırılmadığında gösterilen demo (kural tabanlı) raporları üretir.
 * Gerçek AI bağlantısı sağlandığında bu sınıf devre dışı kalır.
 */
@Service
public class DemoReportBuilder {

    private final StockDataRepository repo;

    public DemoReportBuilder(StockDataRepository repo) {
        this.repo = repo;
    }

    /**
     * Tüm stok kayıtlarını analiz ederek kritik/normal/ölü stok raporunu üretir.
     */
    public String buildAnalysisReport(StockDataRepository.StockData data) {
        List<String> critical  = new ArrayList<>();
        List<String> ok        = new ArrayList<>();
        List<String> deadStock = new ArrayList<>();

        for (Map<String, Object> stock : data.stockLevels()) {
            String store   = data.storeNames().getOrDefault(stock.get("store_ID"), "Bilinmiyor");
            String product = data.productNames().getOrDefault(stock.get("product_ID"), "Bilinmiyor");
            int qty        = repo.toInt(stock.get("quantity"));
            int threshold  = repo.toInt(stock.get("criticalThreshold"));

            if (qty <= threshold) {
                String line = String.format("%s @ %s: %d adet kaldı (eşik: %d)", product, store, qty, threshold);
                String transfer = repo.findTransferSuggestion(stock.get("product_ID"), stock.get("store_ID"), data);
                if (transfer != null) line += "\n    Transfer alternatifi: " + transfer;
                critical.add(line);
            } else {
                ok.add(String.format("%s @ %s: %d adet (eşik: %d)", product, store, qty, threshold));
            }

            StockDataRepository.Forecast f = repo.computeForecast(qty,
                repo.findMovementsByStockLevel(stock.get("ID")));
            if (f.avgDailyConsumption() > 0 && f.daysUntilDepletion() > 45) {
                double tiedUp = qty * data.productPrices().getOrDefault(stock.get("product_ID"), 0.0);
                deadStock.add(String.format("%s @ %s: %d adet, ~%d günlük stok — %,.0f ₺ rafta bekliyor",
                    product, store, qty, Math.round(f.daysUntilDepletion()), tiedUp));
            }
        }

        StringBuilder sb = new StringBuilder("STOK ANALİZ RAPORU\n==================\n\n");

        if (!critical.isEmpty()) {
            sb.append("KRİTİK DURUMLAR:\n");
            critical.forEach(item -> sb.append("  - ").append(item).append("\n"));
            sb.append("\nÖNERİLER:\n");
            sb.append("  - Kritik ürünler için acil sipariş veya transfer başlatın\n");
            sb.append("  - Tedarikçilerle iletişime geçin\n");
        } else {
            sb.append("Tüm stoklar normal seviyede.\n");
        }

        if (!deadStock.isEmpty()) {
            sb.append("\nFAZLA / ÖLÜ STOK UYARISI:\n");
            deadStock.forEach(item -> sb.append("  - ").append(item).append("\n"));
            sb.append("  Öneri: Yeni sipariş vermeyin; kampanya veya mağazalar arası dengeleme değerlendirin.\n");
        }

        if (!ok.isEmpty()) {
            sb.append("\nNORMAL STOKLAR:\n");
            ok.forEach(item -> sb.append("  - ").append(item).append("\n"));
        }

        sb.append("\n[Demo mod aktif — gerçek AI analizi için BTP'de AI Core yapılandırın]");
        return sb.toString();
    }

    /**
     * Tek bir stok kaydı için talep tahmini raporu üretir.
     */
    public String buildForecastReport(
            String product, String store, int quantity, int threshold,
            StockDataRepository.Forecast f, String transferSuggestion) {

        StringBuilder sb = new StringBuilder("TALEP TAHMİNİ RAPORU\n====================\n\n");
        sb.append(String.format("Ürün: %s\n", product));
        sb.append(String.format("Mağaza: %s\n", store));
        sb.append(String.format("Mevcut stok: %d adet (kritik eşik: %d)\n\n", quantity, threshold));

        if (f.avgDailyConsumption() <= 0) {
            sb.append("Bu ürün için tüketim geçmişi bulunamadı; tahmin yapılamıyor.\n");
            return sb.toString();
        }

        sb.append(String.format("Son %d günde %d adet satıldı (günlük ort. %.2f adet).\n\n",
            f.periodDays(), f.totalSold(), f.avgDailyConsumption()));

        long daysLeft = Math.round(f.daysUntilDepletion());
        long daysToThreshold = Math.round((quantity - threshold) / f.avgDailyConsumption());

        sb.append("TAHMİN:\n");
        sb.append(String.format("  - Stok tamamen tükenir: ~%d gün içinde\n", daysLeft));
        if (quantity > threshold) {
            sb.append(String.format("  - Kritik eşiğe düşer: ~%d gün içinde\n", Math.max(0, daysToThreshold)));
        } else {
            sb.append("  - DİKKAT: Stok zaten kritik eşiğin altında!\n");
        }

        sb.append("\nÖNERİ:\n");
        if (daysLeft <= 7 || quantity <= threshold) {
            int suggested = (int) Math.ceil(f.avgDailyConsumption() * 30);
            sb.append(String.format("  - ACİL: En az %d adet sipariş verin (30 günlük tüketim)\n", suggested));
        } else if (daysToThreshold <= 14) {
            int suggested = (int) Math.ceil(f.avgDailyConsumption() * 21);
            sb.append(String.format("  - Önümüzdeki hafta içinde ~%d adet sipariş planlayın\n", suggested));
        } else {
            sb.append("  - Şu an sipariş gerekmiyor; stok yeterli seviyede\n");
        }

        if (transferSuggestion != null) {
            sb.append("\nTRANSFER ALTERNATİFİ:\n");
            sb.append("  - ").append(transferSuggestion).append("\n");
            sb.append("  - Transfer, sipariş maliyetinden ve teslimat süresinden tasarruf sağlar.\n");
        }

        sb.append("\n[Demo mod aktif — gerçek AI tahmini için BTP'de AI Core yapılandırın]");
        return sb.toString();
    }

    /**
     * Doğal dil sorusunu anahtar kelime tabanlı kurallarla yanıtlar.
     */
    public String answerWithRules(String question, StockDataRepository.StockData data) {
        String q = question.toLowerCase(new Locale("tr", "TR"));
        StringBuilder sb = new StringBuilder();

        if (q.contains("kritik") || q.contains("biten") || q.contains("azalı") || q.contains("azalan")) {
            appendCriticalItems(sb, q, data);
        } else if (q.contains("transfer")) {
            appendTransferSuggestions(sb, data);
        } else if (q.contains("tedarikçi") || q.contains("tedarikci") || q.contains("geciken")) {
            return buildScorecardReport();
        } else if (q.contains("satış") || q.contains("satil") || q.contains("sattık") || q.contains("satt")) {
            appendSalesInfo(sb, data);
        } else if (q.contains("sipariş") || q.contains("siparis")) {
            appendOrderInfo(sb, data);
        } else if (q.contains("değer") || q.contains("deger") || q.contains("para") || q.contains("tutar")) {
            appendStockValueByStore(sb, data);
        } else {
            appendStoreOrGeneralSummary(sb, q, data);
        }

        sb.append("\n[Demo mod — gerçek AI için BTP'de AI Core yapılandırın]");
        return sb.toString();
    }

    /**
     * Tedarikçi performans karnesi raporu.
     */
    public String buildScorecardReport() {
        StringBuilder sb = new StringBuilder("TEDARİKÇİ PERFORMANS KARNESİ\n============================\n\n");
        List<Map<String, Object>> suppliers = repo.findAllSuppliers();
        Map<String, List<Map<String, Object>>> byCategory = new HashMap<>();

        for (Map<String, Object> s : suppliers) {
            byCategory.computeIfAbsent(String.valueOf(s.get("category")), k -> new ArrayList<>()).add(s);
            int promised = repo.toInt(s.get("leadTimeDays"));
            StockDataRepository.SupplierPerf perf = repo.computeSupplierPerformance(s.get("ID"));

            sb.append(String.format("%s (%s)\n", s.get("name"), s.get("category")));
            sb.append(String.format("  Söz verilen teslimat: %d gün\n", promised));

            if (perf.deliveredCount() == 0) {
                sb.append("  Henüz teslim verisi yok.\n\n");
                continue;
            }

            double delay = perf.avgActualDays() - promised;
            String verdict = delay <= 0.5 ? "GÜVENİLİR ✓" : delay <= 2 ? "HAFİF GECİKMELİ" : "GECİKMELİ ✗";
            sb.append(String.format("  Gerçekleşen ortalama: %.1f gün (%d teslimat)\n",
                perf.avgActualDays(), perf.deliveredCount()));
            sb.append(String.format("  Sapma: %+.1f gün -> %s\n\n", delay, verdict));
        }

        sb.append("AI ÖNERİSİ:\n");
        boolean anySuggestion = false;
        for (Map.Entry<String, List<Map<String, Object>>> e : byCategory.entrySet()) {
            if (e.getValue().size() < 2) continue;
            Map<String, Object> best = e.getValue().stream()
                .min(Comparator.comparingDouble(repo::effectiveLeadDays)).orElse(null);
            if (best != null) {
                anySuggestion = true;
                sb.append(String.format("  - %s kategorisinde yeni siparişleri %s tedarikçisine yönlendirin (fiili ort. %.1f gün)\n",
                    e.getKey(), best.get("name"), repo.effectiveLeadDays(best)));
            }
        }
        if (!anySuggestion) {
            sb.append("  - Tüm kategorilerde tek tedarikçi var; kıyaslama yapılamıyor.\n");
        }

        sb.append("\n[Demo mod — gerçek AI yorumu için BTP'de AI Core yapılandırın]");
        return sb.toString();
    }

    // ─── Kural cevaplayıcı yardımcıları ─────────────────────────────────────────

    private void appendCriticalItems(StringBuilder sb, String q, StockDataRepository.StockData data) {
        sb.append("KRİTİK DURUMDA OLAN ÜRÜNLER:\n\n");
        boolean found = false;
        for (Map<String, Object> s : data.stockLevels()) {
            int qty = repo.toInt(s.get("quantity"));
            int threshold = repo.toInt(s.get("criticalThreshold"));
            if (qty <= threshold) {
                found = true;
                sb.append(String.format("- %s @ %s: %d adet kaldı (eşik: %d)\n",
                    data.productNames().getOrDefault(s.get("product_ID"), "?"),
                    data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                    qty, threshold));
                String transfer = repo.findTransferSuggestion(s.get("product_ID"), s.get("store_ID"), data);
                if (transfer != null) sb.append("  Transfer alternatifi: ").append(transfer).append("\n");
            }
        }
        if (!found) sb.append("Şu an kritik seviyede ürün yok.\n");
    }

    private void appendTransferSuggestions(StringBuilder sb, StockDataRepository.StockData data) {
        sb.append("TRANSFER ÖNERİLERİ:\n\n");
        boolean found = false;
        for (Map<String, Object> s : data.stockLevels()) {
            if (repo.toInt(s.get("quantity")) <= repo.toInt(s.get("criticalThreshold"))) {
                String transfer = repo.findTransferSuggestion(s.get("product_ID"), s.get("store_ID"), data);
                if (transfer != null) {
                    found = true;
                    sb.append(String.format("- %s (%s) için: %s\n",
                        data.productNames().getOrDefault(s.get("product_ID"), "?"),
                        data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                        transfer));
                }
            }
        }
        if (!found) sb.append("Şu an transferle çözülebilecek bir eksik yok.\n");
    }

    private void appendSalesInfo(StringBuilder sb, StockDataRepository.StockData data) {
        sb.append("SON DÖNEM SATIŞLARI (hareket geçmişinden):\n\n");
        Map<Object, Integer> soldByStock = new HashMap<>();
        for (Map<String, Object> m : repo.findAllMovements()) {
            int change = repo.toInt(m.get("changeAmount"));
            if (change < 0) soldByStock.merge(m.get("stockLevel_ID"), -change, Integer::sum);
        }
        for (Map<String, Object> s : data.stockLevels()) {
            int sold = soldByStock.getOrDefault(s.get("ID"), 0);
            sb.append(String.format("- %s @ %s: %d adet satıldı\n",
                data.productNames().getOrDefault(s.get("product_ID"), "?"),
                data.storeNames().getOrDefault(s.get("store_ID"), "?"), sold));
        }
    }

    private void appendOrderInfo(StringBuilder sb, StockDataRepository.StockData data) {
        List<Map<String, Object>> orders = repo.findAllOrders();
        sb.append("SİPARİŞLER (").append(orders.size()).append(" adet):\n\n");
        if (orders.isEmpty()) {
            sb.append("Henüz sipariş yok.\n");
            return;
        }
        for (Map<String, Object> o : orders) {
            sb.append(String.format("- %s: %d adet, durum: %s\n",
                data.productNames().getOrDefault(o.get("product_ID"), "?"),
                repo.toInt(o.get("orderQuantity")), o.get("status")));
        }
    }

    private void appendStockValueByStore(StringBuilder sb, StockDataRepository.StockData data) {
        sb.append("MAĞAZA BAZLI STOK DEĞERİ:\n\n");
        Map<Object, Double> valueByStore = new HashMap<>();
        for (Map<String, Object> s : data.stockLevels()) {
            double unitPrice = data.productPrices().getOrDefault(s.get("product_ID"), 0.0);
            valueByStore.merge(s.get("store_ID"), repo.toInt(s.get("quantity")) * unitPrice, Double::sum);
        }
        valueByStore.forEach((storeId, value) ->
            sb.append(String.format("- %s: %,.0f ₺\n",
                data.storeNames().getOrDefault(storeId, "?"), value)));
    }

    private void appendStoreOrGeneralSummary(StringBuilder sb, String q, StockDataRepository.StockData data) {
        String matchedStore = null;
        Object matchedStoreId = null;
        for (Map.Entry<Object, String> e : data.storeNames().entrySet()) {
            String firstWord = e.getValue().split(" ")[0].toLowerCase(new Locale("tr", "TR"));
            if (q.contains(firstWord)) {
                matchedStore = e.getValue();
                matchedStoreId = e.getKey();
                break;
            }
        }

        if (matchedStore != null) {
            sb.append(matchedStore.toUpperCase(new Locale("tr", "TR"))).append(" STOK DURUMU:\n\n");
            final Object storeId = matchedStoreId;
            for (Map<String, Object> s : data.stockLevels()) {
                if (Objects.equals(s.get("store_ID"), storeId)) {
                    int qty = repo.toInt(s.get("quantity"));
                    int threshold = repo.toInt(s.get("criticalThreshold"));
                    sb.append(String.format("- %s: %d adet (eşik: %d)%s\n",
                        data.productNames().getOrDefault(s.get("product_ID"), "?"),
                        qty, threshold, qty <= threshold ? " *** KRİTİK ***" : ""));
                }
            }
        } else {
            sb.append("GENEL STOK ÖZETİ:\n\n");
            for (Map<String, Object> s : data.stockLevels()) {
                int qty = repo.toInt(s.get("quantity"));
                int threshold = repo.toInt(s.get("criticalThreshold"));
                sb.append(String.format("- %s @ %s: %d adet%s\n",
                    data.productNames().getOrDefault(s.get("product_ID"), "?"),
                    data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                    qty, qty <= threshold ? " *** KRİTİK ***" : ""));
            }
            sb.append("\nŞunları sorabilirsiniz: kritik ürünler, transfer önerisi, ");
            sb.append("satışlar, siparişler, stok değeri veya bir mağaza adı.\n");
        }
    }
}
