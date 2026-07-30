package customer.supplychaincopilot.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * SAP AI Core ile iletişimi yöneten servis.
 * OAuth2 client-credentials token alımı ve chat completions uç noktasına
 * istek gönderme sorumluluklarını üstlenir.
 *
 * Token, süresi dolana kadar bellekte tutulur; her chat çağrısında yeniden
 * alınmaz. Tüm HTTP çağrılarında connect/read timeout tanımlıdır — aksi halde
 * AI Core yanıt vermediğinde istek thread'i süresiz bloke olur.
 */
@Service
public class AiCoreClient {

    /** Token'ı süre dolmadan bu kadar önce yenile (saat sapmasına karşı pay). */
    private static final Duration TOKEN_REFRESH_MARGIN = Duration.ofSeconds(60);

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT    = Duration.ofSeconds(45);

    private static final ParameterizedTypeReference<Map<String, Object>> JSON_MAP =
        new ParameterizedTypeReference<>() {};

    private final String tokenUrl;
    private final String clientId;
    private final String clientSecret;
    private final String baseUrl;
    private final String deploymentId;
    private final String resourceGroup;

    private final RestTemplate restTemplate;

    /** Geçerli token ve son kullanma anı; null ise henüz alınmamıştır. */
    private volatile CachedToken cachedToken;

    private record CachedToken(String value, Instant expiresAt) {
        boolean isValid() {
            return Instant.now().isBefore(expiresAt);
        }
    }

    public AiCoreClient(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${aicore.token-url:}")       String tokenUrl,
            @Value("${aicore.client-id:}")       String clientId,
            @Value("${aicore.client-secret:}")   String clientSecret,
            @Value("${aicore.base-url:}")        String baseUrl,
            @Value("${aicore.deployment-id:}")   String deploymentId,
            @Value("${aicore.resource-group:default}") String resourceGroup) {

        this.tokenUrl      = tokenUrl;
        this.clientId      = clientId;
        this.clientSecret  = clientSecret;
        this.baseUrl       = baseUrl;
        this.deploymentId  = deploymentId;
        this.resourceGroup = resourceGroup;

        this.restTemplate = restTemplateBuilder
            .connectTimeout(CONNECT_TIMEOUT)
            .readTimeout(READ_TIMEOUT)
            .build();
    }

    public boolean isConfigured() {
        return !tokenUrl.isEmpty() && !clientId.isEmpty()
            && !clientSecret.isEmpty() && !baseUrl.isEmpty() && !deploymentId.isEmpty();
    }

    /**
     * Verilen promptu AI Core'a gönderir ve model yanıtını döner.
     */
    public String chat(String prompt) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(currentAccessToken());
        headers.set("AI-Resource-Group", resourceGroup);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
            "messages", List.of(Map.of("role", "user", "content", prompt)),
            "max_tokens", 600
        );

        String url = baseUrl + "/v2/inference/deployments/" + deploymentId + "/chat/completions";
        Map<String, Object> response = restTemplate.exchange(
            url, HttpMethod.POST, new HttpEntity<>(body, headers), JSON_MAP
        ).getBody();

        return extractContent(response);
    }

    /**
     * Chat completions yanıtından model metnini çıkarır.
     * Beklenmeyen bir gövde geldiğinde sessizce null dönmek yerine
     * anlaşılır bir hata fırlatır.
     */
    @SuppressWarnings("unchecked")
    private String extractContent(Map<String, Object> response) {
        if (response == null) {
            throw new IllegalStateException("AI Core boş yanıt döndü.");
        }
        Object choicesRaw = response.get("choices");
        if (!(choicesRaw instanceof List<?> choices) || choices.isEmpty()) {
            throw new IllegalStateException("AI Core yanıtında 'choices' alanı yok veya boş.");
        }
        if (!(choices.get(0) instanceof Map<?, ?> firstChoice)) {
            throw new IllegalStateException("AI Core yanıtındaki 'choices' öğesi beklenen biçimde değil.");
        }
        if (!(firstChoice.get("message") instanceof Map<?, ?> message)) {
            throw new IllegalStateException("AI Core yanıtında 'message' alanı yok.");
        }
        Object content = ((Map<String, Object>) message).get("content");
        if (content == null) {
            throw new IllegalStateException("AI Core yanıtında 'content' alanı yok.");
        }
        return content.toString();
    }

    /**
     * Önbellekteki token geçerliyse onu, değilse yenisini alıp döner.
     */
    private String currentAccessToken() {
        CachedToken token = cachedToken;
        if (token != null && token.isValid()) {
            return token.value();
        }
        synchronized (this) {
            // Başka bir thread bu arada yenilemiş olabilir
            if (cachedToken != null && cachedToken.isValid()) {
                return cachedToken.value();
            }
            cachedToken = fetchOAuthToken();
            return cachedToken.value();
        }
    }

    private CachedToken fetchOAuthToken() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "client_credentials");
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);

        Map<String, Object> response = restTemplate.exchange(
            tokenUrl, HttpMethod.POST, new HttpEntity<>(body, headers), JSON_MAP
        ).getBody();

        if (response == null || !(response.get("access_token") instanceof String accessToken)) {
            throw new IllegalStateException("AI Core token yanıtında 'access_token' alanı yok.");
        }

        return new CachedToken(accessToken, expiryFrom(response.get("expires_in")));
    }

    /**
     * expires_in (saniye) alanından son kullanma anını hesaplar.
     * Alan yoksa veya okunamıyorsa güvenli tarafta kalıp kısa bir süre kullanır.
     */
    private Instant expiryFrom(Object expiresIn) {
        long seconds = expiresIn instanceof Number n ? n.longValue() : 0L;
        if (seconds <= 0) {
            return Instant.now().plus(TOKEN_REFRESH_MARGIN);
        }
        Duration lifetime = Duration.ofSeconds(seconds).minus(TOKEN_REFRESH_MARGIN);
        if (lifetime.isNegative() || lifetime.isZero()) {
            lifetime = Duration.ofSeconds(seconds);
        }
        return Instant.now().plus(lifetime);
    }
}
