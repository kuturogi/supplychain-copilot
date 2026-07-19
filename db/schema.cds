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
    stockLevels  : Association to many StockLevel on stockLevels.product = $self;
}

entity StockLevel {
    key ID            : Integer;
    quantity          : Integer;
    criticalThreshold : Integer;
    store             : Association to Store;
    product           : Association to Product;
}