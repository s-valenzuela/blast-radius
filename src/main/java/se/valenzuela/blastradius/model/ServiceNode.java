package se.valenzuela.blastradius.model;

import java.util.ArrayList;
import java.util.List;

public class ServiceNode {
    private String id;
    private String name;
    private String group;
    private String kind = "service";
    private String loadBalancerPool;
    private List<Dependency> dependsOn = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getGroup() { return group; }
    public void setGroup(String group) { this.group = group; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getLoadBalancerPool() { return loadBalancerPool; }
    public void setLoadBalancerPool(String loadBalancerPool) { this.loadBalancerPool = loadBalancerPool; }
    public List<Dependency> getDependsOn() { return dependsOn; }
    public void setDependsOn(List<Dependency> dependsOn) { this.dependsOn = dependsOn; }
}