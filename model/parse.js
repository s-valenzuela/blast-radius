// @ts-check
// Port of the Java model layer: Dependency.Deserializer + ServiceNode/ServiceGraph
// defaults. Takes the raw object produced by a YAML parse and normalizes it into
// the in-memory graph the rest of the app consumes.
(function (/** @type {any} */ root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BR = root.BR || {}; root.BR.parse = api; }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /** @typedef {{ target: string|null, via: string|null }} Dependency */
  /** @typedef {{ id: string|null, name: string|null, group: string|null, kind: string, loadBalancerPool: string|null, dependsOn: Dependency[] }} ServiceNode */
  /** @typedef {{ services: ServiceNode[] }} ServiceGraph */

  /**
   * Accept either a bare string target (`- foo`) or an object
   * (`- { target: foo, via: bar }`). Mirrors Dependency.Deserializer.
   * @param {*} entry
   * @returns {Dependency}
   */
  function normalizeDep(entry) {
    if (typeof entry === 'string') return { target: entry, via: null };
    if (entry && typeof entry === 'object') {
      return {
        target: entry.target != null ? String(entry.target) : null,
        via: entry.via != null ? String(entry.via) : null,
      };
    }
    return { target: null, via: null };
  }

  /**
   * Normalize a raw parsed YAML object into a ServiceGraph, applying the same
   * defaults the Java model used (kind defaults to "service", dependsOn to []).
   * @param {*} raw
   * @returns {ServiceGraph}
   */
  function normalize(raw) {
    const services = raw && Array.isArray(raw.services) ? raw.services : [];
    return {
      services: services.map(function (s) {
        s = s || {};
        return {
          id: s.id != null ? String(s.id) : null,
          name: s.name != null ? String(s.name) : null,
          group: s.group != null ? String(s.group) : null,
          kind: s.kind != null ? String(s.kind) : 'service',
          loadBalancerPool: s.loadBalancerPool != null ? String(s.loadBalancerPool) : null,
          dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn.map(normalizeDep) : [],
        };
      }),
    };
  }

  return { normalizeDep, normalize };
});
