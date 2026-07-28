package customer.supplychaincopilot.handlers;

import com.sap.cds.ql.Select;
import com.sap.cds.ql.Update;
import com.sap.cds.ql.Insert;
import com.sap.cds.services.EventContext;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.On;
import com.sap.cds.services.handler.annotations.ServiceName;
import com.sap.cds.services.persistence.PersistenceService;
import customer.supplychaincopilot.service.StockDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Sipariş onay akışı handler'ı.
 * Taslak → Onaylandı → Teslim Edildi geçişlerini yönetir.
 * Her geçişte ilgili Notification oluşturur.
 */
@Component
@ServiceName("SupplyChainService")
public class OrderWorkflowHandler implements EventHandler {

    @Autowired private PersistenceService  db;
    @Autowired private StockDataRepository repo;

    @On(event = "approvePurchaseOrder")
    public String approvePurchaseOrder(EventContext context) {
        Object orderId = context.get("orderId");
        if (orderId == null) return "Hata: orderId parametresi eksik.";

        var orderOpt = db.run(Select.from("my.supplychain.PurchaseOrder").byId(orderId.toString())).first();
        if (orderOpt.isEmpty()) return "Hata: Sipariş bulunamadı.";

        Map<String, Object> order = orderOpt.get();
        String currentStatus = String.valueOf(order.get("status"));

        if (!"Taslak".equals(currentStatus)) {
            return String.format("Hata: Sipariş zaten '%s' durumunda, onaylanamaz.", currentStatus);
        }

        db.run(Update.entity("my.supplychain.PurchaseOrder")
            .byId(orderId.toString())
            .data(Map.of("status", "Onaylandı")));

        StockDataRepository.StockData names = repo.loadStockData();
        String productName = names.productNames().getOrDefault(order.get("product_ID"), "Bilinmiyor");
        String storeName   = names.storeNames().getOrDefault(order.get("store_ID"), "Bilinmiyor");

        insertNotification(
            String.format("%s ürünü için %s mağazasına sipariş onaylandı (%d adet)",
                productName, storeName, repo.toInt(order.get("orderQuantity"))),
            "Bilgi"
        );

        System.out.printf("Sipariş onaylandı: %s%n", orderId);
        return String.format("SİPARİŞ ONAYLANDI\n\nÜrün: %s\nMağaza: %s\nMiktar: %d adet\nDurum: Onaylandı",
            productName, storeName, repo.toInt(order.get("orderQuantity")));
    }

    @On(event = "markOrderDelivered")
    public String markOrderDelivered(EventContext context) {
        Object orderId = context.get("orderId");
        if (orderId == null) return "Hata: orderId parametresi eksik.";

        var orderOpt = db.run(Select.from("my.supplychain.PurchaseOrder").byId(orderId.toString())).first();
        if (orderOpt.isEmpty()) return "Hata: Sipariş bulunamadı.";

        Map<String, Object> order = orderOpt.get();
        String currentStatus = String.valueOf(order.get("status"));

        if ("Teslim Edildi".equals(currentStatus)) {
            return "Hata: Sipariş zaten teslim edildi olarak işaretlenmiş.";
        }
        if ("İptal".equals(currentStatus)) {
            return "Hata: İptal edilmiş sipariş teslim edildi olarak işaretlenemez.";
        }

        java.time.Instant now = java.time.Instant.now();
        Map<String, Object> patch = new HashMap<>();
        patch.put("status", "Teslim Edildi");
        patch.put("deliveredAt", now);
        db.run(Update.entity("my.supplychain.PurchaseOrder").byId(orderId.toString()).data(patch));

        StockDataRepository.StockData names = repo.loadStockData();
        String productName = names.productNames().getOrDefault(order.get("product_ID"), "Bilinmiyor");
        String storeName   = names.storeNames().getOrDefault(order.get("store_ID"), "Bilinmiyor");

        // Teslimatta stok seviyesini artır
        updateStockOnDelivery(order.get("product_ID"), order.get("store_ID"),
            repo.toInt(order.get("orderQuantity")));

        insertNotification(
            String.format("%s ürünü %s mağazasına teslim edildi (%d adet stoka eklendi)",
                productName, storeName, repo.toInt(order.get("orderQuantity"))),
            "Bilgi"
        );

        System.out.printf("Sipariş teslim edildi: %s%n", orderId);
        return String.format("TESLİMAT TAMAMLANDI\n\nÜrün: %s\nMağaza: %s\nMiktar: %d adet stoka eklendi\nTeslim: %s",
            productName, storeName, repo.toInt(order.get("orderQuantity")),
            java.time.LocalDate.now().toString());
    }

    @On(event = "cancelPurchaseOrder")
    public String cancelPurchaseOrder(EventContext context) {
        Object orderId = context.get("orderId");
        if (orderId == null) return "Hata: orderId parametresi eksik.";

        var orderOpt = db.run(Select.from("my.supplychain.PurchaseOrder").byId(orderId.toString())).first();
        if (orderOpt.isEmpty()) return "Hata: Sipariş bulunamadı.";

        Map<String, Object> order = orderOpt.get();
        String currentStatus = String.valueOf(order.get("status"));

        if ("Teslim Edildi".equals(currentStatus)) {
            return "Hata: Teslim edilmiş sipariş iptal edilemez.";
        }

        db.run(Update.entity("my.supplychain.PurchaseOrder")
            .byId(orderId.toString())
            .data(Map.of("status", "İptal")));

        StockDataRepository.StockData names = repo.loadStockData();
        String productName = names.productNames().getOrDefault(order.get("product_ID"), "Bilinmiyor");

        insertNotification(
            String.format("%s ürünü için sipariş iptal edildi", productName),
            "Uyarı"
        );

        System.out.printf("Sipariş iptal edildi: %s%n", orderId);
        return String.format("SİPARİŞ İPTAL EDİLDİ\n\nÜrün: %s\nDurum: İptal", productName);
    }

    // ─── Yardımcı metodlar ───────────────────────────────────────────────────────

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void updateStockOnDelivery(Object productId, Object storeId, int quantity) {
        var stockOpt = db.run(
            Select.from("my.supplychain.StockLevel")
                .where(s -> s.get("product_ID").eq(productId).and(s.get("store_ID").eq(storeId)))
        ).first();

        if (stockOpt.isEmpty()) return;

        Map<String, Object> stock = stockOpt.get();
        int newQty = repo.toInt(stock.get("quantity")) + quantity;
        db.run(Update.entity("my.supplychain.StockLevel")
            .byId(stock.get("ID"))
            .data(Map.of("quantity", newQty)));
    }

    private void insertNotification(String message, String severity) {
        Map<String, Object> notification = new HashMap<>();
        notification.put("ID", UUID.randomUUID().toString());
        notification.put("message", message);
        notification.put("severity", severity);
        notification.put("createdAt", java.time.Instant.now());
        notification.put("isRead", false);
        db.run(Insert.into("my.supplychain.Notification").entry(notification));
    }
}
