package customer.supplychaincopilot.handlers;

import com.sap.cds.ql.Insert;
import com.sap.cds.ql.Select;
import com.sap.cds.ql.cqn.CqnAnalyzer;
import com.sap.cds.services.EventContext;
import com.sap.cds.services.cds.CdsReadEventContext;
import com.sap.cds.services.cds.CdsUpdateEventContext;
import com.sap.cds.services.cds.CqnService;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.After;
import com.sap.cds.services.handler.annotations.Before;
import com.sap.cds.services.handler.annotations.On;
import com.sap.cds.services.handler.annotations.ServiceName;
import com.sap.cds.services.persistence.PersistenceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

@Component
@ServiceName("SupplyChainService")
public class SupplyChainHandler implements EventHandler {

    @Autowired
    private PersistenceService db;

    @Value("${aicore.token-url:}")
    private String tokenUrl;

    @Value("${aicore.client-id:}")
    private String clientId;

    @Value("${aicore.client-secret:}")
    private String clientSecret;

    @Value("${aicore.base-url:}")
    private String baseUrl;

    @Value("${aicore.deployment-id:}")
    private String deploymentId;

    @Value("${aicore.resource-group:default}")
    private String resourceGroup;

    private final RestTemplate restTemplate = new RestTemplate();

    // ─── Okuma Handler'ları ──────────────────────────────────────────────────────

    // Her okumada kritiklik durumunu hesaplar; UI bu değere göre satırı renklendirir.
    // 1 = Kırmızı (stok <= eşik), 2 = Turuncu (stok <= eşik * 1.5), 3 = Yeşil
    @After(event = CqnService.EVENT_READ, entity = "SupplyChainService.StockLevels")
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void afterReadStockLevels(CdsReadEventContext context) {
        // $select ile quantity/criticalThreshold istenmemiş olabilir; o durumda ID
        // üzerinden tabloyu bir kez okuyup eksik değerleri oradan tamamlarız.
        Map<Object, Map<String, Object>> lookup = new HashMap<>();

        context.getResult().forEach(row -> {
            Object qtyRaw = row.get("quantity");
            Object thresholdRaw = row.get("criticalThreshold");

            if (qtyRaw == null || thresholdRaw == null) {
                Object id = row.get("ID");
                if (id == null) {
                    return; // ne değerler ne de anahtar var; hesaplama yapılamaz
                }
                if (lookup.isEmpty()) {
                    List<Map<String, Object>> all = (List<Map<String, Object>>) (List<?>)
                        db.run(Select.from("my.supplychain.StockLevel")
                            .columns("ID", "quantity", "criticalThreshold"))
                        .listOf(Map.class);
                    all.forEach(r -> lookup.put(r.get("ID"), r));
                }
                Map<String, Object> full = lookup.get(id);
                if (full == null) {
                    return;
                }
                qtyRaw = full.get("quantity");
                thresholdRaw = full.get("criticalThreshold");
            }

            int qty = toInt(qtyRaw);
            int threshold = toInt(thresholdRaw);

            int criticality;
            if (qty <= threshold) {
                criticality = 1;
            } else if (qty <= threshold * 1.5) {
                criticality = 2;
            } else {
                criticality = 3;
            }
            row.put("criticality", criticality);
        });
    }

    // Dashboard satırları: kritik ürünü olan mağaza kırmızı, olmayan yeşil gösterilir
    @After(event = CqnService.EVENT_READ, entity = "SupplyChainService.StockSummaryByStore")
    public void afterReadStockSummary(CdsReadEventContext context) {
        context.getResult().forEach(row -> {
            int criticalCount = toInt(row.get("criticalCount"));
            row.put("summaryCriticality", criticalCount > 0 ? 1 : 3);
        });
    }

    // ─── Stok Güncelleme: Hareket Kaydı + Kritik Bildirimi ───────────────────────

