package com.example.certgraph.service;

import com.example.certgraph.model.CertGraph;
import com.example.certgraph.model.ServiceNode;
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

    public Impact analyzeCert(String certId) {
        CertGraph g = loader.getGraph();

        Set<String> direct = new LinkedHashSet<>();
        for (ServiceNode s : g.getServices()) {
            if (s.getCerts() != null && s.getCerts().contains(certId)) {
                direct.add(s.getId());
            }
        }

        Map<String, List<String>> reverseDeps = new HashMap<>();
        for (ServiceNode s : g.getServices()) {
            if (s.getDependsOn() == null) continue;
            for (String dep : s.getDependsOn()) {
                reverseDeps.computeIfAbsent(dep, k -> new ArrayList<>()).add(s.getId());
            }
        }

        Set<String> transitive = new LinkedHashSet<>();
        Deque<String> stack = new ArrayDeque<>(direct);
        Set<String> seen = new HashSet<>(direct);
        while (!stack.isEmpty()) {
            String cur = stack.pop();
            for (String upstream : reverseDeps.getOrDefault(cur, List.of())) {
                if (seen.add(upstream)) {
                    transitive.add(upstream);
                    stack.push(upstream);
                }
            }
        }

        return new Impact(certId, new ArrayList<>(direct), new ArrayList<>(transitive));
    }

    public record Impact(String certId, List<String> directlyAffected, List<String> transitivelyAffected) {}
}
