package customer.supplychaincopilot.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Nested;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import static org.assertj.core.api.Assertions.*;

/**
 * StockDataRepository'nin hesaplama metotları için unit testler.
 * DB bağlantısı gerektirmeyen saf hesaplama mantığı test edilir.
 */
class StockDataRepositoryTest {

    private StockDataRepository repo;

    @BeforeEach
    void setUp() {
        repo = new StockDataRepository();
    }

    // ─── toInt ───────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("toInt()")
    class ToIntTests {
        @Test void integer_value() { assertThat(repo.toInt(42)).isEqualTo(42); }
        @Test void double_value()  { assertThat(repo.toInt(3.7)).isEqualTo(3); }
        @Test void long_value()    { assertThat(repo.toInt(100L)).isEqualTo(100); }
        @Test void null_value()    { assertThat(repo.toInt(null)).isZero(); }
        @Test void string_value()  { assertThat(repo.toInt("not a number")).isZero(); }
    }

    // ─── parseInstant ────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("parseInstant()")
    class ParseInstantTests {
        @Test
        void instant_passthrough() {
            Instant now = Instant.now();
            assertThat(repo.parseInstant(now)).isEqualTo(now);
        }

        @Test
        void iso_string() {
            String iso = "2026-07-01T10:00:00Z";
            assertThat(repo.parseInstant(iso)).isNotNull();
        }

        @Test
        void null_returns_null() {
            assertThat(repo.parseInstant(null)).isNull();
        }

        @Test
        void invalid_string_returns_null() {
            assertThat(repo.parseInstant("not-a-date")).isNull();
        }
    }

    // ─── computeForecast ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("computeForecast()")
    class ForecastTests {

        private Map<String, Object> movement(int change, int daysAgo) {
            Map<String, Object> m = new HashMap<>();
            m.put("changeAmount", change);
            m.put("changedAt", Instant.now().minus(daysAgo, ChronoUnit.DAYS).toString());
            return m;
        }

        @Test
        @DisplayName("Hareket yoksa tükenme süresi -1 döner")
        void no_movements_no_depletion() {
            StockDataRepository.Forecast f = repo.computeForecast(50, List.of());
            assertThat(f.avgDailyConsumption()).isZero();
            assertThat(f.daysUntilDepletion()).isEqualTo(-1);
            assertThat(f.totalSold()).isZero();
        }

        @Test
        @DisplayName("Sadece pozitif hareketler (ikmal) — satış yok")
        void only_replenishments() {
            List<Map<String, Object>> movements = List.of(
                movement(+10, 5),
                movement(+20, 3)
            );
            StockDataRepository.Forecast f = repo.computeForecast(30, movements);
            assertThat(f.totalSold()).isZero();
            assertThat(f.avgDailyConsumption()).isZero();
        }

        @Test
        @DisplayName("Günlük ortalama tüketim doğru hesaplanır")
        void avg_daily_consumption() {
            // 10 günlük periyotta 20 adet satış → günlük ort. 2
            List<Map<String, Object>> movements = List.of(
                movement(-10, 10),
                movement(-10, 1)
            );
            StockDataRepository.Forecast f = repo.computeForecast(40, movements);
            assertThat(f.totalSold()).isEqualTo(20);
            assertThat(f.avgDailyConsumption()).isBetween(1.5, 2.5);
        }

        @Test
        @DisplayName("Stok 0 iken tükenme süresi 0 döner")
        void zero_stock_depleted_immediately() {
            List<Map<String, Object>> movements = List.of(movement(-5, 3));
            StockDataRepository.Forecast f = repo.computeForecast(0, movements);
            assertThat(f.daysUntilDepletion()).isZero();
        }

        @Test
        @DisplayName("Karma hareketlerde sadece satışlar sayılır")
        void mixed_movements_only_sales_counted() {
            List<Map<String, Object>> movements = List.of(
                movement(-5, 7),
                movement(+20, 5),
                movement(-3, 2)
            );
            StockDataRepository.Forecast f = repo.computeForecast(50, movements);
            assertThat(f.totalSold()).isEqualTo(8);
        }
    }

    // ─── findTransferSuggestion ───────────────────────────────────────────────────

    @Nested
    @DisplayName("findTransferSuggestion()")
    class TransferTests {

        private StockDataRepository.StockData buildData(List<Map<String, Object>> levels) {
            Map<Object, String> storeNames = Map.of(1, "Mağaza A", 2, "Mağaza B", 3, "Mağaza C");
            Map<Object, String> productNames = Map.of(101, "Ürün X");
            Map<Object, Double> prices = Map.of(101, 100.0);
            return new StockDataRepository.StockData(levels, storeNames, productNames, prices);
        }

        private Map<String, Object> level(int store, int product, int qty, int threshold) {
            Map<String, Object> m = new HashMap<>();
            m.put("store_ID", store);
            m.put("product_ID", product);
            m.put("quantity", qty);
            m.put("criticalThreshold", threshold);
            return m;
        }

        @Test
        @DisplayName("Kaynak mağazada yeterli fazla stok varsa transfer önerisi döner")
        void transfer_available() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 101, 3, 5),   // kritik mağaza
                level(2, 101, 60, 10)  // fazla stoklu mağaza
            ));
            String suggestion = repo.findTransferSuggestion(101, 1, data);
            assertThat(suggestion).isNotNull();
            assertThat(suggestion).contains("Mağaza B");
        }

        @Test
        @DisplayName("Kaynak mağazada güvenli pay yoksa null döner")
        void no_transfer_not_enough_surplus() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 101, 2, 5),
                level(2, 101, 12, 10)  // 12 - ceil(10*1.5)=15 → transfer edilemez
            ));
            String suggestion = repo.findTransferSuggestion(101, 1, data);
            assertThat(suggestion).isNull();
        }

        @Test
        @DisplayName("Başka mağazada aynı ürün yoksa null döner")
        void no_transfer_product_not_in_other_stores() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 101, 2, 5)
            ));
            String suggestion = repo.findTransferSuggestion(101, 1, data);
            assertThat(suggestion).isNull();
        }

        @Test
        @DisplayName("Aynı mağazaya transfer önerisi yapılmaz")
        void no_self_transfer() {
            StockDataRepository.StockData data = buildData(List.of(
                level(1, 101, 100, 5)
            ));
            String suggestion = repo.findTransferSuggestion(101, 1, data);
            assertThat(suggestion).isNull();
        }
    }
}
