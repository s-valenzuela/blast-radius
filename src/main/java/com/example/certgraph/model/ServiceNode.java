package com.example.certgraph.model;

import java.util.ArrayList;
import java.util.List;

public class ServiceNode {
    private String id;
    private String name;
    private String team;
    private List<String> certs = new ArrayList<>();
    private List<String> dependsOn = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }
    public List<String> getCerts() { return certs; }
    public void setCerts(List<String> certs) { this.certs = certs; }
    public List<String> getDependsOn() { return dependsOn; }
    public void setDependsOn(List<String> dependsOn) { this.dependsOn = dependsOn; }
}
