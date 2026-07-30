using my.supplychain from '../db/schema';

/**
 * Yetki modeli — üç rol:
 *   Viewer   : tüm verileri okur, salt-okunur AI analizlerini çalıştırır
 *   Planner  : Viewer + stok günceller, sipariş taslağı oluşturur
 *   Approver : Planner + sipariş onay/teslim/iptal akışını yürütür
 *
 * Rol → scope eşlemesi xs-security.json içindeki role-template'lerde tanımlıdır.
 * Yerel geliştirmede application.yaml altındaki mock kullanıcılar kullanılır.
 */
@requires: 'authenticated-user'
service SupplyChainService {

    // ─── Ana veriler (salt okunur) ───────────────────────────────────────────
    @restrict: [{ grant: 'READ', to: 'Viewer' }]
    entity Stores as projection on supplychain.Store;

    @restrict: [{ grant: 'READ', to: 'Viewer' }]
    entity Products as projection on supplychain.Product;

    @restrict: [{ grant: 'READ', to: 'Viewer' }]
    entity Suppliers as projection on supplychain.Supplier;

    // Redirection target: StockLevel'a işaret eden ilişkiler bu projeksiyona yönlenir
    // (özet view'ı da StockLevel'dan türediği için derleyiciye hedefi belirtmek gerekiyor)
    @cds.redirection.target
    @restrict: [
        { grant: 'READ',   to: 'Viewer'  },
        { grant: 'UPDATE', to: 'Planner' }
    ]
    entity StockLevels as projection on supplychain.StockLevel;

    // Hareket kaydı yalnızca backend handler'ları tarafından üretilir
    @restrict: [{ grant: 'READ', to: 'Viewer' }]
    entity StockMovements as projection on supplychain.StockMovement;

    @odata.draft.enabled
    @restrict: [
        { grant: 'READ', to: 'Viewer'  },
        { grant: '*',    to: 'Planner' }
    ]
    entity PurchaseOrders as projection on supplychain.PurchaseOrder;

    @restrict: [
        { grant: 'READ',   to: 'Viewer' },
        { grant: 'UPDATE', to: 'Viewer' }
    ]
    entity Notifications as projection on supplychain.Notification;

    @readonly
    @restrict: [{ grant: 'READ', to: 'Viewer' }]
    entity AnalysisLogs as projection on supplychain.AnalysisLog;

    // Mağaza bazlı özet: toplam stok, kritik ürün sayısı, toplam stok değeri.
    // summaryCriticality veritabanında null'dur; backend handler'ı okuma sırasında doldurur.
    @readonly
    @restrict: [{ grant: 'READ', to: 'Viewer' }]
    entity StockSummaryByStore as select from supplychain.StockLevel {
        key store.ID       as storeId       : Integer,
            store.name     as storeName     : String,
            store.location as location      : String,
            count(*)       as recordCount   : Integer,
            sum(quantity)  as totalQuantity : Integer,
            sum(case when quantity <= criticalThreshold then 1 else 0 end) as criticalCount : Integer,
            sum(quantity * product.unitPrice) as totalValue : Decimal,
            null           as summaryCriticality : Integer
    } group by store.ID, store.name, store.location;

    // ─── Salt-okunur AI analizleri (Viewer) ──────────────────────────────────
    @requires: 'Viewer'
    action analyzeStockWithAI() returns String;

    @requires: 'Viewer'
    action forecastDemand(stockLevelId: Integer) returns String;

    // Doğal dilde soru-cevap: tüm stok/hareket/sipariş verisi bağlam olarak kullanılır
    @requires: 'Viewer'
    action askCopilot(question: String) returns String;

    // Söz verilen vs gerçekleşen teslimat sürelerini karşılaştıran tedarikçi karnesi
    @requires: 'Viewer'
    action supplierScorecard() returns String;

    // ─── Bildirim yönetimi (Viewer) ──────────────────────────────────────────
    @requires: 'Viewer'
    action markNotificationRead(notificationId: UUID) returns String;

    @requires: 'Viewer'
    action markAllNotificationsRead() returns String;

    @requires: 'Viewer'
    function getUnreadNotificationCount() returns Integer;

    // ─── Sipariş oluşturma (Planner) ─────────────────────────────────────────
    // quantity verilmezse (0 veya null) tüketim hızından 30 günlük öneri hesaplanır
    @requires: 'Planner'
    action createPurchaseOrder(stockLevelId: Integer, quantity: Integer) returns String;

    // Toplu sipariş — tüm kritik stoklar için otomatik sipariş oluştur
    @requires: 'Planner'
    action createBulkOrders() returns String;

    // ─── Sipariş onay akışı (Approver) ───────────────────────────────────────
    @requires: 'Approver'
    action approvePurchaseOrder(orderId: UUID) returns String;

    @requires: 'Approver'
    action markOrderDelivered(orderId: UUID) returns String;

    @requires: 'Approver'
    action cancelPurchaseOrder(orderId: UUID) returns String;
}
