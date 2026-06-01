// @ts-check
// Network graph view: node styling, the services/groups sidebar lists,
// vis-network rendering, and LB-pool clustering.

function nodeColor(n) {
  const base = n.kind === 'gateway' ? COLORS.gateway
             : n.kind === 'database' ? COLORS.database
             : n.kind === 'pool' ? COLORS.pool
             : COLORS.service;
  const gc = groupColor(n.groupName);
  if (!gc) return base;
  if (n.kind === 'database') return { background: gc, border: base.border };
  return { background: gc, border: gc };
}

function nodeShape(n) {
  if (n.kind === 'gateway') return 'hexagon';
  if (n.kind === 'database') return 'database';
  if (n.kind === 'pool') return 'diamond';
  return 'dot';
}

function nodeSize(n) {
  return NODE_SIZE[n.kind] || NODE_SIZE.service;
}

function renderServices(services) {
  registerGroups(services.map(s => s.groupName));
  const root = document.getElementById('services');
  root.innerHTML = '';

  const byGroup = {};
  for (const s of services) {
    const g = s.groupName || 'root';
    (byGroup[g] = byGroup[g] || []).push(s);
  }
  const groupNames = Object.keys(byGroup).sort();

  for (const g of groupNames) {
    byGroup[g].sort((a,b) => (a.name || a.id).localeCompare(b.name || b.id));
    const dotColor = (g === 'root' ? null : groupColor(g)) || '#64748b';

    const groupRoot = document.createElement('div');
    groupRoot.className = 'svc-group collapsed';
    groupRoot.dataset.group = g;

    const header = document.createElement('button');
    header.className = 'svc-group-header';
    header.innerHTML =
      `<span class="chev">▸</span>` +
      `<span class="dot" style="background:${dotColor};"></span>` +
      `<span class="gname">${g}</span>` +
      `<span class="count">${byGroup[g].length}</span>`;
    header.onclick = () => {
      const collapsed = groupRoot.classList.toggle('collapsed');
      header.querySelector('.chev').textContent = collapsed ? '▸' : '▾';
    };

    const body = document.createElement('div');
    body.className = 'svc-group-body';
    for (const s of byGroup[g]) {
      const btn = document.createElement('button');
      btn.className = 'item';
      btn.dataset.id = s.id;
      btn.dataset.kind = 'service';
      const kindBadge = s.kind && s.kind !== 'service' ? `<span class="badge kind">${s.kind}</span>` : '';
      btn.innerHTML = `<div class="name">${s.name || s.id}${kindBadge}</div>
                       <div class="meta">${s.id}</div>`;
      btn.onclick = () => selectService(s.id, btn);
      body.appendChild(btn);
    }

    groupRoot.appendChild(header);
    groupRoot.appendChild(body);
    root.appendChild(groupRoot);
  }
  renderGroupLegend(services);
}

function renderGroupLegend(services) {
  const root = document.getElementById('groups');
  root.innerHTML = '';
  const seen = new Set();
  for (const s of services) {
    if (!s.groupName || seen.has(s.groupName)) continue;
    seen.add(s.groupName);
    const c = groupColor(s.groupName);
    const chip = document.createElement('button');
    chip.dataset.kind = 'group';
    chip.dataset.id = s.groupName;
    chip.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:10px;border:1px solid ${c}66;background:${c}1a;color:var(--text);cursor:pointer;font:inherit;font-size:11px;`;
    chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c};"></span>${s.groupName}`;
    chip.onclick = (ev) => selectGroup(s.groupName, chip, ev.ctrlKey || ev.metaKey || ev.shiftKey);
    root.appendChild(chip);
  }
  if (!seen.size) root.innerHTML = '<em style="color:var(--text-faint);">No groups configured.</em>';
}

