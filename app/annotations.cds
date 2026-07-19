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
                Label: 'Mevcut Stok',
                Criticality: criticality,
                CriticalityRepresentation: #WithIcon
            },
            {
                $Type: 'UI.DataField',
                Value: criticalThreshold,
                Label: 'Kritik Sınır'
            }
        ]
    }
);

annotate SupplyChainService.StockSummaryByStore with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Mağaza Özeti',
            TypeNamePlural: 'Mağaza Stok Dashboard'
        },
        LineItem: [
            {
                $Type: 'UI.DataField',
                Value: storeName,
                Label: 'Mağaza'
            },
            {
                $Type: 'UI.DataField',
                Value: location,
                Label: 'Konum'
            },
            {
                $Type: 'UI.DataField',
                Value: recordCount,
                Label: 'Ürün Çeşidi'
            },
            {
                $Type: 'UI.DataField',
                Value: totalQuantity,
                Label: 'Toplam Stok'
            },
            {
                $Type: 'UI.DataField',
                Value: criticalCount,
                Label: 'Kritik Ürün',
                Criticality: summaryCriticality,
                CriticalityRepresentation: #WithIcon
            },
            {
                $Type: 'UI.DataField',
                Value: totalValue,
                Label: 'Stok Değeri (₺)'
            }
        ]
    }
);

annotate SupplyChainService.PurchaseOrders with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Sipariş',
            TypeNamePlural: 'Satın Alma Siparişleri'
        },
        LineItem: [
            {
                $Type: 'UI.DataField',
                Value: createdAt,
                Label: 'Tarih'
            },
            {
                $Type: 'UI.DataField',
                Value: product_ID,
                Label: 'Ürün'
            },
            {
                $Type: 'UI.DataField',
                Value: supplier_ID,
                Label: 'Tedarikçi'
            },
            {
                $Type: 'UI.DataField',
                Value: orderQuantity,
                Label: 'Miktar'
            },
            {
                $Type: 'UI.DataField',
                Value: status,
                Label: 'Durum'
            }
        ]
    }
);

annotate SupplyChainService.StockMovements with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Stok Hareketi',
            TypeNamePlural: 'Stok Hareketleri'
        },
        LineItem: [
            {
                $Type: 'UI.DataField',
                Value: changedAt,
                Label: 'Tarih'
            },
            {
                $Type: 'UI.DataField',
                Value: changeAmount,
                Label: 'Değişim'
            },
            {
                $Type: 'UI.DataField',
                Value: reason,
                Label: 'Açıklama'
            }
        ]
    }
);