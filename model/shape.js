// @ts-check
// Port of se.valenzuela.blastradius.web.GraphController's response shaping:
// the graph (nodes/edges), service list, single-service detail, and matrix.
// Pure functions over a normalized model — no HTTP.
(function (/** @type {any} */ root, factory) {
  const req = typeof require === 'function';
  const api = factory(
    req ? require('./impact.js') : (root.BR && root.BR.impact),
    req ? require('./pools.js') : (root.BR && root.BR.pools),
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BR = root.BR || {}; root.BR.shape = api; }
})(typeof self !== 'undefined' ? self : globalThis, function (impact, pools) {
  'use strict';

  /** @typedef {{ target: string|null, via: string|null }} Dependency */
  /** @typedef {{ id: string|null, name: string|null, group: string|null, kind: string, loadBalancerPool: string|null, dependsOn: Dependency[] }} ServiceNode */
  /** @typedef {{ services: ServiceNode[] }} ServiceGraph */

  const PREFIX = 'svc:';

  /**
   * Nodes + edges for vis-network. Routed deps become a service→gateway
   * "depends" edge plus a gateway→target "routes" edge sharing a route id.
   * @param {ServiceGraph} model
   */
  function graph(model) {
    const nodes = [];
    const edges = [];
    let routeCounter = 0;

    // A dependency may target an LB pool by name. Such a pool renders as one
    // synthetic node ("the load balancer") that fans out to its members. Built
    // lazily, so pools that are never targeted directly add no clutter.
    const poolMembers = pools.poolIndex(model).members;
    const poolNodesAdded = new Set();
    const ensurePoolNode = (name) => {
      if (poolNodesAdded.has(name)) return;
      poolNodesAdded.add(name);
      nodes.push({
        id: 'pool:' + name,
        label: name,
        group: 'service',
        kind: 'pool',
        groupName: '',
        pool: '',
      });
      for (const m of poolMembers.get(name)) {
        edges.push({ from: 'pool:' + name, to: PREFIX + m, type: 'pool' });
      }
    };
    // The node a dependency leg points at: the synthetic pool node when it names
    // an LB pool, otherwise the plain service node.
    const targetId = (t) => {
      if (poolMembers.has(t)) { ensurePoolNode(t); return 'pool:' + t; }
      return PREFIX + t;
    };

    for (const s of model.services) {
      nodes.push({
        id: PREFIX + s.id,
        label: s.name == null ? s.id : s.name,
        group: 'service',
        kind: s.kind == null ? 'service' : s.kind,
        groupName: s.group == null ? '' : s.group,
        pool: s.loadBalancerPool == null ? '' : s.loadBalancerPool,
      });
      for (const d of s.dependsOn) {
        if (d.target == null) continue;
        if (d.via == null) {
          edges.push({ from: PREFIX + s.id, to: targetId(d.target), type: 'depends' });
        } else {
          const routeId = 'r' + routeCounter++;
          const viaId = targetId(d.via);
          edges.push({ from: PREFIX + s.id, to: viaId, type: 'depends', route: routeId, viaTarget: d.target, gateway: viaId });
          edges.push({ from: viaId, to: targetId(d.target), type: 'routes', route: routeId, gateway: viaId });
        }
      }
    }
    return { nodes, edges };
  }

  /**
   * Flat service list for the sidebar. (Fixes review #9: name falls back to id
   * here, consistent with the other endpoints, unlike the original Java.)
   * @param {ServiceGraph} model
   */
  function services(model) {
    return model.services.map((s) => ({
      id: s.id,
      name: s.name == null ? s.id : s.name,
      kind: s.kind == null ? 'service' : s.kind,
      groupName: s.group == null ? '' : s.group,
    }));
  }

  /**
   * Single-service detail: dependency breakdown + blast radius.
   * @param {ServiceGraph} model
   * @param {string} serviceId
   */
  function serviceDetail(model, serviceId) {
    const d = impact.analyzeService(model, serviceId);
    let self = null;
    for (const s of model.services) {
      if (s.id === serviceId) { self = s; break; }
    }
    return {
      id: serviceId,
      name: self == null || self.name == null ? serviceId : self.name,
      kind: self == null || self.kind == null ? 'service' : self.kind,
      direct: d.direct,
      via: d.via.map((dep) => ({ target: dep.target, via: dep.via })),
      transitive: d.transitive,
      impactedDirect: d.impactedDirect,
      impactedTransitive: d.impactedTransitive,
    };
  }

  /**
   * Adjacency matrix payload: services sorted by group then name, plus the
   * raw dependency edges. (Services with no group sort last, as in the Java.)
   * @param {ServiceGraph} model
   */
  function matrix(model) {
    const sorted = model.services.slice().sort((a, b) => {
      const ga = a.group == null ? '~' : a.group;
      const gb = b.group == null ? '~' : b.group;
      if (ga !== gb) return ga < gb ? -1 : 1;
      const na = a.name == null ? a.id : a.name;
      const nb = b.name == null ? b.id : b.name;
      return (na || '') < (nb || '') ? -1 : (na || '') > (nb || '') ? 1 : 0;
    });
    const svcOut = sorted.map((s) => ({
      id: s.id,
      name: s.name == null ? s.id : s.name,
      group: s.group == null ? '' : s.group,
      kind: s.kind == null ? 'service' : s.kind,
    }));
    // The matrix is service x service with no pool column, so a dependency that
    // targets an LB pool by name is expanded to one edge per member.
    const poolMembers = pools.poolIndex(model).members;
    const deps = [];
    for (const s of sorted) {
      for (const d of s.dependsOn) {
        if (d.target == null) continue;
        const targets = poolMembers.has(d.target) ? poolMembers.get(d.target) : [d.target];
        for (const t of targets) deps.push({ from: s.id, to: t, via: d.via });
      }
    }
    return { services: svcOut, deps };
  }

  return { graph, services, serviceDetail, matrix };
});