function renderGraph(graph) {
  if (network) { network.destroy(); network = null; }
  registerGroups(graph.nodes.map(n => n.groupName));
  savedPositions = loadSavedPositions();
  allNodes = graph.nodes.map(n => ({
    id: n.id,
    label: n.label,
    group: n.group,
    kind: n.kind,
    groupName: n.groupName,
    pool: n.pool || '',
    title: n.title,
    shape: nodeShape(n),
    size: nodeSize(n),
    borderWidth: n.groupName ? 4 : 1,
    color: nodeColor(n),
    ...(savedPositions[n.id] ? { x: savedPositions[n.id].x, y: savedPositions[n.id].y } : {}),
  }));
  allEdges = graph.edges.map((e, i) => {
    let color, dashes = false, width = 1;
    if (e.type === 'uses') {
      color = '#b45309'; dashes = true;
    } else if (e.type === 'pool') {
      color = '#64748b'; dashes = true;  // LB fan-out to pool members
    } else if (e.route) {
      color = gatewayColor(e.gateway || e.to); width = 2;
    } else {
      color = '#475569';
    }
    return {
      id: 'e' + i,
      from: e.from,
      to: e.to,
      arrows: 'to',
      dashes,
      color: { color, highlight: color },
      width,
      route: e.route,
      etype: e.type,
      viaTarget: e.viaTarget,
    };
  });
  // When every node already has a saved position, skip the layout entirely so
  // nodes stay exactly where the user left them. Otherwise run the force layout
  // (seeded nodes start from their saved spot) and persist the settled result.
  const haveAllPos = allNodes.length > 0 && allNodes.every(n => savedPositions[n.id]);
  nodesDS = new vis.DataSet(allNodes);
  edgesDS = new vis.DataSet(allEdges.concat(groupCohesionEdges()));
  network = new vis.Network(document.getElementById('network'), { nodes: nodesDS, edges: edgesDS }, {
    physics: haveAllPos ? false : NETWORK_PHYSICS,
    interaction: { hover: true, tooltipDelay: 150, dragNodes: true },
    nodes: { font: { color: nodeFontColor(), size: 12 } },
    edges: { smooth: { type: 'continuous' }, length: 220 },
  });
  if (haveAllPos) {
    network.fit();
  } else {
    network.once('stabilizationIterationsDone', () => {
      network.setOptions({ physics: { enabled: false } });
      savePositions();
    });
  }
  // Persist positions whenever the user drags a node so the layout survives reloads.
  network.on('dragEnd', savePositions);
  clusterPools();
  network.on('click', params => {
    if (params.nodes.length !== 1) return;
    const id = params.nodes[0];
    if (id.startsWith('svc:')) {
      const svcId = id.slice(4);
      const btn = document.querySelector(`button.item[data-kind="service"][data-id="${svcId}"]`);
      selectService(svcId, btn);
    }
  });
  network.on('doubleClick', params => {
    if (params.nodes.length !== 1) return;
    const id = params.nodes[0];
    if (network.isCluster(id)) {
      expandCluster(id);
      return;
    }
    const node = nodesDS.get(id);
    if (node && node.isLbPool) {
      collapsePool(node.pool);
      renderLbPools();
    }
  });
}

function poolCounts() {
  const counts = {};
  for (const n of allNodes) {
    if (n.pool) counts[n.pool] = (counts[n.pool] || 0) + 1;
  }
  return counts;
}

function clusterOnePool(pool, count) {
  if (count < 2) return;
  const lbId = 'lb:' + pool;
  if (collapsedPools.has(pool)) return;
  network.cluster({
    joinCondition: (childOptions) => childOptions.pool === pool && !childOptions.isLbPool,
    clusterNodeProperties: {
      id: lbId,
      label: pool + ' (' + count + ')',
      shape: 'image',
      image: LB_ICON_SVG,
      size: 28,
      font: { color: nodeFontColor(), size: 13 },
      title: 'LB pool: ' + pool + ' (' + count + ' services) — double-click to expand',
    },
  });
  collapsedPools.add(pool);
  // Restore the cluster's saved position so it doesn't snap to the child centroid.
  const sp = savedPositions[lbId];
  if (sp) network.moveNode(lbId, sp.x, sp.y);
}

function clusterPools() {
  collapsedPools.clear();
  const counts = poolCounts();
  for (const pool of Object.keys(counts)) collapsePool(pool);
  renderLbPools();
}

