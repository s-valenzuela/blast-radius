// @ts-check
// Selection + highlighting (service and group), reset, and theme switching.

function setActive(btn) {
  document.querySelectorAll('.item.active').forEach(el => el.classList.remove('active'));
  qsa('[data-kind="group"]').forEach(g => { g.style.outline = ''; g.style.outlineOffset = ''; });
  selectedGroupNames.clear();
  if (btn) {
    btn.classList.add('active');
    const group = btn.closest('.svc-group');
    if (group && group.classList.contains('collapsed')) {
      group.classList.remove('collapsed');
      const chev = group.querySelector('.chev');
      if (chev) chev.textContent = '▾';
    }
  }
}

function selectGroup(groupName, chipEl, additive) {
  document.querySelectorAll('.item.active').forEach(el => el.classList.remove('active'));

  if (additive) {
    if (selectedGroupNames.has(groupName)) selectedGroupNames.delete(groupName);
    else selectedGroupNames.add(groupName);
  } else {
    selectedGroupNames.clear();
    selectedGroupNames.add(groupName);
  }

  qsa('[data-kind="group"]').forEach(g => {
    if (selectedGroupNames.has(g.dataset.id)) {
      const c = groupColor(g.dataset.id);
      g.style.outline = `2px solid ${c}`;
      g.style.outlineOffset = '1px';
    } else {
      g.style.outline = '';
      g.style.outlineOffset = '';
    }
  });

  if (selectedGroupNames.size === 0) {
    resetView();
    return;
  }

  const members = new Set(allNodes.filter(n => selectedGroupNames.has(n.groupName)).map(n => n.id));
  const nodeUpdates = allNodes.map(n => ({
    id: n.id,
    color: members.has(n.id) ? nodeColor(n) : COLORS.dim,
  }));
  nodesDS.update(nodeUpdates);

  const edgeUpdates = allEdges.map(e => {
    const inside = members.has(e.from) && members.has(e.to);
    const base = e.color.color;
    return { id: e.id, color: { color: inside ? base : '#1f2937', highlight: base }, width: inside ? 2 : 1 };
  });
  edgesDS.update(edgeUpdates);

  const groupList = [...selectedGroupNames].sort();
  const memberItems = allNodes
    .filter(n => selectedGroupNames.has(n.groupName))
    .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  const chipsHtml = groupList.map(g => {
    const c = groupColor(g) || '#94a3b8';
    return `<span style="background:${c}22;color:${c};border:1px solid ${c}66;padding:2px 8px;border-radius:10px;font-size:11px;margin-right:4px;">${g}</span>`;
  }).join('');
  document.getElementById('impact').innerHTML = `
    <div><b>${groupList.length} group${groupList.length === 1 ? '' : 's'} selected</b> &middot; ${members.size} service(s)</div>
    <div style="margin-top:8px;">${chipsHtml}</div>
    <div style="margin-top:8px;color:var(--text-muted);font-weight:600;font-size:11px;">Members</div>
    <ul>${memberItems.map(n => `<li>${n.label}</li>`).join('')}</ul>
    <div style="margin-top:6px;font-size:11px;color:var(--text-muted);">Tip: Ctrl/Cmd-click another group chip to add it.</div>
  `;
}

