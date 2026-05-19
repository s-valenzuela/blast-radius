package com.example.certgraph.service;

import com.example.certgraph.model.CertGraph;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.InputStream;

@Component
public class GraphLoader {

    private final ResourceLoader resourceLoader;

    @Value("${certgraph.source:classpath:certs.yml}")
    private String source;

    private volatile CertGraph graph = new CertGraph();

    public GraphLoader(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @PostConstruct
    public void load() throws Exception {
        Resource resource = resourceLoader.getResource(source);
        if (!resource.exists()) {
            return;
        }
        ObjectMapper mapper = new ObjectMapper(new YAMLFactory());
        mapper.registerModule(new JavaTimeModule());
        try (InputStream in = resource.getInputStream()) {
            this.graph = mapper.readValue(in, CertGraph.class);
        }
    }

    public CertGraph getGraph() {
        return graph;
    }

    public void replace(CertGraph newGraph) {
        this.graph = newGraph;
    }
}
