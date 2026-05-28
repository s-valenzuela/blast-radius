package se.valenzuela.blastradius;

import se.valenzuela.blastradius.model.Dependency;
import se.valenzuela.blastradius.service.GraphLoader;
import se.valenzuela.blastradius.service.ImpactAnalyzer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

@SpringBootTest
class ImpactAnalyzerTest {

    @Autowired GraphLoader loader;
    @Autowired ImpactAnalyzer analyzer;

    @Test
    void graphLoaded() {
        assertThat(loader.getGraph().getServices()).isNotEmpty();
    }

    @Test
    void webFrontendDependenciesAreRoutedViaApiGateway() {
        ImpactAnalyzer.ServiceDependencies d = analyzer.analyzeService("web-fe-01");
        assertThat(d.direct()).isEmpty();
        assertThat(d.via())
                .extracting(Dependency::getTarget, Dependency::getVia)
                .contains(
                        tuple("product-catalog-01", "api-gateway"),
                        tuple("search-01",          "api-gateway"),
                        tuple("cart-svc",           "api-gateway"),
                        tuple("checkout-svc",       "api-gateway"));
    }

    @Test
    void inventoryDownImpactsCatalogAndOrders() {
        ImpactAnalyzer.ServiceDependencies inv = analyzer.analyzeService("inventory-svc");
        assertThat(inv.impactedDirect()).contains(
                "product-catalog-01", "product-catalog-02", "product-catalog-03",
                "cart-svc", "checkout-svc");
        assertThat(inv.impactedTransitive()).contains(
                "web-fe-01", "search-01", "recommendations-01");

        ImpactAnalyzer.ServiceDependencies pc = analyzer.analyzeService("product-catalog-01");
        assertThat(pc.impactedDirect()).doesNotContain("inventory-svc");
        assertThat(pc.impactedTransitive()).doesNotContain("inventory-svc");
    }

    @Test
    void featureFlagsImpactCommsTransitively() {
        ImpactAnalyzer.ServiceDependencies ff = analyzer.analyzeService("feature-flags");
        assertThat(ff.impactedDirect()).contains("email-svc", "sms-svc");
        assertThat(ff.impactedTransitive()).contains("notification-svc");
    }

    @Test
    void apiGatewayHasGatewayKind() {
        var s = loader.getGraph().getServices().stream()
                .filter(x -> "api-gateway".equals(x.getId())).findFirst().orElseThrow();
        assertThat(s.getKind()).isEqualTo("gateway");
    }
}
