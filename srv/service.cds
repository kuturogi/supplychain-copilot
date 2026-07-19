using my.supplychain from '../db/schema';

service SupplyChainService {
    entity Stores as projection on supplychain.Store;
    entity Products as projection on supplychain.Product;
    // Redirection target: StockLevel'a işaret eden ilişkiler bu projeksiyona yönlenir
    // (özet view'ı da StockLevel'dan türediği için derleyiciye hedefi belirtmek gerekiyor)
    @cds.redirection.target
    entity StockLevels as projection on supplychain.StockLevel;
    entity StockMovements as projection on supplychain.StockMovement;
    entity Suppliers as projection on supplychain.Supplier;
    entity PurchaseOrders as projection on supplychain.PurchaseOrder;
    entity Notifications as projection on supplychain.Notification;

    // Mağaza bazlı özet: toplam stok, kritik ürün sayısı, toplam stok değeri.
    // summaryCriticality veritabanında null'dur; backend handler'ı okuma sırasında doldurur.
    @readonly
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

    action analyzeStockWithAI() returns String;
    action forecastDemand(stockLevelId: Integer) returns String;
    // quantity verilmezse (0 veya null) tüketim hızından 30 günlük öneri hesaplanır
    action createPurchaseOrder(stockLevelId: Integer, quantity: Integer) returns String;
    // Doğal dilde soru-cevap: tüm stok/hareket/sipariş verisi bağlam olarak kullanılır
    action askCopilot(question: String) returns String;
    // Söz verilen vs gerçekleşen teslimat sürelerini karşılaştıran tedarikçi karnesi
    action supplierScorecard() returns String;
}