function expandCluster(id) {
  const pool = id.startsWith('lb:') ? id.slice(3) : id;
  const positions = network.getPositions([id]);
  const clusterPos = positions[id] || { x: 0, y: 0 };
  let memberIds = [];
  network.openCluster(id, {
    releaseFunction: (cPos, containedPositions) => {
      const out = {};
      const ids = Object.keys(containedPositions);
      memberIds = ids;
      const radius = Math.max(70, 22 * ids.length);
      ids.forEach((nid, i) => {
        const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
        out[nid] = {
          x: cPos.x + radius * Math.cos(angle),
          y: cPos.y + radius * Math.sin(angle),
        };
      });
      return out;
    },
  });
  collapsedPools.delete(pool);
  nodesDS.add({
    id: id,
    label: pool,
    shape: 'image',
    image: LB_ICON_SVG,
    size: 28,
    font: { color: nodeFontColor(), size: 13 },
    title: 'LB pool: ' + pool + ' — double-click to collapse',
    x: clusterPos.x,
    y: clusterPos.y,
    physics: false,
    isLbPool: true,
    pool: pool,
  });
  edgesDS.add(memberIds.map(mid => ({
    id: 'lb-edge:' + pool + ':' + mid,
    from: id,
    to: mid,
    dashes: true,
    arrows: '',
    color: { color: '#94a3b8', highlight: '#94a3b8', opacity: 0.5 },
    width: 1,
    physics: false,
  })));
  redirectEdgesForExpandedPools();
  renderLbPools();
}

function collapsePool(pool) {
  const counts = poolCounts();
  const count = counts[pool];
  if (!count || count < 2) return;
  const lbId = 'lb:' + pool;
  const stale = edgesDS.get({ filter: e => typeof e.id === 'string' && e.id.startsWith('lb-edge:' + pool + ':') });
  if (stale.length) edgesDS.remove(stale.map(e => e.id));
  if (nodesDS.get(lbId)) nodesDS.remove(lbId);
  redirectEdgesForExpandedPools();
  clusterOnePool(pool, count);
}

function redirectEdgesForExpandedPools() {
  const expandedPools = new Set();
  const counts = poolCounts();
  for (const pool of Object.keys(counts)) {
    const lbId = 'lb:' + pool;
    if (!collapsedPools.has(pool) && nodesDS.get(lbId)) expandedPools.add(pool);
  }
  const memberToPool = {};
  for (const n of allNodes) {
    if (n.pool && expandedPools.has(n.pool)) memberToPool[n.id] = n.pool;
  }
  const updates = [];
  for (const e of allEdges) {
    const targetPool = memberToPool[e.to];
    const sourcePool = memberToPool[e.from];
    const newTo = (targetPool && targetPool !== sourcePool) ? ('lb:' + targetPool) : e.to;
    const current = edgesDS.get(e.id);
    if (current && current.to !== newTo) updates.push({ id: e.id, to: newTo });
  }
  if (updates.length) edgesDS.update(updates);
}

function togglePool(pool, count) {
  const lbId = 'lb:' + pool;
  if (collapsedPools.has(pool)) {
    expandCluster(lbId);
  } else {
    collapsePool(pool);
    renderLbPools();
  }
}

function renderLbPools() {
  const root = document.getElementById('lb-pools');
  if (!root) return;
  root.innerHTML = '';
  const counts = poolCounts();
  const pools = Object.keys(counts).filter(p => counts[p] >= 2).sort();
  if (!pools.length) {
    root.innerHTML = '<em style="color:var(--text-faint);">No load-balancer pools configured.</em>';
    return;
  }
  for (const pool of pools) {
    const count = counts[pool];
    const collapsed = collapsedPools.has(pool);
    const chip = document.createElement('button');
    chip.dataset.kind = 'pool';
    chip.dataset.id = pool;
    const chev = collapsed ? '▸' : '▾';
    const bg = collapsed ? '#94a3b822' : 'transparent';
    chip.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:10px;border:1px solid #94a3b866;background:${bg};color:var(--text-soft);cursor:pointer;font:inherit;font-size:11px;`;
    chip.innerHTML = `<span style="font-family:monospace;">${chev}</span>${pool} <span style="color:var(--text-faint);">(${count})</span>`;
    chip.title = collapsed ? `Click to expand "${pool}"` : `Click to collapse "${pool}"`;
    chip.onclick = () => togglePool(pool, count);
    root.appendChild(chip);
  }
}