    // Stok miktarı güncellendiğinde farkı StockMovement tablosuna otomatik kaydeder;
    // stok kritik eşiğin altına düşerse Notification oluşturur.
    @Before(event = CqnService.EVENT_UPDATE, entity = "SupplyChainService.StockLevels")
    public void logStockMovement(CdsUpdateEventContext context) {
        Map<String, Object> data = context.getCqn().data();
        if (!data.containsKey("quantity")) {
            return; // miktar değişmiyorsa hareket kaydı gerekmez
        }

        Object id = data.get("ID");
        if (id == null) {
            id = CqnAnalyzer.create(context.getModel())
                .analyze(context.getCqn().ref())
                .targetKeys().get("ID");
        }
        if (id == null) {
            return;
        }

        var current = db.run(
            Select.from("my.supplychain.StockLevel")
                .columns("quantity", "criticalThreshold", "store_ID", "product_ID")
                .byId(id)
        ).first();

        if (current.isEmpty()) {
            return;
        }

        int oldQty = toInt(current.get().get("quantity"));
        int newQty = toInt(data.get("quantity"));
        if (oldQty == newQty) {
            return;
        }

        Map<String, Object> movement = new HashMap<>();
        movement.put("ID", UUID.randomUUID().toString());
        movement.put("stockLevel_ID", id);
        movement.put("changeAmount", newQty - oldQty);
        movement.put("changedAt", java.time.Instant.now());
        movement.put("reason", newQty > oldQty ? "İkmal - stok güncellemesi" : "Satış / stok düşüşü");
        db.run(Insert.into("my.supplychain.StockMovement").entry(movement));

        System.out.println(String.format(
            "Java Backend: Stok hareketi kaydedildi (ID=%s, %d -> %d)", id, oldQty, newQty));

        // Kritik eşiğin ÜSTÜNDEN ALTINA geçişte bildirim üret (her düşüşte değil)
        int threshold = toInt(current.get().get("criticalThreshold"));
        if (newQty <= threshold && oldQty > threshold) {
            StockData names = readStockData();
            String product = names.productNames().getOrDefault(current.get().get("product_ID"), "Bilinmiyor");
            String store = names.storeNames().getOrDefault(current.get().get("store_ID"), "Bilinmiyor");
            createNotification(
                String.format("%s ürününün %s stoğu kritik seviyeye düştü (%d adet, eşik: %d)",
                    product, store, newQty, threshold),
                "Kritik"
            );
        }
    }

    private void createNotification(String message, String severity) {
        Map<String, Object> notification = new HashMap<>();
        notification.put("ID", UUID.randomUUID().toString());
        notification.put("message", message);
        notification.put("severity", severity);
        notification.put("createdAt", java.time.Instant.now());
        notification.put("isRead", false);
        db.run(Insert.into("my.supplychain.Notification").entry(notification));
        System.out.println("Java Backend: Bildirim oluşturuldu -> " + message);
    }

    // ─── AI Aksiyonları ──────────────────────────────────────────────────────────

    @On(event = "analyzeStockWithAI")
    public String analyzeStockWithAI() {
        System.out.println("Java Backend: analyzeStockWithAI Action çağrıldı!");

        StockData data = readStockData();
        String prompt = buildPrompt(data);

        if (isAiCoreConfigured()) {
            try {
                System.out.println("SAP AI Core (Joule altyapısı) çağrılıyor...");
                return callSapAiCore(prompt);
            } catch (Exception e) {
                System.err.println("SAP AI Core bağlantı hatası: " + e.getMessage());
                return "SAP AI Core bağlantısında hata: " + e.getMessage();
            }
        }

        System.out.println("SAP AI Core yapılandırılmamış — demo analiz döndürülüyor.");
        return buildDemoAnalysis(data);
    }

    @On(event = "forecastDemand")
    public String forecastDemand(EventContext context) {
        Object stockLevelId = context.get("stockLevelId");
        System.out.println("Java Backend: forecastDemand çağrıldı, stockLevelId=" + stockLevelId);

        if (stockLevelId == null) {
            return "Hata: stockLevelId parametresi eksik.";
        }

        var stockOpt = db.run(
            Select.from("my.supplychain.StockLevel").byId(stockLevelId)
        ).first();

        if (stockOpt.isEmpty()) {
            return "Hata: " + stockLevelId + " numaralı stok kaydı bulunamadı.";
        }

        Map<String, Object> stock = stockOpt.get();
        StockData names = readStockData();
        String product = names.productNames().getOrDefault(stock.get("product_ID"), "Bilinmiyor");
        String store = names.storeNames().getOrDefault(stock.get("store_ID"), "Bilinmiyor");
        int quantity = toInt(stock.get("quantity"));
        int threshold = toInt(stock.get("criticalThreshold"));

        List<Map<String, Object>> movements = readMovements(stockLevelId);
        Forecast forecast = computeForecast(quantity, movements);
        String transferSuggestion = findTransferSuggestion(
            stock.get("product_ID"), stock.get("store_ID"), names);

        if (isAiCoreConfigured()) {
            try {
                System.out.println("SAP AI Core ile talep tahmini yapılıyor...");
                return callSapAiCore(buildForecastPrompt(
                    product, store, quantity, threshold, movements, forecast, transferSuggestion));
            } catch (Exception e) {
                System.err.println("SAP AI Core bağlantı hatası: " + e.getMessage());
                return "SAP AI Core bağlantısında hata: " + e.getMessage();
            }
        }

        return buildDemoForecast(product, store, quantity, threshold, forecast, transferSuggestion);
    }