function selectService(svcId, btn) {
  setActive(btn);

  const r = BR.shape.serviceDetail(model, svcId);
  // A dependency id may name an LB pool; if a synthetic pool node exists for it,
  // map to that, otherwise to the service node.
  const poolNodeIds = new Set(allNodes.filter(n => n.kind === 'pool').map(n => n.id));
  const toNodeId = (id) => poolNodeIds.has('pool:' + id) ? 'pool:' + id : 'svc:' + id;
  const self = 'svc:' + svcId;
  const directSet = new Set(r.direct.map(toNodeId));
  const viaTargets = new Set();
  const viaGateways = new Set();
  for (const v of r.via) { viaTargets.add(toNodeId(v.target)); viaGateways.add(toNodeId(v.via)); }
  const transSet = new Set(r.transitive.map(toNodeId));
  const impactDirectSet = new Set((r.impactedDirect || []).map(toNodeId));
  const impactTransSet = new Set((r.impactedTransitive || []).map(toNodeId));

  const nodeUpdates = allNodes.map(n => {
    let color = COLORS.dim;
    if (n.id === self)                 color = nodeColor(n);
    else if (directSet.has(n.id))      color = COLORS.direct;
    else if (viaTargets.has(n.id))     color = COLORS.direct;
    else if (viaGateways.has(n.id))    color = COLORS.gatewayHit;
    else if (impactDirectSet.has(n.id)) color = COLORS.direct;
    else if (transSet.has(n.id))       color = COLORS.trans;
    else if (impactTransSet.has(n.id)) color = COLORS.trans;
    return { id: n.id, color };
  });
  nodesDS.update(nodeUpdates);

  // highlight outgoing edges from self, gateway->target legs, and incoming edges from upstream impact
  const edgeUpdates = allEdges.map(e => {
    let dim = true;
    if (e.from === self) dim = false;
    if (e.etype === 'routes' && viaGateways.has(e.from) && viaTargets.has(e.to)) dim = false;
    if (e.etype === 'pool' && (directSet.has(e.from) || transSet.has(e.from))) dim = false;
    if (e.to === self && impactDirectSet.has(e.from)) dim = false;
    const base = e.color.color;
    return { id: e.id, color: { color: dim ? '#1f2937' : base, highlight: base }, width: dim ? 1 : 2 };
  });
  edgesDS.update(edgeUpdates);

  const poolsDirect = new Set([...directSet, ...viaTargets, ...impactDirectSet]);
  const poolsTrans  = new Set([...transSet, ...impactTransSet]);
  colorPoolsForImpact(poolsDirect, poolsTrans);

  const list = (ids) => ids.length
    ? '<ul>' + ids.map(i => `<li>${i}</li>`).join('') + '</ul>'
    : '<em style="color:var(--text-faint)">none</em>';
  const routeList = (rs) => rs.length
    ? '<ul>' + rs.map(v => `<li>${v.target} <span style="color:var(--text-muted)">via</span> <b style="color:var(--accent-routed)">${v.via}</b></li>`).join('') + '</ul>'
    : '<em style="color:var(--text-faint)">none</em>';
  const kindBadge = r.kind && r.kind !== 'service' ? `<span class="badge kind">${r.kind}</span>` : '';

  document.getElementById('impact').innerHTML = `
    <div><b>${r.name || svcId}</b> ${kindBadge}<div style="font-size:11px;color:var(--text-muted);">${svcId}</div></div>
    <div style="margin-top:8px;color:var(--accent-direct);font-weight:600;">Direct dependencies</div>
    ${list(r.direct)}
    <div style="margin-top:6px;color:var(--accent-routed);font-weight:600;">Routed (via gateway)</div>
    ${routeList(r.via)}
    <div style="margin-top:6px;color:var(--accent-trans);font-weight:600;">Transitive</div>
    ${list(r.transitive)}
    <div style="margin-top:10px;color:var(--accent-impact);font-weight:600;">Impacted if this is down (direct)</div>
    ${list(r.impactedDirect || [])}
    <div style="margin-top:6px;color:var(--accent-trans);font-weight:600;">Impacted if this is down (transitive)</div>
    ${list(r.impactedTransitive || [])}
  `;
}

function resetView() {
  setActive(null);
  clearMatrixHighlights();
  document.getElementById('impact').innerHTML = 'Select a service or group.';
  if (nodesDS) nodesDS.update(allNodes.map(n => ({ id: n.id, color: nodeColor(n) })));
  if (edgesDS) edgesDS.update(allEdges.map(e => ({ id: e.id, color: e.color, width: e.route ? 2 : 1 })));
  colorPoolsForImpact(new Set(), new Set());
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  COLORS = COLOR_THEMES[theme] || COLOR_THEMES.dark;
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? 'Dark' : 'Light';
  try { localStorage.setItem('blast-radius-theme', theme); } catch (e) {}
  const fontColor = nodeFontColor();
  if (network) {
    network.setOptions({ nodes: { font: { color: fontColor } } });
    // LB-pool markers carry a per-node font color that overrides the global one,
    // so their labels won't recolor on a theme switch unless refreshed directly:
    // collapsed pools are cluster nodes, expanded ones live in nodesDS.
    for (const pool of collapsedPools) {
      if (network.updateClusteredNode) {
        network.updateClusteredNode('lb:' + pool, { font: { color: fontColor } });
      }
    }
  }
  if (nodesDS) {
    // Refresh font color on every node (covers per-node overrides) and fill color
    // on the real service nodes.
    const colorById = new Map(allNodes.map(n => [n.id, nodeColor(n)]));
    nodesDS.update(nodesDS.getIds().map((id) => {
      const u = { id, font: { color: fontColor } };
      if (colorById.has(id)) u.color = colorById.get(id);
      return u;
    }));
  }
}
