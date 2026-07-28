using { cuid, managed } from '@sap/cds/common';

namespace my.supplychain;

entity Store {
    key ID       : Integer;
    name         : String;
    location     : String;
    stockLevels  : Association to many StockLevel on stockLevels.store = $self;
}

entity Product {
    key ID       : Integer;
    name         : String;
    category     : String;
    unitPrice    : Decimal;
    supplier     : Association to Supplier;
    stockLevels  : Association to many StockLevel on stockLevels.product = $self;
}

entity Supplier {
    key ID       : Integer;
    name         : String;
    contactEmail : String;
    category     : String;    // hangi ürün kategorisine tedarik yapıyor
    leadTimeDays : Integer;   // SÖZ VERİLEN teslimat süresi (gün)
    products     : Association to many Product on products.supplier = $self;
}

entity PurchaseOrder {
    key ID        : UUID;
    product       : Association to Product;
    store         : Association to Store;
    supplier      : Association to Supplier;
    orderQuantity : Integer;
    status        : String;    // Taslak | Onaylandı | Teslim Edildi
    createdAt     : DateTime;
    deliveredAt   : DateTime;  // gerçek teslim zamanı; performans karnesi bundan hesaplanır
    note          : String;
}

entity StockLevel {
    key ID            : Integer;
    quantity          : Integer;
    criticalThreshold : Integer;
    store             : Association to Store;
    product           : Association to Product;
    // Veritabanında tutulmaz; her okumada backend handler'ı hesaplar.
    // Fiori değerleri: 1 = Kırmızı (kritik), 2 = Turuncu (uyarı), 3 = Yeşil (normal)
    virtual criticality : Integer;
    movements         : Association to many StockMovement on movements.stockLevel = $self;
}

entity StockMovement {
    key ID       : UUID;
    stockLevel   : Association to StockLevel;
    changeAmount : Integer;   // negatif = satış/tüketim, pozitif = ikmal
    changedAt    : DateTime;
    reason       : String;
}

entity Notification {
    key ID    : UUID;
    message   : String;
    severity  : String;    // Bilgi | Uyarı | Kritik
    createdAt : DateTime;
    isRead    : Boolean;
}

entity AnalysisLog {
    key ID        : UUID;
    analysisType  : String;    // StokAnaliz | TalepTahmini | Copilot | TedarikciKarnesi
    question      : String;    // Copilot sorusu veya tetikleyen stok ID
    result        : LargeString;
    createdAt     : DateTime;
    criticalCount : Integer;   // analiz anındaki kritik ürün sayısı
}