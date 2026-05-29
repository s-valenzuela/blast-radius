// @ts-check
// Port of se.valenzuela.blastradius.service.ImpactAnalyzer.
// Forward BFS = what a service depends on (direct + transitive); reverse BFS =
// what depends on it (impacted if it goes down). Routed deps contribute edges to
// BOTH the target and the via gateway, matching the Java forward/reverse maps.
(function (/** @type {any} */ root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BR = root.BR || {}; root.BR.impact = api; }
})(typeof self !== 'undefined' ? self : globalThis, function () {
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

  /**
   * @param {ServiceGraph} g
   * @returns {Map<string, string[]>}
   */
  function forwardMap(g) {
    const forward = new Map();
    for (const s of g.services) {
      const targets = [];
      for (const dep of s.dependsOn) {
        if (dep.target != null) targets.push(dep.target);
        if (dep.via != null) targets.push(dep.via);
      }
      if (s.id != null) forward.set(s.id, targets);
    }
    return forward;
  }

  /**
   * @param {ServiceGraph} g
   * @returns {Map<string, string[]>}
   */
  function reverseMap(g) {
    const reverse = new Map();
    /** @param {string} key @param {string} from */
    const add = (key, from) => {
      if (!reverse.has(key)) reverse.set(key, []);
      reverse.get(key).push(from);
    };
    for (const s of g.services) {
      if (s.id == null) continue;
      for (const dep of s.dependsOn) {
        if (dep.target != null) add(dep.target, s.id);
        if (dep.via != null) add(dep.via, s.id);
      }
    }
    return reverse;
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

    const forward = forwardMap(model);

    // Forward closure. Seeds = direct deps + both legs of every routed dep.
    const seeds = new Set(direct);
    for (const d of via) {
      if (d.target != null) seeds.add(d.target);
      if (d.via != null) seeds.add(d.via);
    }
    const visited = new Set(seeds);
    const stack = [...seeds];
    /** @type {string[]} */
    const transitive = [];
    while (stack.length) {
      const cur = /** @type {string} */ (stack.pop());
      for (const next of forward.get(cur) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          transitive.push(next);
          stack.push(next);
        }
      }
    }

    // Reverse closure (blast radius).
    const reverse = reverseMap(model);
    const impactedDirect = [...new Set(reverse.get(serviceId) || [])];
    const impactSeen = new Set(impactedDirect);
    impactSeen.add(serviceId);
    /** @type {string[]} */
    const impactedTransitive = [];
    const impactStack = [...impactedDirect];
    while (impactStack.length) {
      const cur = /** @type {string} */ (impactStack.pop());
      for (const upstream of reverse.get(cur) || []) {
        if (!impactSeen.has(upstream)) {
          impactSeen.add(upstream);
          impactedTransitive.push(upstream);
          impactStack.push(upstream);
        }
      }
    }

    return { serviceId, direct, via, transitive, impactedDirect, impactedTransitive };
  }

  return { forwardMap, reverseMap, analyzeService };
});
