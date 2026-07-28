package customer.supplychaincopilot.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * SAP AI Core ile iletişimi yöneten servis.
 * OAuth2 client-credentials token alımı ve chat completions uç noktasına
 * istek gönderme sorumluluklarını üstlenir.
 */
@Service
public class AiCoreClient {

    @Value("${aicore.token-url:}")
    private String tokenUrl;

    @Value("${aicore.client-id:}")
    private String clientId;

    @Value("${aicore.client-secret:}")
    private String clientSecret;

    @Value("${aicore.base-url:}")
    private String baseUrl;

    @Value("${aicore.deployment-id:}")
    private String deploymentId;

    @Value("${aicore.resource-group:default}")
    private String resourceGroup;

    private final RestTemplate restTemplate = new RestTemplate();

    public boolean isConfigured() {
        return !tokenUrl.isEmpty() && !clientId.isEmpty()
            && !clientSecret.isEmpty() && !baseUrl.isEmpty() && !deploymentId.isEmpty();
    }

    /**
     * Verilen promptu AI Core'a gönderir ve model yanıtını döner.
     */
    @SuppressWarnings("unchecked")
    public String chat(String prompt) {
        String accessToken = fetchOAuthToken();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        headers.set("AI-Resource-Group", resourceGroup);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> body = Map.of(
            "messages", List.of(Map.of("role", "user", "content", prompt)),
            "max_tokens", 600
        );

        String url = baseUrl + "/v2/inference/deployments/" + deploymentId + "/chat/completions";
        ResponseEntity<Map> response = restTemplate.exchange(
            url, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class
        );

        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.getBody().get("choices");
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
        return (String) message.get("content");
    }

    @SuppressWarnings("unchecked")
    private String fetchOAuthToken() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        MultiValueMap<String, String> body = new LinkedMultiValueMap<>();
        body.add("grant_type", "client_credentials");
        body.add("client_id", clientId);
        body.add("client_secret", clientSecret);

        ResponseEntity<Map> response = restTemplate.exchange(
            tokenUrl, HttpMethod.POST, new HttpEntity<>(body, headers), Map.class
        );
        return (String) response.getBody().get("access_token");
    }
}
