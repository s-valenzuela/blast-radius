// @ts-check
// Shared load-balancer pool index. Maps each pooled service id to its pool and
// each pool to its members. Used by the impact analyzer (which treats a pool as
// one logical unit) and by graph/matrix shaping (synthetic pool nodes, member
// expansion), so the "build pool -> members" logic lives in exactly one place.
(function (/** @type {any} */ root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BR = root.BR || {}; root.BR.pools = api; }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /** @typedef {{ id: string|null, loadBalancerPool: string|null }} PooledService */
  /** @typedef {{ services: PooledService[] }} ServiceGraph */
  /** @typedef {{ memberOf: Map<string,string>, members: Map<string,string[]> }} PoolIndex */

  /**
   * @param {ServiceGraph} model
   * @returns {PoolIndex}
   */
  function poolIndex(model) {
    /** @type {Map<string,string>} */
    const memberOf = new Map();
    /** @type {Map<string,string[]>} */
    const members = new Map();
    for (const s of model.services) {
      if (s.id == null) continue;
      const p = s.loadBalancerPool;
      if (p == null || p === '') continue;
      memberOf.set(s.id, p);
      if (!members.has(p)) members.set(p, []);
      members.get(p).push(s.id);
    }
    return { memberOf, members };
  }

  return { poolIndex };
});