    @On(event = "createPurchaseOrder")
    public String createPurchaseOrder(EventContext context) {
        Object stockLevelId = context.get("stockLevelId");
        Object quantityParam = context.get("quantity");
        System.out.println("Java Backend: createPurchaseOrder çağrıldı, stockLevelId="
            + stockLevelId + ", quantity=" + quantityParam);

        if (stockLevelId == null) {
            return "Hata: stockLevelId parametresi eksik.";
        }

        var stockOpt = db.run(
            Select.from("my.supplychain.StockLevel").byId(stockLevelId)
        ).first();
        if (stockOpt.isEmpty()) {
            return "Hata: " + stockLevelId + " numaralı stok kaydı bulunamadı.";
        }

        Map<String, Object> stock = stockOpt.get();
        Object productId = stock.get("product_ID");
        Object storeId = stock.get("store_ID");

        var productOpt = db.run(
            Select.from("my.supplychain.Product").byId(productId)
        ).first();
        if (productOpt.isEmpty()) {
            return "Hata: Ürün bulunamadı.";
        }

        Map<String, Object> productRow = productOpt.get();
        Object supplierId = productRow.get("supplier_ID");
        if (supplierId == null) {
            return "Hata: '" + productRow.get("name") + "' ürünü için tanımlı tedarikçi yok.";
        }

        var supplierOpt = db.run(
            Select.from("my.supplychain.Supplier").byId(supplierId)
        ).first();
        if (supplierOpt.isEmpty()) {
            return "Hata: Tedarikçi kaydı bulunamadı.";
        }

        Map<String, Object> supplier = supplierOpt.get();

        // Güvenilirlik yönlendirmesi: aynı kategorideki tedarikçiler arasından
        // GERÇEK teslimat performansı en iyi olanı seç (söz verilen değil)
        String redirectNote = null;
        Object category = supplier.get("category");
        if (category != null) {
            Map<String, Object> best = supplier;
            double bestDays = effectiveLeadDays(supplier);
            for (Map<String, Object> candidate : readAllSuppliers()) {
                if (!Objects.equals(candidate.get("category"), category)) continue;
                double candidateDays = effectiveLeadDays(candidate);
                if (candidateDays < bestDays) {
                    best = candidate;
                    bestDays = candidateDays;
                }
            }
            if (!Objects.equals(best.get("ID"), supplier.get("ID"))) {
                redirectNote = String.format(
                    "GÜVENİLİRLİK YÖNLENDİRMESİ: Varsayılan tedarikçi %s son teslimatlarında " +
                    "ortalama %.1f gün gecikti (söz: %d gün). Sipariş, fiili ortalaması %.1f gün olan " +
                    "%s tedarikçisine yönlendirildi.",
                    supplier.get("name"),
                    effectiveLeadDays(supplier) - toInt(supplier.get("leadTimeDays")),
                    toInt(supplier.get("leadTimeDays")),
                    bestDays, best.get("name"));
                supplier = best;
                supplierId = best.get("ID");
            }
        }

        // Miktar verilmemişse tüketim hızından 30 günlük ihtiyaç hesaplanır
        int quantity = toInt(quantityParam);
        String quantitySource = "kullanıcı tarafından belirtildi";
        if (quantity <= 0) {
            Forecast f = computeForecast(toInt(stock.get("quantity")), readMovements(stockLevelId));
            quantity = f.avgDailyConsumption() > 0
                ? (int) Math.ceil(f.avgDailyConsumption() * 30)
                : Math.max(1, toInt(stock.get("criticalThreshold")) * 2);
            quantitySource = "AI önerisi (30 günlük tüketim)";
        }

        Map<String, Object> order = new HashMap<>();
        String orderId = UUID.randomUUID().toString();
        order.put("ID", orderId);
        order.put("product_ID", productId);
        order.put("store_ID", storeId);
        order.put("supplier_ID", supplierId);
        order.put("orderQuantity", quantity);
        order.put("status", "Taslak");
        order.put("createdAt", java.time.Instant.now());
        order.put("note", "Stok kaydı " + stockLevelId + " için oluşturuldu — miktar: " + quantitySource);
        db.run(Insert.into("my.supplychain.PurchaseOrder").entry(order));

        StockData names = readStockData();
        String productName = names.productNames().getOrDefault(productId, "Bilinmiyor");
        String storeName = names.storeNames().getOrDefault(storeId, "Bilinmiyor");
        int promised = toInt(supplier.get("leadTimeDays"));
        SupplierPerf perf = computeSupplierPerformance(supplierId);
        String deliveryText = perf.deliveredCount() > 0
            ? String.format("%.1f gün (gerçekleşen ortalama; söz verilen: %d gün)", perf.avgActualDays(), promised)
            : String.format("%d gün (söz verilen)", promised);

        String response = String.format(
            "SİPARİŞ TASLAĞI OLUŞTURULDU\n" +
            "===========================\n\n" +
            "Ürün: %s\n" +
            "Mağaza: %s\n" +
            "Tedarikçi: %s (%s)\n" +
            "Miktar: %d adet (%s)\n" +
            "Tahmini teslimat: %s\n" +
            "Durum: Taslak\n\n" +
            "Sipariş No: %s",
            productName, storeName,
            supplier.get("name"), supplier.get("contactEmail"),
            quantity, quantitySource,
            deliveryText, orderId
        );

        if (redirectNote != null) {
            response += "\n\n" + redirectNote;
        }
        return response;
    }

