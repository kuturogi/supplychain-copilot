package customer.supplychaincopilot.handlers;

import com.sap.cds.ql.Insert;
import com.sap.cds.ql.Select;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.On;
import com.sap.cds.services.handler.annotations.ServiceName;
import com.sap.cds.services.persistence.PersistenceService;
import customer.supplychaincopilot.service.StockDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Toplu sipariş handler'ı.
 * Kritik seviyedeki tüm stok kayıtları için otomatik olarak
 * Taslak sipariş oluşturur ve özet rapor döner.
 */
@Component
@ServiceName("SupplyChainService")
public class BulkOrderHandler implements EventHandler {

    @Autowired private PersistenceService  db;
    @Autowired private StockDataRepository repo;

    @On(event = "createBulkOrders")
    @SuppressWarnings({"unchecked", "rawtypes"})
    public String createBulkOrders() {
        System.out.println("createBulkOrders çağrıldı");

        StockDataRepository.StockData data = repo.loadStockData();
        List<String> created  = new ArrayList<>();
        List<String> skipped  = new ArrayList<>();

        for (Map<String, Object> stock : data.stockLevels()) {
            int qty       = repo.toInt(stock.get("quantity"));
            int threshold = repo.toInt(stock.get("criticalThreshold"));
            if (qty > threshold) continue;  // kritik değil, atla

            Object stockLevelId = stock.get("ID");
            Object productId    = stock.get("product_ID");
            Object storeId      = stock.get("store_ID");

            String productName = data.productNames().getOrDefault(productId, "Bilinmiyor");
            String storeName   = data.storeNames().getOrDefault(storeId, "Bilinmiyor");

            // Ürünü ve tedarikçiyi bul
            var productOpt = db.run(Select.from("my.supplychain.Product").byId(productId)).first();
            if (productOpt.isEmpty()) {
                skipped.add(String.format("%s @ %s — ürün kaydı bulunamadı", productName, storeName));
                continue;
            }

            Object supplierId = productOpt.get().get("supplier_ID");
            if (supplierId == null) {
                skipped.add(String.format("%s @ %s — tedarikçi tanımlı değil", productName, storeName));
                continue;
            }

            // Zaten Taslak veya Onaylandı sipariş var mı? Varsa tekrar oluşturma
            boolean alreadyPending = repo.findAllOrders().stream().anyMatch(o ->
                Objects.equals(o.get("product_ID"), productId) &&
                Objects.equals(o.get("store_ID"), storeId) &&
                ("Taslak".equals(o.get("status")) || "Onaylandı".equals(o.get("status")))
            );

            if (alreadyPending) {
                skipped.add(String.format("%s @ %s — bekleyen sipariş zaten var", productName, storeName));
                continue;
            }

            // Miktarı tüketim hızından hesapla (30 günlük)
            List<Map<String, Object>> movements = repo.findMovementsByStockLevel(stockLevelId);
            StockDataRepository.Forecast forecast = repo.computeForecast(qty, movements);
            int orderQty = forecast.avgDailyConsumption() > 0
                ? (int) Math.ceil(forecast.avgDailyConsumption() * 30)
                : Math.max(1, threshold * 2);

            // Siparişi oluştur
            String orderId = UUID.randomUUID().toString();
            Map<String, Object> order = new HashMap<>();
            order.put("ID", orderId);
            order.put("product_ID", productId);
            order.put("store_ID", storeId);
            order.put("supplier_ID", supplierId);
            order.put("orderQuantity", orderQty);
            order.put("status", "Taslak");
            order.put("createdAt", java.time.Instant.now());
            order.put("note", "Toplu sipariş — kritik stok otomasyonu");
            db.run(Insert.into("my.supplychain.PurchaseOrder").entry(order));

            created.add(String.format("%s @ %s: %d adet", productName, storeName, orderQty));
        }

        return buildBulkOrderReport(created, skipped);
    }

    private String buildBulkOrderReport(List<String> created, List<String> skipped) {
        StringBuilder sb = new StringBuilder();
        sb.append("TOPLU SİPARİŞ RAPORU\n====================\n\n");

        if (created.isEmpty()) {
            sb.append("Oluşturulan sipariş yok.\n");
            sb.append("Tüm kritik stoklar için zaten bekleyen sipariş mevcut veya kritik stok bulunmuyor.\n");
        } else {
            sb.append(String.format("✓ %d sipariş taslağı oluşturuldu:\n\n", created.size()));
            created.forEach(item -> sb.append("  - ").append(item).append("\n"));
        }

        if (!skipped.isEmpty()) {
            sb.append(String.format("\n⚠ %d kayıt atlandı:\n\n", skipped.size()));
            skipped.forEach(item -> sb.append("  - ").append(item).append("\n"));
        }

        sb.append("\nTüm taslak siparişleri 'Siparişler' sayfasından inceleyip onaylayabilirsiniz.");
        return sb.toString();
    }
}
