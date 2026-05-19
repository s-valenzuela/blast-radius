package com.example.certgraph.model;

import java.util.ArrayList;
import java.util.List;

public class CertGraph {
    private List<Certificate> certificates = new ArrayList<>();
    private List<ServiceNode> services = new ArrayList<>();

    public List<Certificate> getCertificates() { return certificates; }
    public void setCertificates(List<Certificate> certificates) { this.certificates = certificates; }
    public List<ServiceNode> getServices() { return services; }
    public void setServices(List<ServiceNode> services) { this.services = services; }
}
