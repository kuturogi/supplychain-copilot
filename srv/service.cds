using my.supplychain from '../db/schema';

service SupplyChainService {
    entity Stores as projection on supplychain.Store;
    entity Products as projection on supplychain.Product;
    entity StockLevels as projection on supplychain.StockLevel;

    action analyzeStockWithAI() returns String;
}