    // Doğal dilde soru-cevap. AI Core varsa tüm veri bağlamıyla LLM'e gider;
    // yoksa anahtar kelime tabanlı demo cevaplayıcı devreye girer.
    @On(event = "askCopilot")
    public String askCopilot(EventContext context) {
        Object questionRaw = context.get("question");
        String question = questionRaw == null ? "" : questionRaw.toString().trim();
        System.out.println("Java Backend: askCopilot çağrıldı -> " + question);

        if (question.isEmpty()) {
            return "Lütfen bir soru yazın. Örnek: \"Hangi ürünler kritik durumda?\"";
        }

        StockData data = readStockData();

        if (isAiCoreConfigured()) {
            try {
                return callSapAiCore(buildCopilotPrompt(question, data));
            } catch (Exception e) {
                System.err.println("SAP AI Core bağlantı hatası: " + e.getMessage());
                return "SAP AI Core bağlantısında hata: " + e.getMessage();
            }
        }

        return answerWithRules(question, data);
    }

    // ─── Copilot Demo Cevaplayıcı ────────────────────────────────────────────────

    private String answerWithRules(String question, StockData data) {
        String q = question.toLowerCase(new Locale("tr", "TR"));
        StringBuilder sb = new StringBuilder();

        // "azal" yerine "azalı/azalan": "mağazalarda" kelimesi "azal" içerdiği için yanlış eşleşiyordu
        if (q.contains("kritik") || q.contains("biten") || q.contains("azalı") || q.contains("azalan")) {
            sb.append("KRİTİK DURUMDA OLAN ÜRÜNLER:\n\n");
            boolean found = false;
            for (Map<String, Object> s : data.stockLevels()) {
                int qty = toInt(s.get("quantity"));
                int threshold = toInt(s.get("criticalThreshold"));
                if (qty <= threshold) {
                    found = true;
                    sb.append(String.format("- %s @ %s: %d adet kaldı (eşik: %d)\n",
                        data.productNames().getOrDefault(s.get("product_ID"), "?"),
                        data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                        qty, threshold));
                    String transfer = findTransferSuggestion(
                        s.get("product_ID"), s.get("store_ID"), data);
                    if (transfer != null) {
                        sb.append("  Transfer alternatifi: ").append(transfer).append("\n");
                    }
                }
            }
            if (!found) {
                sb.append("Şu an kritik seviyede ürün yok.\n");
            }
        } else if (q.contains("transfer")) {
            sb.append("TRANSFER ÖNERİLERİ:\n\n");
            boolean found = false;
            for (Map<String, Object> s : data.stockLevels()) {
                if (toInt(s.get("quantity")) <= toInt(s.get("criticalThreshold"))) {
                    String transfer = findTransferSuggestion(
                        s.get("product_ID"), s.get("store_ID"), data);
                    if (transfer != null) {
                        found = true;
                        sb.append(String.format("- %s (%s) için: %s\n",
                            data.productNames().getOrDefault(s.get("product_ID"), "?"),
                            data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                            transfer));
                    }
                }
            }
            if (!found) {
                sb.append("Şu an transferle çözülebilecek bir eksik yok.\n");
            }
        } else if (q.contains("tedarikçi") || q.contains("tedarikci") || q.contains("geciken")) {
            return buildScorecard();
        } else if (q.contains("satış") || q.contains("satil") || q.contains("sattık") || q.contains("satt")) {
            sb.append("SON DÖNEM SATIŞLARI (hareket geçmişinden):\n\n");
            Map<Object, Integer> soldByStock = new HashMap<>();
            for (Map<String, Object> m : readAllMovements()) {
                int change = toInt(m.get("changeAmount"));
                if (change < 0) {
                    soldByStock.merge(m.get("stockLevel_ID"), -change, Integer::sum);
                }
            }
            for (Map<String, Object> s : data.stockLevels()) {
                int sold = soldByStock.getOrDefault(s.get("ID"), 0);
                sb.append(String.format("- %s @ %s: %d adet satıldı\n",
                    data.productNames().getOrDefault(s.get("product_ID"), "?"),
                    data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                    sold));
            }
        } else if (q.contains("sipariş") || q.contains("siparis")) {
            List<Map<String, Object>> orders = readAllOrders();
            sb.append("SİPARİŞLER (").append(orders.size()).append(" adet):\n\n");
            if (orders.isEmpty()) {
                sb.append("Henüz sipariş yok.\n");
            }
            for (Map<String, Object> o : orders) {
                sb.append(String.format("- %s: %d adet, durum: %s\n",
                    data.productNames().getOrDefault(o.get("product_ID"), "?"),
                    toInt(o.get("orderQuantity")),
                    o.get("status")));
            }
        } else if (q.contains("değer") || q.contains("deger") || q.contains("para") || q.contains("tutar")) {
            sb.append("MAĞAZA BAZLI STOK DEĞERİ:\n\n");
            Map<Object, Double> valueByStore = new HashMap<>();
            for (Map<String, Object> s : data.stockLevels()) {
                double unitPrice = data.productPrices().getOrDefault(s.get("product_ID"), 0.0);
                valueByStore.merge(s.get("store_ID"),
                    toInt(s.get("quantity")) * unitPrice, Double::sum);
            }
            valueByStore.forEach((storeId, value) ->
                sb.append(String.format("- %s: %,.0f ₺\n",
                    data.storeNames().getOrDefault(storeId, "?"), value)));
        } else {
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
                for (Map<String, Object> s : data.stockLevels()) {
                    if (Objects.equals(s.get("store_ID"), matchedStoreId)) {
                        int qty = toInt(s.get("quantity"));
                        int threshold = toInt(s.get("criticalThreshold"));
                        sb.append(String.format("- %s: %d adet (eşik: %d)%s\n",
                            data.productNames().getOrDefault(s.get("product_ID"), "?"),
                            qty, threshold,
                            qty <= threshold ? " *** KRİTİK ***" : ""));
                    }
                }
            } else {
                sb.append("GENEL STOK ÖZETİ:\n\n");
                for (Map<String, Object> s : data.stockLevels()) {
                    int qty = toInt(s.get("quantity"));
                    int threshold = toInt(s.get("criticalThreshold"));
                    sb.append(String.format("- %s @ %s: %d adet%s\n",
                        data.productNames().getOrDefault(s.get("product_ID"), "?"),
                        data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                        qty,
                        qty <= threshold ? " *** KRİTİK ***" : ""));
                }
                sb.append("\nŞunları sorabilirsiniz: kritik ürünler, transfer önerisi, ");
                sb.append("satışlar, siparişler, stok değeri veya bir mağaza adı.\n");
            }
        }

