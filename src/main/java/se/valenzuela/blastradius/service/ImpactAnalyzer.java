package se.valenzuela.blastradius.service;

import se.valenzuela.blastradius.model.ServiceGraph;
import se.valenzuela.blastradius.model.Dependency;
import se.valenzuela.blastradius.model.ServiceNode;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class ImpactAnalyzer {

    private final GraphLoader loader;

    public ImpactAnalyzer(GraphLoader loader) {
        this.loader = loader;
    }

    public ServiceDependencies analyzeService(String serviceId) {
        ServiceGraph g = loader.getGraph();
        ServiceNode self = null;
        for (ServiceNode s : g.getServices()) {
            if (serviceId.equals(s.getId())) { self = s; break; }
        }
        if (self == null) {
            return new ServiceDependencies(serviceId, List.of(), List.of(), List.of(), List.of(), List.of());
        }

        List<String> direct = new ArrayList<>();
        List<Dependency> via = new ArrayList<>();
        if (self.getDependsOn() != null) {
            for (Dependency d : self.getDependsOn()) {
                if (d.getVia() == null) {
                    if (d.getTarget() != null) direct.add(d.getTarget());
                } else {
                    via.add(d);
                }
            }
        }

        Map<String, List<String>> forward = forwardDependencyMap(g);
        Set<String> seeds = new HashSet<>();
        seeds.addAll(direct);
        for (Dependency d : via) {
            if (d.getTarget() != null) seeds.add(d.getTarget());
            if (d.getVia() != null) seeds.add(d.getVia());
        }

        Set<String> visited = new LinkedHashSet<>(seeds);
        Deque<String> stack = new ArrayDeque<>(seeds);
        Set<String> transitive = new LinkedHashSet<>();
        while (!stack.isEmpty()) {
            String cur = stack.pop();
            for (String next : forward.getOrDefault(cur, List.of())) {
                if (visited.add(next)) {
                    transitive.add(next);
                    stack.push(next);
                }
            }
        }

        Map<String, List<String>> reverse = reverseDependencyMap(g);
        List<String> impactedDirect = new ArrayList<>(
                new LinkedHashSet<>(reverse.getOrDefault(serviceId, List.of())));
        Set<String> impactSeen = new HashSet<>(impactedDirect);
        impactSeen.add(serviceId);
        Set<String> impactedTransitive = new LinkedHashSet<>();
        Deque<String> impactStack = new ArrayDeque<>(impactedDirect);
        while (!impactStack.isEmpty()) {
            String cur = impactStack.pop();
            for (String upstream : reverse.getOrDefault(cur, List.of())) {
                if (impactSeen.add(upstream)) {
                    impactedTransitive.add(upstream);
                    impactStack.push(upstream);
                }
            }
        }

        return new ServiceDependencies(serviceId, direct, via, new ArrayList<>(transitive),
                impactedDirect, new ArrayList<>(impactedTransitive));
    }

    private Map<String, List<String>> reverseDependencyMap(ServiceGraph g) {
        Map<String, List<String>> reverse = new HashMap<>();
        for (ServiceNode s : g.getServices()) {
            if (s.getDependsOn() == null) continue;
            for (Dependency dep : s.getDependsOn()) {
                if (dep.getTarget() != null)
                    reverse.computeIfAbsent(dep.getTarget(), k -> new ArrayList<>()).add(s.getId());
                if (dep.getVia() != null)
                    reverse.computeIfAbsent(dep.getVia(), k -> new ArrayList<>()).add(s.getId());
            }
        }
        return reverse;
    }

    private Map<String, List<String>> forwardDependencyMap(ServiceGraph g) {
        Map<String, List<String>> forward = new HashMap<>();
        for (ServiceNode s : g.getServices()) {
            List<String> targets = new ArrayList<>();
            if (s.getDependsOn() != null) {
                for (Dependency dep : s.getDependsOn()) {
                    if (dep.getTarget() != null) targets.add(dep.getTarget());
                    if (dep.getVia() != null) targets.add(dep.getVia());
                }
            }
            forward.put(s.getId(), targets);
        }
        return forward;
    }

    public record ServiceDependencies(String serviceId, List<String> direct, List<Dependency> via,
                                       List<String> transitive,
                                       List<String> impactedDirect, List<String> impactedTransitive) {}
}
