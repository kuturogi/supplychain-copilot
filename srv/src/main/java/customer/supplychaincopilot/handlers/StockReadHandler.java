package customer.supplychaincopilot.handlers;

import com.sap.cds.ql.Select;
import com.sap.cds.services.cds.CdsReadEventContext;
import com.sap.cds.services.cds.CqnService;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.After;
import com.sap.cds.services.handler.annotations.ServiceName;
import com.sap.cds.services.persistence.PersistenceService;
import customer.supplychaincopilot.service.StockDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * StockLevel ve StockSummaryByStore okuma olaylarını dinler.
 * Her READ sonrası hesaplanan criticality değerlerini sonuç satırlarına enjekte eder.
 */
@Component
@ServiceName("SupplyChainService")
public class StockReadHandler implements EventHandler {

    @Autowired
    private PersistenceService db;

    @Autowired
    private StockDataRepository repo;

    /**
     * Her okumada kritiklik rengini hesaplar.
     * 1 = Kırmızı (stok ≤ eşik), 2 = Turuncu (stok ≤ eşik × 1.5), 3 = Yeşil
     */
    @After(event = CqnService.EVENT_READ, entity = "SupplyChainService.StockLevels")
    @SuppressWarnings({"unchecked", "rawtypes"})
    public void afterReadStockLevels(CdsReadEventContext context) {
        Map<Object, Map<String, Object>> lookup = new HashMap<>();

        context.getResult().forEach(row -> {
            Object qtyRaw       = row.get("quantity");
            Object thresholdRaw = row.get("criticalThreshold");

            if (qtyRaw == null || thresholdRaw == null) {
                Object id = row.get("ID");
                if (id == null) return;

                if (lookup.isEmpty()) {
                    List<Map<String, Object>> all = (List<Map<String, Object>>) (List<?>)
                        db.run(Select.from("my.supplychain.StockLevel")
                            .columns("ID", "quantity", "criticalThreshold"))
                        .listOf(Map.class);
                    all.forEach(r -> lookup.put(r.get("ID"), r));
                }

                Map<String, Object> full = lookup.get(id);
                if (full == null) return;
                qtyRaw       = full.get("quantity");
                thresholdRaw = full.get("criticalThreshold");
            }

            int qty       = repo.toInt(qtyRaw);
            int threshold = repo.toInt(thresholdRaw);

            int criticality;
            if (qty <= threshold)            criticality = 1;
            else if (qty <= threshold * 1.5) criticality = 2;
            else                             criticality = 3;

            row.put("criticality", criticality);
        });
    }

    /**
     * Dashboard özet satırları için mağaza bazlı kritiklik rengini hesaplar.
     */
    @After(event = CqnService.EVENT_READ, entity = "SupplyChainService.StockSummaryByStore")
    public void afterReadStockSummary(CdsReadEventContext context) {
        context.getResult().forEach(row -> {
            int criticalCount = repo.toInt(row.get("criticalCount"));
            row.put("summaryCriticality", criticalCount > 0 ? 1 : 3);
        });
    }
}
