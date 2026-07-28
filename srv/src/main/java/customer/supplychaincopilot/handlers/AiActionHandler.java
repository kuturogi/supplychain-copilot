package customer.supplychaincopilot.handlers;

import com.sap.cds.ql.Insert;
import com.sap.cds.ql.Select;
import com.sap.cds.services.EventContext;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.On;
import com.sap.cds.services.handler.annotations.ServiceName;
import com.sap.cds.services.persistence.PersistenceService;
import customer.supplychaincopilot.service.AiCoreClient;
import customer.supplychaincopilot.service.DemoReportBuilder;
import customer.supplychaincopilot.service.PromptBuilder;
import customer.supplychaincopilot.service.StockDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * AI destekli aksiyonları yöneten handler.
 * AI Core yapılandırılmışsa LLM'e; yoksa demo raporlara devreder.
 * Sipariş oluşturma ve tedarikçi karnesi de bu sınıfta yer alır.
 */
@Component
@ServiceName("SupplyChainService")
public class AiActionHandler implements EventHandler {

    @Autowired private PersistenceService     db;
    @Autowired private StockDataRepository    repo;
    @Autowired private AiCoreClient           aiCore;
    @Autowired private PromptBuilder          promptBuilder;
    @Autowired private DemoReportBuilder      demoBuilder;

    // ─── Stok Analizi ────────────────────────────────────────────────────────────

    @On(event = "analyzeStockWithAI")
    public String analyzeStockWithAI() {
        System.out.println("analyzeStockWithAI çağrıldı");
        StockDataRepository.StockData data = repo.loadStockData();
        String result;

        if (aiCore.isConfigured()) {
            try {
                result = aiCore.chat(promptBuilder.buildAnalysisPrompt(data));
            } catch (Exception e) {
                System.err.println("AI Core hatası: " + e.getMessage());
                return "SAP AI Core bağlantısında hata: " + e.getMessage();
            }
        } else {
            result = demoBuilder.buildAnalysisReport(data);
        }

        int criticalCount = (int) data.stockLevels().stream()
            .filter(s -> repo.toInt(s.get("quantity")) <= repo.toInt(s.get("criticalThreshold")))
            .count();
        saveAnalysisLog("StokAnaliz", null, result, criticalCount);
        return result;
    }

    // ─── Talep Tahmini ───────────────────────────────────────────────────────────

    @On(event = "forecastDemand")
    public String forecastDemand(EventContext context) {
        Object stockLevelId = context.get("stockLevelId");
        if (stockLevelId == null) return "Hata: stockLevelId parametresi eksik.";

        var stockOpt = db.run(Select.from("my.supplychain.StockLevel").byId(stockLevelId)).first();
        if (stockOpt.isEmpty()) return "Hata: " + stockLevelId + " numaralı stok kaydı bulunamadı.";

        Map<String, Object> stock     = stockOpt.get();
        StockDataRepository.StockData names = repo.loadStockData();
        String product      = names.productNames().getOrDefault(stock.get("product_ID"), "Bilinmiyor");
        String store        = names.storeNames().getOrDefault(stock.get("store_ID"), "Bilinmiyor");
        int quantity        = repo.toInt(stock.get("quantity"));
        int threshold       = repo.toInt(stock.get("criticalThreshold"));

        List<Map<String, Object>> movements = repo.findMovementsByStockLevel(stockLevelId);
        StockDataRepository.Forecast forecast = repo.computeForecast(quantity, movements);
        String transfer = repo.findTransferSuggestion(stock.get("product_ID"), stock.get("store_ID"), names);

        if (aiCore.isConfigured()) {
            try {
                return aiCore.chat(promptBuilder.buildForecastPrompt(
                    product, store, quantity, threshold, movements, forecast, transfer));
            } catch (Exception e) {
                return "SAP AI Core bağlantısında hata: " + e.getMessage();
            }
        }
        return demoBuilder.buildForecastReport(product, store, quantity, threshold, forecast, transfer);
    }

    // ─── Copilot Soru-Cevap ──────────────────────────────────────────────────────

