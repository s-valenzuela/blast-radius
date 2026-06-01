// @ts-check
// Port of se.valenzuela.blastradius.service.ImpactAnalyzer.
// Forward BFS = what a service depends on (direct + transitive); reverse BFS =
// what depends on it (impacted if it goes down). Routed deps contribute edges to
// BOTH the target and the via gateway, matching the Java forward/reverse maps.
(function (/** @type {any} */ root, factory) {
  const api = factory(typeof require === 'function' ? require('./pools.js') : (root.BR && root.BR.pools));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BR = root.BR || {}; root.BR.impact = api; }
})(typeof self !== 'undefined' ? self : globalThis, function (pools) {
  'use strict';

  // Shape mirrors model/parse.js (typedefs aren't shared across the CJS/UMD
  // boundary, so they're restated here).
  /** @typedef {{ target: string|null, via: string|null }} Dependency */
  /** @typedef {{ id: string|null, name: string|null, group: string|null, kind: string, loadBalancerPool: string|null, dependsOn: Dependency[] }} ServiceNode */
  /** @typedef {{ services: ServiceNode[] }} ServiceGraph */
  /**
   * @typedef {{
   *   serviceId: string,
   *   direct: string[],
   *   via: Dependency[],
   *   transitive: string[],
   *   impactedDirect: string[],
   *   impactedTransitive: string[]
   * }} ServiceDependencies
   */

  // --- Load-balancer pools as logical units ---------------------------------
  // A pool is treated as a single node in the dependency graph: every member is
  // interchangeable, so depending on one member (or on the pool name) means
  // depending on the pool, and the pool is the unit whose blast radius we trace.
  // The closure runs in "unit space" (pool name, or service id when unpooled)
  // and is expanded back to concrete service ids in the output. The pool index
  // (id <-> pool maps) is shared with shape.js via model/pools.js.

  /** The logical unit a service id belongs to: its pool, or itself. */
  function unitOf(id, idx) { return idx.memberOf.get(id) || id; }

  /**
   * The unit a dependency target refers to: a pool name stays the pool, a pooled
   * member collapses to its pool, anything else is itself.
   */
  function targetUnit(t, idx) {
    if (idx.members.has(t)) return t;
    return idx.memberOf.get(t) || t;
  }

  /** Concrete service ids a unit expands to (pool members, or the id itself). */
  function expandUnit(u, idx) {
    return idx.members.has(u) ? idx.members.get(u).slice() : [u];
  }

  /**
   * Forward adjacency in unit space: unit -> units it depends on.
   * @param {ServiceGraph} g
   * @param {{ memberOf: Map<string,string>, members: Map<string,string[]> }} [idx]
   * @returns {Map<string, string[]>}
   */
  function forwardMap(g, idx) {
    idx = idx || pools.poolIndex(g);
    /** @type {Map<string, Set<string>>} */
    const forward = new Map();
    for (const s of g.services) {
      if (s.id == null) continue;
      const u = unitOf(s.id, idx);
      let set = forward.get(u);
      if (!set) { set = new Set(); forward.set(u, set); }
      for (const dep of s.dependsOn) {
        if (dep.target != null) set.add(targetUnit(dep.target, idx));
        if (dep.via != null) set.add(targetUnit(dep.via, idx));
      }
    }
    const out = new Map();
    for (const [k, set] of forward) out.set(k, [...set]);
    return out;
  }

  /**
   * Reverse adjacency in unit space: unit -> units that depend on it.
   * @param {ServiceGraph} g
   * @param {{ memberOf: Map<string,string>, members: Map<string,string[]> }} [idx]
   * @returns {Map<string, string[]>}
   */
  function reverseMap(g, idx) {
    idx = idx || pools.poolIndex(g);
    /** @type {Map<string, Set<string>>} */
    const reverse = new Map();
    const add = (key, from) => {
      let set = reverse.get(key);
      if (!set) { set = new Set(); reverse.set(key, set); }
      set.add(from);
    };
    for (const s of g.services) {
      if (s.id == null) continue;
      const u = unitOf(s.id, idx);
      for (const dep of s.dependsOn) {
        if (dep.target != null) add(targetUnit(dep.target, idx), u);
        if (dep.via != null) add(targetUnit(dep.via, idx), u);
      }
    }
    const out = new Map();
    for (const [k, set] of reverse) out.set(k, [...set]);
    return out;
  }

  /**
   * @param {ServiceGraph} model
   * @param {string} serviceId
   * @returns {ServiceDependencies}
   */
  function analyzeService(model, serviceId) {
    let self = null;
    for (const s of model.services) {
      if (s.id === serviceId) { self = s; break; }
    }
    if (self == null) {
      return { serviceId, direct: [], via: [], transitive: [], impactedDirect: [], impactedTransitive: [] };
    }

    const idx = pools.poolIndex(model);
    const selfUnit = unitOf(serviceId, idx);
    const selfMembers = new Set(expandUnit(selfUnit, idx));

    // Declared deps of the clicked service (shown verbatim, per instance).
    /** @type {string[]} */
    const direct = [];
    /** @type {Dependency[]} */
    const via = [];
    for (const d of self.dependsOn) {
      if (d.via == null) {
        if (d.target != null) direct.push(d.target);
      } else {
        via.push(d);
      }
    }

    const forward = forwardMap(model, idx);
    const reverse = reverseMap(model, idx);

    // Forward closure over units. Seeds = the units this whole pool depends on
    // (aggregated across members so every instance gives the same closure).
    const seeds = new Set();
    for (const s of model.services) {
      if (s.id == null || unitOf(s.id, idx) !== selfUnit) continue;
      for (const d of s.dependsOn) {
        if (d.target != null) seeds.add(targetUnit(d.target, idx));
        if (d.via != null) seeds.add(targetUnit(d.via, idx));
      }
    }
    const visited = new Set(seeds);
    visited.add(selfUnit);
    const stack = [...seeds];
    while (stack.length) {
      const cur = /** @type {string} */ (stack.pop());
      for (const next of forward.get(cur) || []) {
        if (!visited.has(next)) { visited.add(next); stack.push(next); }
      }
    }
    // Transitive = members of every reached unit, minus self and anything already
    // listed as a direct/routed dep (including the routed gateways).
    const shown = new Set(selfMembers);
    for (const t of direct) shown.add(t);
    for (const d of via) { if (d.target != null) shown.add(d.target); if (d.via != null) shown.add(d.via); }
    /** @type {string[]} */
    const transitive = [];
    const transSeen = new Set();
    for (const u of visited) {
      for (const m of expandUnit(u, idx)) {
        if (!shown.has(m) && !transSeen.has(m)) { transSeen.add(m); transitive.push(m); }
      }
    }

    // Reverse closure over units (blast radius). Anything depending on a pool
    // member depends on the pool, so all members share the same dependents.
    /** @type {string[]} */
    const impactedDirect = [];
    const impDirectSeen = new Set();
    for (const u of reverse.get(selfUnit) || []) {
      for (const m of expandUnit(u, idx)) {
        if (!selfMembers.has(m) && !impDirectSeen.has(m)) { impDirectSeen.add(m); impactedDirect.push(m); }
      }
    }
    const impSeenUnits = new Set([selfUnit, ...(reverse.get(selfUnit) || [])]);
    const impStack = [...(reverse.get(selfUnit) || [])];
    /** @type {string[]} */
    const impactedTransitive = [];
    const impTransSeen = new Set();
    while (impStack.length) {
      const cur = /** @type {string} */ (impStack.pop());
      for (const up of reverse.get(cur) || []) {
        if (impSeenUnits.has(up)) continue;
        impSeenUnits.add(up);
        impStack.push(up);
        for (const m of expandUnit(up, idx)) {
          if (!selfMembers.has(m) && !impDirectSeen.has(m) && !impTransSeen.has(m)) {
            impTransSeen.add(m);
            impactedTransitive.push(m);
          }
        }
      }
    }

    return { serviceId, direct, via, transitive, impactedDirect, impactedTransitive };
  }

  return { forwardMap, reverseMap, analyzeService };
});
