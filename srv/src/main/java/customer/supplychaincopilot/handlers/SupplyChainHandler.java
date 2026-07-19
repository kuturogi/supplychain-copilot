package customer.supplychaincopilot.handlers;

import com.sap.cds.services.EventContext;
import com.sap.cds.services.cds.CqnService;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.After;
import com.sap.cds.services.handler.annotations.On;
import com.sap.cds.services.handler.annotations.ServiceName;
import org.springframework.stereotype.Component;

@Component
@ServiceName("SupplyChainService")
public class SupplyChainHandler implements EventHandler {

    @After(
        event = CqnService.EVENT_READ,
        entity = "SupplyChainService.StockLevels"
    )
    public void afterReadStockLevels(EventContext context) {

        System.out.println(
            "Java Backend: Stok okuma isteği başarıyla yakalandı!"
        );
    }

    @On(event = "analyzeStockWithAI")
    public String analyzeStockWithAI() {

        System.out.println(
            "Java Backend: analyzeStockWithAI Action çağrıldı!"
        );

        return "Backend bağlantısı başarılı. Yapay zekâ stok analizi başlatıldı.";
    }
}