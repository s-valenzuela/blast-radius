package com.example.certgraph;

import com.example.certgraph.service.GraphLoader;
import com.example.certgraph.service.ImpactAnalyzer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class ImpactAnalyzerTest {

    @Autowired GraphLoader loader;
    @Autowired ImpactAnalyzer analyzer;

    @Test
    void edgeTlsBreaksGatewayAndWeb() {
        ImpactAnalyzer.Impact i = analyzer.analyzeCert("edge-tls");
        assertThat(i.directlyAffected()).containsExactly("gateway");
        assertThat(i.transitivelyAffected()).contains("web");
    }

    @Test
    void internalCaTouchesEveryBackend() {
        ImpactAnalyzer.Impact i = analyzer.analyzeCert("internal-ca");
        assertThat(i.directlyAffected())
                .contains("gateway", "auth", "orders", "payments", "inventory", "events", "notifications");
    }

    @Test
    void graphLoaded() {
        assertThat(loader.getGraph().getServices()).isNotEmpty();
        assertThat(loader.getGraph().getCertificates()).isNotEmpty();
    }
}