    @On(event = "askCopilot")
    public String askCopilot(EventContext context) {
        Object questionRaw = context.get("question");
        String question = questionRaw == null ? "" : questionRaw.toString().trim();
        if (question.isEmpty()) return "Lütfen bir soru yazın. Örnek: \"Hangi ürünler kritik durumda?\"";

        StockDataRepository.StockData data = repo.loadStockData();
        String result;

        if (aiCore.isConfigured()) {
            try {
                result = aiCore.chat(promptBuilder.buildCopilotPrompt(question, data));
            } catch (Exception e) {
                return "SAP AI Core bağlantısında hata: " + e.getMessage();
            }
        } else {
            result = demoBuilder.answerWithRules(question, data);
        }

        saveAnalysisLog("Copilot", question, result, -1);
        return result;
    }

    // ─── Tedarikçi Karnesi ───────────────────────────────────────────────────────

    @On(event = "supplierScorecard")
    public String supplierScorecard() {
        return demoBuilder.buildScorecardReport();
    }

    // ─── Sipariş Oluşturma ───────────────────────────────────────────────────────

    @On(event = "createPurchaseOrder")
    public String createPurchaseOrder(EventContext context) {
        Object stockLevelId  = context.get("stockLevelId");
        Object quantityParam = context.get("quantity");
        if (stockLevelId == null) return "Hata: stockLevelId parametresi eksik.";

        var stockOpt = db.run(Select.from("my.supplychain.StockLevel").byId(stockLevelId)).first();
        if (stockOpt.isEmpty()) return "Hata: Stok kaydı bulunamadı.";

        Map<String, Object> stock     = stockOpt.get();
        Object productId = stock.get("product_ID");
        Object storeId   = stock.get("store_ID");

        var productOpt = db.run(Select.from("my.supplychain.Product").byId(productId)).first();
        if (productOpt.isEmpty()) return "Hata: Ürün bulunamadı.";

        Map<String, Object> productRow = productOpt.get();
        Object supplierId = productRow.get("supplier_ID");
        if (supplierId == null)
            return "Hata: '" + productRow.get("name") + "' ürünü için tanımlı tedarikçi yok.";

        var supplierOpt = db.run(Select.from("my.supplychain.Supplier").byId(supplierId)).first();
        if (supplierOpt.isEmpty()) return "Hata: Tedarikçi kaydı bulunamadı.";

        Map<String, Object> supplier = supplierOpt.get();
        String redirectNote = redirectToReliableSupplier(supplier);
        if (redirectNote != null) {
            Map<String, Object> best = findBestSupplierInCategory(supplier);
            supplier    = best;
            supplierId  = best.get("ID");
        }

        int quantity = resolveOrderQuantity(quantityParam, stockLevelId, stock);
        String quantitySource = repo.toInt(quantityParam) > 0
            ? "kullanıcı tarafından belirtildi" : "AI önerisi (30 günlük tüketim)";

        String orderId = insertOrder(productId, storeId, supplierId, quantity, stockLevelId, quantitySource);

        return buildOrderConfirmation(orderId, productId, storeId, supplier, quantity,
            quantitySource, supplierId, redirectNote);
    }

    // ─── Sipariş yardımcıları ────────────────────────────────────────────────────

    private String redirectToReliableSupplier(Map<String, Object> defaultSupplier) {
        Object category = defaultSupplier.get("category");
        if (category == null) return null;
        Map<String, Object> best = findBestSupplierInCategory(defaultSupplier);
        if (Objects.equals(best.get("ID"), defaultSupplier.get("ID"))) return null;

        return String.format(
            "GÜVENİLİRLİK YÖNLENDİRMESİ: Varsayılan tedarikçi %s ortalama %.1f gün gecikti. " +
            "Sipariş, fiili ortalaması %.1f gün olan %s tedarikçisine yönlendirildi.",
            defaultSupplier.get("name"),
            repo.effectiveLeadDays(defaultSupplier) - repo.toInt(defaultSupplier.get("leadTimeDays")),
            repo.effectiveLeadDays(best),
            best.get("name"));
    }

