package customer.supplychaincopilot.handlers;

import com.sap.cds.ql.Insert;
import com.sap.cds.ql.Select;
import com.sap.cds.ql.cqn.CqnAnalyzer;
import com.sap.cds.services.cds.CdsUpdateEventContext;
import com.sap.cds.services.cds.CqnService;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.Before;
import com.sap.cds.services.handler.annotations.ServiceName;
import com.sap.cds.services.persistence.PersistenceService;
import customer.supplychaincopilot.service.StockDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * StockLevel güncelleme olaylarını dinler.
 * Miktar değiştiğinde StockMovement kaydı oluşturur;
 * stok kritik eşiğin altına düşerse Notification üretir.
 */
@Component
@ServiceName("SupplyChainService")
public class StockUpdateHandler implements EventHandler {

    @Autowired
    private PersistenceService db;

    @Autowired
    private StockDataRepository repo;

    @Before(event = CqnService.EVENT_UPDATE, entity = "SupplyChainService.StockLevels")
    public void onStockLevelUpdate(CdsUpdateEventContext context) {
        Map<String, Object> data = context.getCqn().data();
        if (!data.containsKey("quantity")) return;

        Object id = resolveStockLevelId(context, data);
        if (id == null) return;

        var currentOpt = db.run(
            Select.from("my.supplychain.StockLevel")
                .columns("quantity", "criticalThreshold", "store_ID", "product_ID")
                .byId(id)
        ).first();

        if (currentOpt.isEmpty()) return;

        Map<String, Object> current = currentOpt.get();
        int oldQty = repo.toInt(current.get("quantity"));
        int newQty = repo.toInt(data.get("quantity"));
        if (oldQty == newQty) return;

        insertStockMovement(id, newQty - oldQty, newQty > oldQty);

        int threshold = repo.toInt(current.get("criticalThreshold"));
        if (newQty <= threshold && oldQty > threshold) {
            StockDataRepository.StockData names = repo.loadStockData();
            String product = names.productNames().getOrDefault(current.get("product_ID"), "Bilinmiyor");
            String store   = names.storeNames().getOrDefault(current.get("store_ID"), "Bilinmiyor");
            insertNotification(
                String.format("%s ürününün %s stoğu kritik seviyeye düştü (%d adet, eşik: %d)",
                    product, store, newQty, threshold),
                "Kritik"
            );
        }
    }

    // ─── Yardımcı metodlar ───────────────────────────────────────────────────────

    private Object resolveStockLevelId(CdsUpdateEventContext context, Map<String, Object> data) {
        Object id = data.get("ID");
        if (id == null) {
            id = CqnAnalyzer.create(context.getModel())
                .analyze(context.getCqn().ref())
                .targetKeys().get("ID");
        }
        return id;
    }

    private void insertStockMovement(Object stockLevelId, int changeAmount, boolean isReplenishment) {
        Map<String, Object> movement = new HashMap<>();
        movement.put("ID", UUID.randomUUID().toString());
        movement.put("stockLevel_ID", stockLevelId);
        movement.put("changeAmount", changeAmount);
        movement.put("changedAt", java.time.Instant.now());
        movement.put("reason", isReplenishment ? "İkmal - stok güncellemesi" : "Satış / stok düşüşü");
        db.run(Insert.into("my.supplychain.StockMovement").entry(movement));
        System.out.printf("Stok hareketi kaydedildi (ID=%s, değişim=%+d)%n", stockLevelId, changeAmount);
    }

    private void insertNotification(String message, String severity) {
        Map<String, Object> notification = new HashMap<>();
        notification.put("ID", UUID.randomUUID().toString());
        notification.put("message", message);
        notification.put("severity", severity);
        notification.put("createdAt", java.time.Instant.now());
        notification.put("isRead", false);
        db.run(Insert.into("my.supplychain.Notification").entry(notification));
        System.out.println("Bildirim oluşturuldu: " + message);
    }
}
