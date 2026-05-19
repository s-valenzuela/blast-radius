package com.example.certgraph.web;

import com.example.certgraph.model.CertGraph;
import com.example.certgraph.model.Certificate;
import com.example.certgraph.model.ServiceNode;
import com.example.certgraph.service.GraphLoader;
import com.example.certgraph.service.ImpactAnalyzer;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
public class GraphController {

    private final GraphLoader loader;
    private final ImpactAnalyzer analyzer;
    private final ObjectMapper yamlMapper;

    public GraphController(GraphLoader loader, ImpactAnalyzer analyzer) {
        this.loader = loader;
        this.analyzer = analyzer;
        this.yamlMapper = new ObjectMapper(new YAMLFactory()).registerModule(new JavaTimeModule());
    }

    @GetMapping("/graph")
    public Map<String, Object> graph() {
        CertGraph g = loader.getGraph();
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();
        LocalDate today = LocalDate.now();

        for (Certificate c : g.getCertificates()) {
            long days = c.getExpiresOn() == null ? Long.MAX_VALUE
                    : ChronoUnit.DAYS.between(today, c.getExpiresOn());
            nodes.add(Map.of(
                    "id", "cert:" + c.getId(),
                    "label", c.getName() == null ? c.getId() : c.getName(),
                    "group", "cert",
                    "daysToExpiry", days,
                    "expiresOn", c.getExpiresOn() == null ? "" : c.getExpiresOn().toString(),
                    "title", tooltip(c, days)
            ));
        }
        for (ServiceNode s : g.getServices()) {
            nodes.add(Map.of(
                    "id", "svc:" + s.getId(),
                    "label", s.getName() == null ? s.getId() : s.getName(),
                    "group", "service",
                    "team", s.getTeam() == null ? "" : s.getTeam()
            ));
            if (s.getCerts() != null) {
                for (String certId : s.getCerts()) {
                    edges.add(Map.of(
                            "from", "cert:" + certId,
                            "to", "svc:" + s.getId(),
                            "type", "uses"
                    ));
                }
            }
            if (s.getDependsOn() != null) {
                for (String dep : s.getDependsOn()) {
                    edges.add(Map.of(
                            "from", "svc:" + s.getId(),
                            "to", "svc:" + dep,
                            "type", "depends"
                    ));
                }
            }
        }
        return Map.of("nodes", nodes, "edges", edges);
    }

    @GetMapping("/certs")
    public List<Map<String, Object>> certs() {
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Certificate c : loader.getGraph().getCertificates()) {
            long days = c.getExpiresOn() == null ? Long.MAX_VALUE
                    : ChronoUnit.DAYS.between(today, c.getExpiresOn());
            Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("name", c.getName());
            m.put("issuer", c.getIssuer());
            m.put("expiresOn", c.getExpiresOn() == null ? null : c.getExpiresOn().toString());
            m.put("daysToExpiry", days);
            out.add(m);
        }
        return out;
    }

    @GetMapping("/impact/{certId}")
    public Map<String, Object> impact(@PathVariable String certId) {
        ImpactAnalyzer.Impact i = analyzer.analyzeCert(certId);
        Set<String> all = new HashSet<>();
        all.addAll(i.directlyAffected());
        all.addAll(i.transitivelyAffected());
        return Map.of(
                "certId", i.certId(),
                "direct", i.directlyAffected(),
                "transitive", i.transitivelyAffected(),
                "totalServices", all.size()
        );
    }

    @PostMapping(value = "/graph", consumes = {"application/x-yaml", "text/yaml", MediaType.TEXT_PLAIN_VALUE})
    public Map<String, Object> uploadYaml(@RequestBody String yaml) throws Exception {
        CertGraph g = yamlMapper.readValue(yaml, CertGraph.class);
        loader.replace(g);
        return Map.of(
                "certificates", g.getCertificates().size(),
                "services", g.getServices().size()
        );
    }

    private static String tooltip(Certificate c, long days) {
        StringBuilder sb = new StringBuilder();
        sb.append("<b>").append(c.getName() == null ? c.getId() : c.getName()).append("</b><br>");
        if (c.getIssuer() != null) sb.append("Issuer: ").append(c.getIssuer()).append("<br>");
        if (c.getExpiresOn() != null) sb.append("Expires: ").append(c.getExpiresOn()).append("<br>");
        if (days != Long.MAX_VALUE) sb.append("Days to expiry: ").append(days);
        return sb.toString();
    }
}