    private Map<String, Object> findBestSupplierInCategory(Map<String, Object> supplier) {
        Object category = supplier.get("category");
        Map<String, Object> best = supplier;
        double bestDays = repo.effectiveLeadDays(supplier);
        for (Map<String, Object> candidate : repo.findAllSuppliers()) {
            if (!Objects.equals(candidate.get("category"), category)) continue;
            double days = repo.effectiveLeadDays(candidate);
            if (days < bestDays) { best = candidate; bestDays = days; }
        }
        return best;
    }

    private int resolveOrderQuantity(Object quantityParam, Object stockLevelId, Map<String, Object> stock) {
        int quantity = repo.toInt(quantityParam);
        if (quantity > 0) return quantity;
        StockDataRepository.Forecast f = repo.computeForecast(
            repo.toInt(stock.get("quantity")), repo.findMovementsByStockLevel(stockLevelId));
        return f.avgDailyConsumption() > 0
            ? (int) Math.ceil(f.avgDailyConsumption() * 30)
            : Math.max(1, repo.toInt(stock.get("criticalThreshold")) * 2);
    }

    private String insertOrder(Object productId, Object storeId, Object supplierId,
                               int quantity, Object stockLevelId, String quantitySource) {
        String orderId = UUID.randomUUID().toString();
        Map<String, Object> order = new HashMap<>();
        order.put("ID", orderId);
        order.put("product_ID", productId);
        order.put("store_ID", storeId);
        order.put("supplier_ID", supplierId);
        order.put("orderQuantity", quantity);
        order.put("status", "Taslak");
        order.put("createdAt", java.time.Instant.now());
        order.put("note", "Stok kaydı " + stockLevelId + " için oluşturuldu — miktar: " + quantitySource);
        db.run(Insert.into("my.supplychain.PurchaseOrder").entry(order));
        return orderId;
    }

    private String buildOrderConfirmation(String orderId, Object productId, Object storeId,
                                          Map<String, Object> supplier, int quantity,
                                          String quantitySource, Object supplierId,
                                          String redirectNote) {
        StockDataRepository.StockData names = repo.loadStockData();
        String productName = names.productNames().getOrDefault(productId, "Bilinmiyor");
        String storeName   = names.storeNames().getOrDefault(storeId, "Bilinmiyor");
        int promised       = repo.toInt(supplier.get("leadTimeDays"));
        StockDataRepository.SupplierPerf perf = repo.computeSupplierPerformance(supplierId);
        String deliveryText = perf.deliveredCount() > 0
            ? String.format("%.1f gün (gerçekleşen ortalama; söz verilen: %d gün)", perf.avgActualDays(), promised)
            : String.format("%d gün (söz verilen)", promised);

        String response = String.format(
            "SİPARİŞ TASLAĞI OLUŞTURULDU\n===========================\n\n" +
            "Ürün: %s\nMağaza: %s\nTedarikçi: %s (%s)\n" +
            "Miktar: %d adet (%s)\nTahmini teslimat: %s\nDurum: Taslak\n\nSipariş No: %s",
            productName, storeName,
            supplier.get("name"), supplier.get("contactEmail"),
            quantity, quantitySource, deliveryText, orderId);

        return redirectNote != null ? response + "\n\n" + redirectNote : response;
    }

    // ─── Analiz Kaydı ────────────────────────────────────────────────────────────

    private void saveAnalysisLog(String type, String question, String result, int criticalCount) {
        try {
            Map<String, Object> log = new HashMap<>();
            log.put("ID", UUID.randomUUID().toString());
            log.put("analysisType", type);
            log.put("question", question);
            log.put("result", result);
            log.put("createdAt", java.time.Instant.now());
            log.put("criticalCount", criticalCount >= 0 ? criticalCount : null);
            db.run(Insert.into("my.supplychain.AnalysisLog").entry(log));
        } catch (Exception e) {
            System.err.println("Analiz kaydı hatası: " + e.getMessage());
        }
    }
}
