package se.valenzuela.blastradius.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;

import java.io.IOException;

@JsonDeserialize(using = Dependency.Deserializer.class)
public class Dependency {
    private String target;
    private String via;

    public Dependency() {}
    public Dependency(String target, String via) {
        this.target = target;
        this.via = via;
    }

    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public String getVia() { return via; }
    public void setVia(String via) { this.via = via; }

    public static class Deserializer extends JsonDeserializer<Dependency> {
        @Override
        public Dependency deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            JsonNode node = p.readValueAsTree();
            Dependency d = new Dependency();
            if (node.isTextual()) {
                d.setTarget(node.asText());
            } else if (node.isObject()) {
                if (node.hasNonNull("target")) d.setTarget(node.get("target").asText());
                if (node.hasNonNull("via")) d.setVia(node.get("via").asText());
            }
            return d;
        }
    }
}