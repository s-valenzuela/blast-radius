package se.valenzuela.blastradius.service;

import se.valenzuela.blastradius.model.ServiceGraph;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.InputStream;

@Component
public class GraphLoader {

    private final ResourceLoader resourceLoader;

    @Value("${blastradius.source:classpath:services.yml}")
    private String source;

    private volatile ServiceGraph graph = new ServiceGraph();

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
        try (InputStream in = resource.getInputStream()) {
            this.graph = mapper.readValue(in, ServiceGraph.class);
        }
    }

    public ServiceGraph getGraph() {
        return graph;
    }

    public void replace(ServiceGraph newGraph) {
        this.graph = newGraph;
    }
}
