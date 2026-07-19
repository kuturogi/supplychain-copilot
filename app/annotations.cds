using { SupplyChainService } from '../srv/service';

annotate SupplyChainService.StockLevels with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Stok',
            TypeNamePlural: 'Mağaza Stok Durumları'
        },
        LineItem: [
            { 
                $Type: 'UI.DataField', 
                Value: ID, 
                Label: 'Kayıt No' 
            },
            { 
                $Type: 'UI.DataField', 
                Value: product_ID, 
                Label: 'Ürün Kodu' 
            },
            { 
                $Type: 'UI.DataField', 
                Value: store_ID, 
                Label: 'Mağaza Kodu' 
            },
            { 
                $Type: 'UI.DataField', 
                Value: quantity, 
                Label: 'Mevcut Stok' 
            },
            { 
                $Type: 'UI.DataField', 
                Value: criticalThreshold, 
                Label: 'Kritik Sınır' 
            }
        ]
    }
);