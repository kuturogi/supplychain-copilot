package customer.supplychaincopilot.service;

import com.sap.cds.ql.Select;
import com.sap.cds.services.persistence.PersistenceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Tüm veritabanı okuma işlemlerini kapsayan merkezi repository.
 * Handler sınıfları bu servisi @Autowired ile alarak ham SQL/CQL
 * çağrılarından izole kalır.
 */
@Service
public class StockDataRepository {

    @Autowired
    private PersistenceService db;

    // ─── Record tanımları ────────────────────────────────────────────────────────

    public record StockData(
        List<Map<String, Object>> stockLevels,
        Map<Object, String> storeNames,
        Map<Object, String> productNames,
        Map<Object, Double> productPrices
    ) {}

    public record Forecast(
        int totalSold,
        long periodDays,
        double avgDailyConsumption,
        double daysUntilDepletion
    ) {}

    public record SupplierPerf(int deliveredCount, double avgActualDays) {}

    // ─── Stok verisi ─────────────────────────────────────────────────────────────

    @SuppressWarnings({"unchecked", "rawtypes"})
    public StockData loadStockData() {
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
    public List<Map<String, Object>> findMovementsByStockLevel(Object stockLevelId) {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.StockMovement")
                .where(m -> m.get("stockLevel_ID").eq(stockLevelId))
        ).listOf(Map.class);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    public List<Map<String, Object>> findAllMovements() {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.StockMovement")
        ).listOf(Map.class);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    public List<Map<String, Object>> findAllOrders() {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.PurchaseOrder")
        ).listOf(Map.class);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    public List<Map<String, Object>> findAllSuppliers() {
        return (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.Supplier")
        ).listOf(Map.class);
    }

    // ─── Hesaplama yardımcıları ──────────────────────────────────────────────────

    /**
     * Hareket geçmişinden günlük ortalama tüketimi ve tahmini tükenme süresini hesaplar.
     */
    public Forecast computeForecast(int currentQuantity, List<Map<String, Object>> movements) {
        java.time.Instant now = java.time.Instant.now();
        java.time.Instant earliest = now;
        int totalSold = 0;

        for (Map<String, Object> m : movements) {
            java.time.Instant at = parseInstant(m.get("changedAt"));
            if (at != null && at.isBefore(earliest)) {
                earliest = at;
            }
            int change = toInt(m.get("changeAmount"));
            if (change < 0) totalSold += -change;
        }

        long periodDays = Math.max(1, java.time.Duration.between(earliest, now).toDays());
        double avgDaily = (double) totalSold / periodDays;
        double daysLeft = avgDaily > 0 ? currentQuantity / avgDaily : -1;

        return new Forecast(totalSold, periodDays, avgDaily, daysLeft);
    }

    /**
     * Teslim edilmiş siparişlerden tedarikçinin gerçek ortalama teslimat süresini hesaplar.
     */
    public SupplierPerf computeSupplierPerformance(Object supplierId) {
        int count = 0;
        double totalDays = 0;

        for (Map<String, Object> o : findAllOrders()) {
            if (!java.util.Objects.equals(o.get("supplier_ID"), supplierId)) continue;
            java.time.Instant created = parseInstant(o.get("createdAt"));
            java.time.Instant delivered = parseInstant(o.get("deliveredAt"));
            if (created == null || delivered == null) continue;
            totalDays += java.time.Duration.between(created, delivered).toHours() / 24.0;
            count++;
        }

        return new SupplierPerf(count, count > 0 ? totalDays / count : -1);
    }

    /**
     * Tedarikçinin fiili performansını esas alarak beklenmesi gereken teslimat süresini döner.
     * Teslim verisi yoksa söz verilen süreyi kullanır.
     */
    public double effectiveLeadDays(Map<String, Object> supplier) {
        SupplierPerf perf = computeSupplierPerformance(supplier.get("ID"));
        return perf.deliveredCount() > 0 ? perf.avgActualDays() : toInt(supplier.get("leadTimeDays"));
    }

    /**
     * Aynı üründen başka mağazada transfer edilebilir stok varsa öneri metni döner; yoksa null.
     */
    public String findTransferSuggestion(Object productId, Object needyStoreId, StockData data) {
        for (Map<String, Object> s : data.stockLevels()) {
            if (!java.util.Objects.equals(s.get("product_ID"), productId)) continue;
            if (java.util.Objects.equals(s.get("store_ID"), needyStoreId)) continue;

            int qty = toInt(s.get("quantity"));
            int threshold = toInt(s.get("criticalThreshold"));
            int transferable = qty - (int) Math.ceil(threshold * 1.5);

            if (transferable > 0) {
                return String.format(
                    "%s mağazasında %d adet var — %d adete kadar transfer edilebilir",
                    data.storeNames().getOrDefault(s.get("store_ID"), "?"), qty, transferable);
            }
        }
        return null;
    }

    // ─── Yardımcı tipler ─────────────────────────────────────────────────────────

    public int toInt(Object value) {
        if (value instanceof Number n) return n.intValue();
        return 0;
    }

    public java.time.Instant parseInstant(Object value) {
        try {
            if (value instanceof java.time.Instant i)  return i;
            if (value instanceof java.sql.Timestamp t) return t.toInstant();
            if (value != null) return java.time.Instant.parse(value.toString());
        } catch (Exception ignored) {}
        return null;
    }
}
