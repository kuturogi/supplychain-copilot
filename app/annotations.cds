using { SupplyChainService } from '../srv/service';

// ─── StockLevels — Liste ve ObjectPage ──────────────────────────────────────

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

// ─── StockSummaryByStore — Dashboard KPI + Tablo ────────────────────────────

annotate SupplyChainService.StockSummaryByStore with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Mağaza Özeti',
            TypeNamePlural: 'Mağaza Stok Dashboard'
        },

        // KPI 1 — Toplam Stok Değeri
        KPI #TotalValue: {
            $Type      : 'UI.KPIType',
            DataPoint  : '@UI.DataPoint#TotalValueDP',
            Detail     : {
                $Type          : 'UI.KPIDetailType',
                SemanticObject : 'SupplyChain',
                Action         : 'display'
            }
        },
        DataPoint #TotalValueDP: {
            $Type      : 'UI.DataPointType',
            Value      : totalValue,
            Title      : 'Toplam Stok Değeri (₺)',
            Visualization: #Number
        },

        // KPI 2 — Kritik Ürün Sayısı
        KPI #CriticalCount: {
            $Type      : 'UI.KPIType',
            DataPoint  : '@UI.DataPoint#CriticalCountDP',
            Detail     : {
                $Type          : 'UI.KPIDetailType',
                SemanticObject : 'SupplyChain',
                Action         : 'display'
            }
        },
        DataPoint #CriticalCountDP: {
            $Type        : 'UI.DataPointType',
            Value        : criticalCount,
            Title        : 'Kritik Ürün Sayısı',
            Criticality  : summaryCriticality,
            Visualization: #Number
        },

        // KPI 3 — Toplam Stok Adedi
        KPI #TotalQuantity: {
            $Type      : 'UI.KPIType',
            DataPoint  : '@UI.DataPoint#TotalQuantityDP',
            Detail     : {
                $Type          : 'UI.KPIDetailType',
                SemanticObject : 'SupplyChain',
                Action         : 'display'
            }
        },
        DataPoint #TotalQuantityDP: {
            $Type      : 'UI.DataPointType',
            Value      : totalQuantity,
            Title      : 'Toplam Stok Adedi',
            Visualization: #Number
        },

        // Tablo sütunları
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
        ],

        // PresentationVariant — varsayılan sıralama
        PresentationVariant: {
            SortOrder: [
                { Property: criticalCount, Descending: true },
                { Property: totalValue,    Descending: true }
            ],
            Visualizations: ['@UI.LineItem']
        }
    }
);

// ─── PurchaseOrders ──────────────────────────────────────────────────────────

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

// ─── StockMovements ──────────────────────────────────────────────────────────

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
