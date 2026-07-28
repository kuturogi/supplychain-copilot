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

// ─── PurchaseOrders — Gelişmiş Liste + ObjectPage ────────────────────────────

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
                Label: 'Sipariş Tarihi'
            },
            {
                $Type: 'UI.DataField',
                Value: product_ID,
                Label: 'Ürün'
            },
            {
                $Type: 'UI.DataField',
                Value: store_ID,
                Label: 'Mağaza'
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
                Label: 'Durum',
                Criticality: { $edmJson: { $If: [
                    { $Eq: [{ $Path: 'status' }, 'Teslim Edildi'] }, 3,
                    { $If: [
                        { $Eq: [{ $Path: 'status' }, 'Onaylandı'] }, 2, 1
                    ]}
                ]}},
                CriticalityRepresentation: #WithIcon
            },
            {
                $Type: 'UI.DataField',
                Value: deliveredAt,
                Label: 'Teslim Tarihi'
            }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Sipariş Detayı',
                Target: '@UI.FieldGroup#OrderDetail'
            }
        ],
        FieldGroup #OrderDetail: {
            Data: [
                { $Type: 'UI.DataField', Value: product_ID,     Label: 'Ürün'           },
                { $Type: 'UI.DataField', Value: store_ID,       Label: 'Mağaza'         },
                { $Type: 'UI.DataField', Value: supplier_ID,    Label: 'Tedarikçi'      },
                { $Type: 'UI.DataField', Value: orderQuantity,  Label: 'Miktar'         },
                { $Type: 'UI.DataField', Value: status,         Label: 'Durum'          },
                { $Type: 'UI.DataField', Value: createdAt,      Label: 'Sipariş Tarihi' },
                { $Type: 'UI.DataField', Value: deliveredAt,    Label: 'Teslim Tarihi'  },
                { $Type: 'UI.DataField', Value: note,           Label: 'Not'            }
            ]
        },
        PresentationVariant: {
            SortOrder: [{ Property: createdAt, Descending: true }],
            Visualizations: ['@UI.LineItem']
        }
    }
);

// ─── Suppliers — Liste ────────────────────────────────────────────────────────

annotate SupplyChainService.Suppliers with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Tedarikçi',
            TypeNamePlural: 'Tedarikçiler'
        },
        LineItem: [
            {
                $Type: 'UI.DataField',
                Value: name,
                Label: 'Tedarikçi Adı'
            },
            {
                $Type: 'UI.DataField',
                Value: category,
                Label: 'Kategori'
            },
            {
                $Type: 'UI.DataField',
                Value: contactEmail,
                Label: 'E-posta'
            },
            {
                $Type: 'UI.DataField',
                Value: leadTimeDays,
                Label: 'Söz Verilen Teslimat (gün)'
            }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Tedarikçi Bilgileri',
                Target: '@UI.FieldGroup#SupplierDetail'
            }
        ],
        FieldGroup #SupplierDetail: {
            Data: [
                { $Type: 'UI.DataField', Value: name,         Label: 'Ad'              },
                { $Type: 'UI.DataField', Value: category,     Label: 'Kategori'        },
                { $Type: 'UI.DataField', Value: contactEmail, Label: 'E-posta'         },
                { $Type: 'UI.DataField', Value: leadTimeDays, Label: 'Teslimat (gün)'  }
            ]
        }
    }
);

// ─── Products — Liste ─────────────────────────────────────────────────────────

annotate SupplyChainService.Products with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Ürün',
            TypeNamePlural: 'Ürünler'
        },
        LineItem: [
            {
                $Type: 'UI.DataField',
                Value: name,
                Label: 'Ürün Adı'
            },
            {
                $Type: 'UI.DataField',
                Value: category,
                Label: 'Kategori'
            },
            {
                $Type: 'UI.DataField',
                Value: unitPrice,
                Label: 'Birim Fiyat (₺)'
            },
            {
                $Type: 'UI.DataField',
                Value: supplier_ID,
                Label: 'Tedarikçi'
            }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Ürün Bilgileri',
                Target: '@UI.FieldGroup#ProductDetail'
            }
        ],
        FieldGroup #ProductDetail: {
            Data: [
                { $Type: 'UI.DataField', Value: name,        Label: 'Ad'               },
                { $Type: 'UI.DataField', Value: category,    Label: 'Kategori'         },
                { $Type: 'UI.DataField', Value: unitPrice,   Label: 'Birim Fiyat (₺)' },
                { $Type: 'UI.DataField', Value: supplier_ID, Label: 'Tedarikçi'        }
            ]
        },
        PresentationVariant: {
            SortOrder: [{ Property: category, Descending: false }],
            Visualizations: ['@UI.LineItem']
        }
    }
);

// ─── Stores — Liste + ObjectPage ─────────────────────────────────────────────

annotate SupplyChainService.Stores with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Mağaza',
            TypeNamePlural: 'Mağazalar'
        },
        LineItem: [
            {
                $Type: 'UI.DataField',
                Value: name,
                Label: 'Mağaza Adı'
            },
            {
                $Type: 'UI.DataField',
                Value: location,
                Label: 'Konum'
            }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Mağaza Bilgileri',
                Target: '@UI.FieldGroup#StoreDetail'
            },
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Stok Seviyeleri',
                Target: 'stockLevels/@UI.LineItem'
            }
        ],
        FieldGroup #StoreDetail: {
            Data: [
                { $Type: 'UI.DataField', Value: ID,       Label: 'Mağaza No' },
                { $Type: 'UI.DataField', Value: name,     Label: 'Ad'        },
                { $Type: 'UI.DataField', Value: location, Label: 'Konum'     }
            ]
        }
    }
);

// ─── AnalysisLog — AI Analiz Geçmişi ─────────────────────────────────────────

annotate SupplyChainService.AnalysisLogs with @(
    UI: {
        HeaderInfo: {
            TypeName: 'Analiz Kaydı',
            TypeNamePlural: 'AI Analiz Geçmişi'
        },
        LineItem: [
            {
                $Type: 'UI.DataField',
                Value: createdAt,
                Label: 'Tarih'
            },
            {
                $Type: 'UI.DataField',
                Value: analysisType,
                Label: 'Tür'
            },
            {
                $Type: 'UI.DataField',
                Value: question,
                Label: 'Soru / Tetikleyici'
            },
            {
                $Type: 'UI.DataField',
                Value: criticalCount,
                Label: 'Kritik Ürün Sayısı'
            }
        ],
        Facets: [
            {
                $Type: 'UI.ReferenceFacet',
                Label: 'Analiz Sonucu',
                Target: '@UI.FieldGroup#LogDetail'
            }
        ],
        FieldGroup #LogDetail: {
            Data: [
                { $Type: 'UI.DataField', Value: analysisType,  Label: 'Tür'              },
                { $Type: 'UI.DataField', Value: createdAt,     Label: 'Tarih'            },
                { $Type: 'UI.DataField', Value: question,      Label: 'Soru'             },
                { $Type: 'UI.DataField', Value: criticalCount, Label: 'Kritik Ürün'      },
                { $Type: 'UI.DataField', Value: result,        Label: 'Sonuç'            }
            ]
        },
        PresentationVariant: {
            SortOrder: [{ Property: createdAt, Descending: true }],
            Visualizations: ['@UI.LineItem']
        }
    }
);
