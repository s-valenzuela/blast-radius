package se.valenzuela.blastradius.model;

import java.util.ArrayList;
import java.util.List;

public class ServiceGraph {
    private List<ServiceNode> services = new ArrayList<>();

    public List<ServiceNode> getServices() { return services; }
    public void setServices(List<ServiceNode> services) { this.services = services; }
}
