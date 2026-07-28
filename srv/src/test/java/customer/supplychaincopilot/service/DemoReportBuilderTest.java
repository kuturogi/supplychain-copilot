package customer.supplychaincopilot.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Nested;

import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * DemoReportBuilder'ın rapor oluşturma mantığı için unit testler.
 */
class DemoReportBuilderTest {

    private StockDataRepository repo;
    private DemoReportBuilder   builder;

    @BeforeEach
    void setUp() {
        repo    = new StockDataRepository();
        builder = new DemoReportBuilder(repo);
    }

    private StockDataRepository.StockData buildData(List<Map<String, Object>> levels) {
        Map<Object, String> storeNames   = Map.of(1, "İstanbul", 2, "Ankara");
        Map<Object, String> productNames = Map.of(101, "MacBook", 102, "Kask");
        Map<Object, Double> prices       = Map.of(101, 45000.0, 102, 4500.0);
        return new StockDataRepository.StockData(levels, storeNames, productNames, prices);
    }

    private Map<String, Object> level(int id, int store, int product, int qty, int threshold) {
        Map<String, Object> m = new HashMap<>();
        m.put("ID", id);
        m.put("store_ID", store);
        m.put("product_ID", product);
        m.put("quantity", qty);
        m.put("criticalThreshold", threshold);
        return m;
    }

    // ─── buildAnalysisReport ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("buildAnalysisReport()")
    class AnalysisReportTests {

        @Test
        @DisplayName("Kritik ürün varsa raporda KRİTİK DURUMLAR bölümü yer alır")
        void critical_items_in_report() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 1, 101, 3, 10)  // qty(3) < threshold(10) → kritik
            ));
            String report = builder.buildAnalysisReport(data);
            assertThat(report).contains("KRİTİK DURUMLAR");
            assertThat(report).contains("MacBook");
        }

        @Test
        @DisplayName("Tüm stoklar normal ise olumlu mesaj verilir")
        void all_normal_stocks() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 1, 101, 50, 10)  // qty(50) > threshold(10) → normal
            ));
            String report = builder.buildAnalysisReport(data);
            assertThat(report).contains("normal seviyede");
            assertThat(report).doesNotContain("KRİTİK DURUMLAR");
        }

        @Test
        @DisplayName("Rapor demo mod notu içerir")
        void contains_demo_note() {
            String report = builder.buildAnalysisReport(buildData(List.of()));
            assertThat(report).contains("Demo mod");
        }
    }

    // ─── buildForecastReport ─────────────────────────────────────────────────────

    @Nested
    @DisplayName("buildForecastReport()")
    class ForecastReportTests {

        @Test
        @DisplayName("Tüketim geçmişi yoksa uygun mesaj döner")
        void no_consumption_history() {
            StockDataRepository.Forecast f = new StockDataRepository.Forecast(0, 1, 0, -1);
            String report = builder.buildForecastReport("MacBook", "İstanbul", 50, 10, f, null);
            assertThat(report).contains("tüketim geçmişi bulunamadı");
        }

        @Test
        @DisplayName("Kritik eşiğin altındaysa ACİL uyarısı verilir")
        void critical_stock_urgent_warning() {
            StockDataRepository.Forecast f = new StockDataRepository.Forecast(30, 10, 3.0, 1.5);
            String report = builder.buildForecastReport("MacBook", "İstanbul", 5, 10, f, null);
            assertThat(report).contains("ACİL");
        }

        @Test
        @DisplayName("Transfer önerisi varsa raporda görünür")
        void transfer_suggestion_included() {
            StockDataRepository.Forecast f = new StockDataRepository.Forecast(10, 5, 2.0, 10.0);
            String report = builder.buildForecastReport("Kask", "Ankara", 20, 5, f, "Ankara'dan transfer mümkün");
            assertThat(report).contains("TRANSFER ALTERNATİFİ");
            assertThat(report).contains("Ankara'dan transfer mümkün");
        }
    }

    // ─── buildScorecardReport ────────────────────────────────────────────────────

    @Nested
    @DisplayName("buildScorecardReport()")
    class ScorecardTests {

        @Test
        @DisplayName("Tedarikçi listesi boşken rapor çökmez")
        void empty_supplier_list_no_crash() {
            // repo.findAllSuppliers() DB gerektiriyor; bu test sadece rapor başlığını kontrol eder
            // Gerçek DB testi için Spring Boot integration test kullanılmalı
            String report = builder.buildScorecardReport();
            // Null dönmemeli — ya gerçek veri ya da boş mesaj içermeli
            assertThat(report).isNotNull();
        }
    }

    // ─── answerWithRules ────────────────────────────────────────────────────────

    @Nested
    @DisplayName("answerWithRules()")
    class RulesTests {

        @Test
        @DisplayName("'kritik' sorusuna kritik ürünler listelenir")
        void critical_question() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 1, 101, 3, 10)
            ));
            String answer = builder.answerWithRules("kritik ürünler neler?", data);
            assertThat(answer).contains("KRİTİK");
        }

        @Test
        @DisplayName("'transfer' sorusuna transfer önerileri döner")
        void transfer_question() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 1, 101, 3, 10),
                level(2, 2, 101, 80, 5)
            ));
            String answer = builder.answerWithRules("transfer önerisi var mı?", data);
            assertThat(answer).contains("TRANSFER");
        }

        @Test
        @DisplayName("'sipariş' sorusuna sipariş bilgisi döner")
        void order_question() {
            StockDataRepository.StockData data = buildData(List.of());
            String answer = builder.answerWithRules("sipariş durumu nedir?", data);
            assertThat(answer).contains("SİPARİŞ");
        }

        @Test
        @DisplayName("Mağaza adı içeren soru mağaza bazlı cevap verir")
        void store_name_question() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 1, 101, 20, 5)
            ));
            String answer = builder.answerWithRules("İstanbul mağazasında durum ne?", data);
            assertThat(answer).containsIgnoringCase("istanbul");
        }

        @Test
        @DisplayName("Demo mod notu her zaman eklenir")
        void demo_note_always_present() {
            StockDataRepository.StockData data = buildData(List.of());
            String answer = builder.answerWithRules("genel durum", data);
            assertThat(answer).contains("Demo mod");
        }
    }
}
