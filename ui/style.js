// @ts-check
// View styling: DOM lookup helpers, LB icons, the active theme colors,
// and the color/group helpers shared across the views.

let COLORS = COLOR_THEMES.dark;

// Loosely-typed DOM lookups. Vanilla JS reads element-specific props (.value,
// .dataset, .style, .offsetWidth) off lookups that the DOM lib types as the base
// Element/HTMLElement, so these helpers return `any` to keep call sites clean
// while the gate still checks the rest of the logic.
/** @param {string} id @returns {any} */
function el(id) { return document.getElementById(id); }
/** @param {string} sel @param {ParentNode} [root] @returns {any} */
function qs(sel, root) { return (root || document).querySelector(sel); }
/** @param {string} sel @param {ParentNode} [root] @returns {NodeListOf<any>} */
function qsa(sel, root) { return (root || document).querySelectorAll(sel); }

function lbIconWithStroke(stroke) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<polygon points="50,5 95,38 78,92 22,92 5,38" fill="#0b1220" stroke="' + stroke + '" stroke-width="6"/>' +
    '</svg>'
  );
}
const LB_ICON_SVG    = lbIconWithStroke('#94a3b8');
const LB_ICON_DIRECT = lbIconWithStroke('#ef4444');
const LB_ICON_TRANS  = lbIconWithStroke('#fb923c');

function colorPoolsForImpact(directSet, transSet) {
  const pools = {};
  for (const n of allNodes) {
    if (!n.pool) continue;
    (pools[n.pool] = pools[n.pool] || []).push(n.id);
  }
  for (const pool of Object.keys(pools)) {
    let img = LB_ICON_SVG;
    for (const id of pools[pool]) {
      if (directSet.has(id)) { img = LB_ICON_DIRECT; break; }
      if (transSet.has(id)) img = LB_ICON_TRANS;
    }
    const lbId = 'lb:' + pool;
    if (collapsedPools.has(pool)) {
      if (network && network.updateClusteredNode) network.updateClusteredNode(lbId, { image: img });
    } else if (nodesDS && nodesDS.get(lbId)) {
      nodesDS.update({ id: lbId, image: img });
    }
  }
}

function nodeFontColor() {
  return document.documentElement.dataset.theme === 'light' ? '#0f172a' : '#e2e8f0';
}

// Routed edges are colored by their gateway, so both legs of a call (caller→gw,
// gw→target) and every route sharing a gateway get one consistent color.
function gatewayColor(gatewayId) {
  let h = 0;
  for (let i = 0; i < gatewayId.length; i++) h = (h * 31 + gatewayId.charCodeAt(i)) & 0xffff;
  return ROUTE_PALETTE[h % ROUTE_PALETTE.length];
}

const groupColorCache = {};
function registerGroups(names) {
  const unique = [...new Set(names.filter(n => n))].sort();
  const stride = 3;
  let next = 0;
  for (const name of unique) {
    if (groupColorCache[name]) continue;
    while (Object.values(groupColorCache).includes(GROUP_PALETTE[next % GROUP_PALETTE.length])
           && next < GROUP_PALETTE.length) next++;
    groupColorCache[name] = GROUP_PALETTE[next % GROUP_PALETTE.length];
    next += stride;
  }
}
function groupColor(group) {
  return group ? groupColorCache[group] || null : null;
}

function groupCohesionEdges() {
  const groups = {};
  for (const n of allNodes) {
    if (!n.groupName) continue;
    (groups[n.groupName] = groups[n.groupName] || []).push(n.id);
  }
  const edges = [];
  for (const g in groups) {
    const ids = groups[g];
    const length = Math.round(180 * Math.sqrt(ids.length));
    for (let i = 1; i < ids.length; i++) {
      edges.push({
        id: 'cohesion:' + g + ':' + i,
        from: ids[0],
        to: ids[i],
        hidden: true,
        physics: true,
        length,
        color: { opacity: 0 },
      });
    }
  }
  return edges;
}
