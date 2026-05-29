package se.valenzuela.blastradius.web;

import se.valenzuela.blastradius.model.ServiceGraph;
import se.valenzuela.blastradius.model.Dependency;
import se.valenzuela.blastradius.model.ServiceNode;
import se.valenzuela.blastradius.service.GraphLoader;
import se.valenzuela.blastradius.service.ImpactAnalyzer;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class GraphController {

    private final GraphLoader loader;
    private final ImpactAnalyzer analyzer;
    private final ObjectMapper yamlMapper;

    public GraphController(GraphLoader loader, ImpactAnalyzer analyzer) {
        this.loader = loader;
        this.analyzer = analyzer;
        this.yamlMapper = new ObjectMapper(new YAMLFactory())
                .setSerializationInclusion(JsonInclude.Include.NON_EMPTY);
    }

    @GetMapping("/graph")
    public Map<String, Object> graph() {
        ServiceGraph g = loader.getGraph();
        List<Map<String, Object>> nodes = new ArrayList<>();
        List<Map<String, Object>> edges = new ArrayList<>();

        int routeCounter = 0;
        for (ServiceNode s : g.getServices()) {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("id", "svc:" + s.getId());
            n.put("label", s.getName() == null ? s.getId() : s.getName());
            n.put("group", "service");
            n.put("kind", s.getKind() == null ? "service" : s.getKind());
            n.put("groupName", s.getGroup() == null ? "" : s.getGroup());
            n.put("pool", s.getLoadBalancerPool() == null ? "" : s.getLoadBalancerPool());
            nodes.add(n);

            if (s.getDependsOn() != null) {
                for (Dependency d : s.getDependsOn()) {
                    if (d.getTarget() == null) continue;
                    if (d.getVia() == null) {
                        Map<String, Object> e = new LinkedHashMap<>();
                        e.put("from", "svc:" + s.getId());
                        e.put("to", "svc:" + d.getTarget());
                        e.put("type", "depends");
                        edges.add(e);
                    } else {
                        String routeId = "r" + (routeCounter++);
                        Map<String, Object> e1 = new LinkedHashMap<>();
                        e1.put("from", "svc:" + s.getId());
                        e1.put("to", "svc:" + d.getVia());
                        e1.put("type", "depends");
                        e1.put("route", routeId);
                        e1.put("viaTarget", d.getTarget());
                        edges.add(e1);
                        Map<String, Object> e2 = new LinkedHashMap<>();
                        e2.put("from", "svc:" + d.getVia());
                        e2.put("to", "svc:" + d.getTarget());
                        e2.put("type", "routes");
                        e2.put("route", routeId);
                        edges.add(e2);
                    }
                }
            }
        }
        return Map.of("nodes", nodes, "edges", edges);
    }

    @GetMapping("/services")
    public List<Map<String, Object>> services() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ServiceNode s : loader.getGraph().getServices()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("name", s.getName());
            m.put("kind", s.getKind() == null ? "service" : s.getKind());
            m.put("groupName", s.getGroup() == null ? "" : s.getGroup());
            out.add(m);
        }
        return out;
    }

    @GetMapping("/service/{serviceId}")
    public Map<String, Object> service(@PathVariable("serviceId") String serviceId) {
        ImpactAnalyzer.ServiceDependencies d = analyzer.analyzeService(serviceId);
        ServiceNode self = null;
        for (ServiceNode s : loader.getGraph().getServices()) {
            if (serviceId.equals(s.getId())) { self = s; break; }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", serviceId);
        out.put("name", self == null || self.getName() == null ? serviceId : self.getName());
        out.put("kind", self == null || self.getKind() == null ? "service" : self.getKind());
        out.put("direct", d.direct());
        List<Map<String, String>> routes = new ArrayList<>();
        for (Dependency dep : d.via()) {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("target", dep.getTarget());
            m.put("via", dep.getVia());
            routes.add(m);
        }
        out.put("via", routes);
        out.put("transitive", d.transitive());
        out.put("impactedDirect", d.impactedDirect());
        out.put("impactedTransitive", d.impactedTransitive());
        return out;
    }

    @GetMapping("/matrix")
    public Map<String, Object> matrix() {
        ServiceGraph g = loader.getGraph();
        List<ServiceNode> services = new ArrayList<>(g.getServices());
        services.sort((a, b) -> {
            String ga = a.getGroup() == null ? "~" : a.getGroup();
            String gb = b.getGroup() == null ? "~" : b.getGroup();
            int c = ga.compareTo(gb);
            if (c != 0) return c;
            String na = a.getName() == null ? a.getId() : a.getName();
            String nb = b.getName() == null ? b.getId() : b.getName();
            return na.compareTo(nb);
        });
        List<Map<String, Object>> svcOut = new ArrayList<>();
        for (ServiceNode s : services) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", s.getId());
            m.put("name", s.getName() == null ? s.getId() : s.getName());
            m.put("group", s.getGroup() == null ? "" : s.getGroup());
            m.put("kind", s.getKind() == null ? "service" : s.getKind());
            svcOut.add(m);
        }
        List<Map<String, Object>> deps = new ArrayList<>();
        for (ServiceNode s : services) {
            if (s.getDependsOn() == null) continue;
            for (Dependency d : s.getDependsOn()) {
                if (d.getTarget() == null) continue;
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("from", s.getId());
                m.put("to", d.getTarget());
                m.put("via", d.getVia());
                deps.add(m);
            }
        }
        return Map.of("services", svcOut, "deps", deps);
    }

    @PostMapping(value = "/graph", consumes = {"application/x-yaml", "text/yaml", MediaType.TEXT_PLAIN_VALUE})
    public Map<String, Object> uploadYaml(@RequestBody String yaml) throws Exception {
        ServiceGraph g = yamlMapper.readValue(yaml, ServiceGraph.class);
        loader.replace(g);
        return Map.of("services", g.getServices().size());
    }

    @GetMapping(value = "/yaml", produces = "application/x-yaml;charset=UTF-8")
    public String exportYaml() throws Exception {
        return yamlMapper.writeValueAsString(loader.getGraph());
    }
}