        sb.append("\n[Demo mod — gerçek AI için BTP'de AI Core yapılandırın]");
        return sb.toString();
    }

    // ─── Tedarikçi Performans Karnesi ────────────────────────────────────────────

    @On(event = "supplierScorecard")
    public String supplierScorecard() {
        System.out.println("Java Backend: supplierScorecard çağrıldı!");
        return buildScorecard();
    }

    // Teslim edilmiş siparişlerden tedarikçinin gerçek ortalama teslimat süresini hesaplar
    private record SupplierPerf(int deliveredCount, double avgActualDays) {}

    private SupplierPerf computeSupplierPerformance(Object supplierId) {
        int count = 0;
        double totalDays = 0;
        for (Map<String, Object> o : readAllOrders()) {
            if (!Objects.equals(o.get("supplier_ID"), supplierId)) continue;
            java.time.Instant created = toInstant(o.get("createdAt"));
            java.time.Instant delivered = toInstant(o.get("deliveredAt"));
            if (created == null || delivered == null) continue;
            totalDays += java.time.Duration.between(created, delivered).toHours() / 24.0;
            count++;
        }
        return new SupplierPerf(count, count > 0 ? totalDays / count : -1);
    }

    // Karne için karar: tedarikçinin fiilen beklenmesi gereken süresi
    private double effectiveLeadDays(Map<String, Object> supplier) {
        SupplierPerf perf = computeSupplierPerformance(supplier.get("ID"));
        return perf.deliveredCount() > 0 ? perf.avgActualDays() : toInt(supplier.get("leadTimeDays"));
    }

    private String buildScorecard() {
        StringBuilder sb = new StringBuilder();
        sb.append("TEDARİKÇİ PERFORMANS KARNESİ\n");
        sb.append("============================\n\n");

        List<Map<String, Object>> suppliers = readAllSuppliers();
        Map<String, List<Map<String, Object>>> byCategory = new HashMap<>();

        for (Map<String, Object> s : suppliers) {
            byCategory.computeIfAbsent(String.valueOf(s.get("category")), k -> new ArrayList<>()).add(s);

            int promised = toInt(s.get("leadTimeDays"));
            SupplierPerf perf = computeSupplierPerformance(s.get("ID"));

            sb.append(String.format("%s (%s)\n", s.get("name"), s.get("category")));
            sb.append(String.format("  Söz verilen teslimat: %d gün\n", promised));

            if (perf.deliveredCount() == 0) {
                sb.append("  Henüz teslim verisi yok.\n\n");
                continue;
            }

            double delay = perf.avgActualDays() - promised;
            String verdict;
            if (delay <= 0.5) {
                verdict = "GÜVENİLİR ✓";
            } else if (delay <= 2) {
                verdict = "HAFİF GECİKMELİ";
            } else {
                verdict = "GECİKMELİ ✗";
            }

            sb.append(String.format("  Gerçekleşen ortalama: %.1f gün (%d teslimat)\n",
                perf.avgActualDays(), perf.deliveredCount()));
            sb.append(String.format("  Sapma: %+.1f gün -> %s\n\n", delay, verdict));
        }

        sb.append("AI ÖNERİSİ:\n");
        boolean anySuggestion = false;
        for (Map.Entry<String, List<Map<String, Object>>> e : byCategory.entrySet()) {
            if (e.getValue().size() < 2) continue;
            Map<String, Object> best = e.getValue().stream()
                .min(Comparator.comparingDouble(this::effectiveLeadDays))
                .orElse(null);
            if (best != null) {
                anySuggestion = true;
                sb.append(String.format("  - %s kategorisinde yeni siparişleri %s tedarikçisine yönlendirin (fiili ort. %.1f gün)\n",
                    e.getKey(), best.get("name"), effectiveLeadDays(best)));
            }
        }
        if (!anySuggestion) {
            sb.append("  - Tüm kategorilerde tek tedarikçi var; kıyaslama yapılamıyor.\n");
        }

        sb.append("\n[Demo mod — gerçek AI yorumu için BTP'de AI Core yapılandırın]");
        return sb.toString();
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> readAllSuppliers() {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.Supplier")
        ).listOf(Map.class);
    }

    // ─── Transfer Önerisi ────────────────────────────────────────────────────────

    // Aynı üründen başka mağazada fazla stok varsa transfer önerisi üretir; yoksa null
    private String findTransferSuggestion(Object productId, Object needyStoreId, StockData data) {
        for (Map<String, Object> s : data.stockLevels()) {
            if (!Objects.equals(s.get("product_ID"), productId)) continue;
            if (Objects.equals(s.get("store_ID"), needyStoreId)) continue;

            int qty = toInt(s.get("quantity"));
            int threshold = toInt(s.get("criticalThreshold"));
            // Kaynak mağazada güvenli pay bırak: eşiğin 1.5 katı orada kalmalı
            int transferable = qty - (int) Math.ceil(threshold * 1.5);
            if (transferable > 0) {
                return String.format(
                    "%s mağazasında %d adet var — %d adete kadar transfer edilebilir (sipariş maliyeti ve teslimat süresi olmadan)",
                    data.storeNames().getOrDefault(s.get("store_ID"), "?"), qty, transferable);
            }
        }
        return null;
    }

    // ─── Veri Okuma ──────────────────────────────────────────────────────────────

    @SuppressWarnings({"unchecked", "rawtypes"})
    private StockData readStockData() {
        List<Map<String, Object>> stockLevels = (List<Map<String, Object>>) (List<?>)
            db.run(Select.from("my.supplychain.StockLevel")).listOf(Map.class);

        List<Map<String, Object>> stores = (List<Map<String, Object>>) (List<?>)
            db.run(Select.from("my.supplychain.Store")).listOf(Map.class);

        List<Map<String, Object>> products = (List<Map<String, Object>>) (List<?>)
            db.run(Select.from("my.supplychain.Product")).listOf(Map.class);

        Map<Object, String> storeNames = stores.stream()
            .collect(Collectors.toMap(s -> s.get("ID"), s -> String.valueOf(s.get("name"))));

        Map<Object, String> productNames = products.stream()
            .collect(Collectors.toMap(p -> p.get("ID"), p -> String.valueOf(p.get("name"))));

        Map<Object, Double> productPrices = products.stream()
            .collect(Collectors.toMap(p -> p.get("ID"), p -> {
                Object price = p.get("unitPrice");
                return price instanceof Number n ? n.doubleValue() : 0.0;
            }));

        return new StockData(stockLevels, storeNames, productNames, productPrices);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> readMovements(Object stockLevelId) {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.StockMovement")
                .where(m -> m.get("stockLevel_ID").eq(stockLevelId))
        ).listOf(Map.class);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> readAllMovements() {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.StockMovement")
        ).listOf(Map.class);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private List<Map<String, Object>> readAllOrders() {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.PurchaseOrder")
        ).listOf(Map.class);
    }

    private record StockData(
        List<Map<String, Object>> stockLevels,
        Map<Object, String> storeNames,
        Map<Object, String> productNames,
        Map<Object, Double> productPrices
    ) {}

    // ─── Tahmin Hesaplama ────────────────────────────────────────────────────────

    // Hareket geçmişinden günlük ortalama tüketimi ve tahmini tükenme süresini hesaplar
    private record Forecast(int totalSold, long periodDays, double avgDailyConsumption, double daysUntilDepletion) {}

    private Forecast computeForecast(int quantity, List<Map<String, Object>> movements) {
        java.time.Instant now = java.time.Instant.now();
        java.time.Instant earliest = now;
        int totalSold = 0;

        for (Map<String, Object> m : movements) {
            java.time.Instant at = toInstant(m.get("changedAt"));
            if (at != null && at.isBefore(earliest)) {
                earliest = at;
            }
            int change = toInt(m.get("changeAmount"));
            if (change < 0) {
                totalSold += -change;
            }
        }

        long periodDays = Math.max(1, java.time.Duration.between(earliest, now).toDays());
        double avgDaily = (double) totalSold / periodDays;
        double daysLeft = avgDaily > 0 ? quantity / avgDaily : -1;

        return new Forecast(totalSold, periodDays, avgDaily, daysLeft);
    }

    private java.time.Instant toInstant(Object value) {
        try {
            if (value instanceof java.time.Instant i) return i;
            if (value instanceof java.sql.Timestamp t) return t.toInstant();
            if (value != null) return java.time.Instant.parse(value.toString());
        } catch (Exception ignored) {
            // tarih ayrıştırılamazsa hareketi dönem hesabına katmayız
        }
        return null;
    }

    // ─── Prompt Oluşturma ────────────────────────────────────────────────────────

    private String buildPrompt(StockData data) {
        StringBuilder sb = new StringBuilder();
        sb.append("Sen bir tedarik zinciri uzmanı yapay zeka asistanısın.\n");
        sb.append("Aşağıdaki stok verilerini analiz et ve Türkçe, kısa, net öneriler sun.\n\n");
        sb.append("MEVCUT STOK DURUMU:\n");

        for (Map<String, Object> stock : data.stockLevels()) {
            String store = data.storeNames().getOrDefault(stock.get("store_ID"), "Bilinmiyor");
            String product = data.productNames().getOrDefault(stock.get("product_ID"), "Bilinmiyor");
            int qty = toInt(stock.get("quantity"));
            int threshold = toInt(stock.get("criticalThreshold"));
            boolean critical = qty <= threshold;

            sb.append(String.format("- %s @ %s: Stok=%d, Kritik Eşik=%d%s\n",
                product, store, qty, threshold, critical ? " *** KRİTİK ***" : ""));
        }

        sb.append("\nLütfen şunları belirt:\n");
        sb.append("1. Kritik stok durumları\n");
        sb.append("2. Acil sipariş önerileri\n");
        sb.append("3. Fazla/ölü stoklar ve bağlanan para\n");
        return sb.toString();
    }

    private String buildForecastPrompt(String product, String store, int quantity, int threshold,
                                       List<Map<String, Object>> movements, Forecast f,
                                       String transferSuggestion) {
        StringBuilder sb = new StringBuilder();
        sb.append("Sen bir tedarik zinciri talep tahmin uzmanısın. Türkçe, kısa ve net cevap ver.\n\n");
        sb.append(String.format("ÜRÜN: %s (Mağaza: %s)\n", product, store));
        sb.append(String.format("Mevcut stok: %d adet, Kritik eşik: %d adet\n\n", quantity, threshold));
        sb.append("SON HAREKETLER:\n");
        for (Map<String, Object> m : movements) {
            sb.append(String.format("- %s: %+d (%s)\n",
                m.get("changedAt"), toInt(m.get("changeAmount")), m.get("reason")));
        }
        sb.append(String.format("\nHesaplanan: %d günde %d adet satış, günlük ort. %.2f adet\n",
            f.periodDays(), f.totalSold(), f.avgDailyConsumption()));
        if (transferSuggestion != null) {
            sb.append("Transfer alternatifi: ").append(transferSuggestion).append("\n");
        }
        sb.append("\nLütfen şunları belirt:\n");
        sb.append("1. Tahmini tükenme süresi (gün)\n");
        sb.append("2. Kritik eşiğe ne zaman düşer\n");
        sb.append("3. Sipariş mi transfer mi daha mantıklı, hangi miktar\n");
        return sb.toString();
    }

    private String buildCopilotPrompt(String question, StockData data) {
        StringBuilder sb = new StringBuilder();
        sb.append("Sen 'Supply Chain Copilot' adında bir tedarik zinciri asistanısın. ");
        sb.append("Aşağıdaki verilere dayanarak kullanıcının sorusunu Türkçe, kısa ve net cevapla.\n\n");

        sb.append("STOK DURUMU:\n");
        for (Map<String, Object> s : data.stockLevels()) {
            sb.append(String.format("- Kayıt %s: %s @ %s, %d adet (eşik %d)\n",
                s.get("ID"),
                data.productNames().getOrDefault(s.get("product_ID"), "?"),
                data.storeNames().getOrDefault(s.get("store_ID"), "?"),
                toInt(s.get("quantity")), toInt(s.get("criticalThreshold"))));
        }

        sb.append("\nSON HAREKETLER:\n");
        for (Map<String, Object> m : readAllMovements()) {
            sb.append(String.format("- Kayıt %s: %+d, %s (%s)\n",
                m.get("stockLevel_ID"), toInt(m.get("changeAmount")),
                m.get("changedAt"), m.get("reason")));
        }

        sb.append("\nSİPARİŞLER:\n");
        for (Map<String, Object> o : readAllOrders()) {
            sb.append(String.format("- %s: %d adet, durum %s\n",
                data.productNames().getOrDefault(o.get("product_ID"), "?"),
                toInt(o.get("orderQuantity")), o.get("status")));
        }

        sb.append("\nKULLANICI SORUSU: ").append(question).append("\n");
        return sb.toString();
    }

    // ─── SAP AI Core HTTP Çağrısı ────────────────────────────────────────────────

    private boolean isAiCoreConfigured() {
        return !tokenUrl.isEmpty() && !clientId.isEmpty()
            && !clientSecret.isEmpty() && !baseUrl.isEmpty() && !deploymentId.isEmpty();
    }

    @SuppressWarnings("unchecked")
    private String callSapAiCore(String prompt) {
        String accessToken = fetchOAuthToken();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.set("AI-Resource-Group", resourceGroup);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = new HashMap<>();
        body.put("messages", List.of(
            Map.of("role", "user", "content", prompt)
        ));
        body.put("max_tokens", 600);

        String url = baseUrl + "/v2/inference/deployments/" + deploymentId + "/chat/completions";
        ResponseEntity<Map> response = restTemplate.exchange(
            url, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class
        );

        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
        return (String) message.get("content");
    }

    @SuppressWarnings("unchecked")
    private String fetchOAuthToken() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "client_credentials");
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);

        // tokenUrl: BTP servis anahtarındaki clientCredentialsTokenProvider.url değeri
        ResponseEntity<Map> response = restTemplate.exchange(
            tokenUrl, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class
        );
        return (String) response.getBody().get("access_token");
    }

    // ─── Demo Raporlar (AI Core yapılandırılmadığında) ───────────────────────────

    private String buildDemoAnalysis(StockData data) {
        List<String> critical = new ArrayList<>();
        List<String> ok = new ArrayList<>();
        List<String> deadStock = new ArrayList<>();

        for (Map<String, Object> stock : data.stockLevels()) {
            String store = data.storeNames().getOrDefault(stock.get("store_ID"), "Bilinmiyor");
            String product = data.productNames().getOrDefault(stock.get("product_ID"), "Bilinmiyor");
            int qty = toInt(stock.get("quantity"));
            int threshold = toInt(stock.get("criticalThreshold"));

            if (qty <= threshold) {
                String line = String.format("%s @ %s: %d adet kaldı (eşik: %d)", product, store, qty, threshold);
                String transfer = findTransferSuggestion(
                    stock.get("product_ID"), stock.get("store_ID"), data);
                if (transfer != null) {
                    line += "\n    Transfer alternatifi: " + transfer;
                }
                critical.add(line);
            } else {
                ok.add(String.format("%s @ %s: %d adet (eşik: %d)", product, store, qty, threshold));
            }

            // Ölü/fazla stok: 45 günden uzun süre yetecek stok, rafta bekleyen para demektir
            Forecast f = computeForecast(qty, readMovements(stock.get("ID")));
            if (f.avgDailyConsumption() > 0 && f.daysUntilDepletion() > 45) {
                double tiedUpValue = qty * data.productPrices().getOrDefault(stock.get("product_ID"), 0.0);
                deadStock.add(String.format(
                    "%s @ %s: %d adet, ~%d günlük stok — %,.0f ₺ rafta bekliyor",
                    product, store, qty, Math.round(f.daysUntilDepletion()), tiedUpValue));
            }
        }

        StringBuilder sb = new StringBuilder();
        sb.append("STOK ANALİZ RAPORU\n");
        sb.append("==================\n\n");

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

    private String buildDemoForecast(String product, String store, int quantity, int threshold,
                                     Forecast f, String transferSuggestion) {
        StringBuilder sb = new StringBuilder();
        sb.append("TALEP TAHMİNİ RAPORU\n");
        sb.append("====================\n\n");
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

    private int toInt(Object value) {
        if (value instanceof Number n) return n.intValue();
        return 0;
    }
}
