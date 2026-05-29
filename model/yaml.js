// @ts-check
// YAML export. Import is just `parse.normalize(yamlLib.load(text))` at the call
// site; the non-trivial half is dumping the model back to YAML that matches the
// original style (omit null/empty fields, object-form deps with via only when
// present). The YAML library is injected so this works with the vendored global
// `jsyaml` in the browser and the `js-yaml` package under node/vitest.
(function (/** @type {any} */ root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.BR = root.BR || {}; root.BR.yaml = api; }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /** @typedef {{ target: string|null, via: string|null }} Dependency */
  /** @typedef {{ id: string|null, name: string|null, group: string|null, kind: string, loadBalancerPool: string|null, dependsOn: Dependency[] }} ServiceNode */
  /** @typedef {{ services: ServiceNode[] }} ServiceGraph */

  /** @param {*} v */
  const nonEmpty = (v) => v != null && v !== '';

  /**
   * Build the plain object to serialize, applying NON_EMPTY semantics and the
   * id/name/group/kind/loadBalancerPool/dependsOn key order the Java export used.
   * @param {ServiceGraph} model
   */
  function toExportObject(model) {
    return {
      services: model.services.map((s) => {
        /** @type {Record<string, any>} */
        const o = {};
        if (nonEmpty(s.id)) o.id = s.id;
        if (nonEmpty(s.name)) o.name = s.name;
        if (nonEmpty(s.group)) o.group = s.group;
        if (nonEmpty(s.kind)) o.kind = s.kind;
        if (nonEmpty(s.loadBalancerPool)) o.loadBalancerPool = s.loadBalancerPool;
        if (s.dependsOn && s.dependsOn.length) {
          o.dependsOn = s.dependsOn.map((d) => {
            /** @type {Record<string, any>} */
            const dd = { target: d.target };
            if (nonEmpty(d.via)) dd.via = d.via;
            return dd;
          });
        }
        return o;
      }),
    };
  }

  /**
   * @param {ServiceGraph} model
   * @param {{ dump: (o: any, opts?: any) => string }} yamlLib  injected js-yaml / jsyaml
   * @returns {string}
   */
  function dump(model, yamlLib) {
    return yamlLib.dump(toExportObject(model), { lineWidth: -1, noRefs: true });
  }

  return { toExportObject, dump };
});
