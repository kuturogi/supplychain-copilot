package customer.supplychaincopilot.handlers;

import com.sap.cds.ql.Select;
import com.sap.cds.ql.Update;
import com.sap.cds.services.EventContext;
import com.sap.cds.services.handler.EventHandler;
import com.sap.cds.services.handler.annotations.On;
import com.sap.cds.services.handler.annotations.ServiceName;
import com.sap.cds.services.persistence.PersistenceService;
import customer.supplychaincopilot.service.StockDataRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Bildirim yönetimi aksiyonlarını işleyen handler.
 * Okundu işaretleme, toplu okundu ve okunmamış sayma işlemlerini kapsar.
 */
@Component
@ServiceName("SupplyChainService")
public class NotificationHandler implements EventHandler {

    private static final Logger log = LoggerFactory.getLogger(NotificationHandler.class);

    @Autowired private PersistenceService  db;
    @Autowired private StockDataRepository repo;

    @On(event = "markNotificationRead")
    public String markNotificationRead(EventContext context) {
        Object notificationId = context.get("notificationId");
        if (notificationId == null) return "Hata: notificationId parametresi eksik.";

        var notifOpt = db.run(
            Select.from("my.supplychain.Notification").byId(notificationId.toString())
        ).first();

        if (notifOpt.isEmpty()) return "Hata: Bildirim bulunamadı.";

        db.run(Update.entity("my.supplychain.Notification")
            .byId(notificationId.toString())
            .data(Map.of("isRead", true)));

        log.info("Bildirim okundu işaretlendi: {}", notificationId);
        return "OK";
    }

    @On(event = "markAllNotificationsRead")
    @SuppressWarnings({"unchecked", "rawtypes"})
    public String markAllNotificationsRead() {
        List<Map<String, Object>> unread = (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.Notification")
                .where(n -> n.get("isRead").eq(false))
        ).listOf(Map.class);

        unread.forEach(n -> db.run(
            Update.entity("my.supplychain.Notification")
                .byId(n.get("ID").toString())
                .data(Map.of("isRead", true))
        ));

        log.info("Tüm bildirimler okundu işaretlendi ({} adet)", unread.size());
        return "OK";
    }

    @On(event = "getUnreadNotificationCount")
    @SuppressWarnings({"unchecked", "rawtypes"})
    public Integer getUnreadNotificationCount() {
        List<Map<String, Object>> unread = (List<Map<String, Object>>) (List<?>) db.run(
            Select.from("my.supplychain.Notification")
                .where(n -> n.get("isRead").eq(false))
        ).listOf(Map.class);
        return unread.size();
    }
}
