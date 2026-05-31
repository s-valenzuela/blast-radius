// @ts-check
// Bump this when the About dialog content changes enough that returning visitors
// should see it again (it re-shows once per new version).
const APP_VERSION = '1';

const COLOR_THEMES = {
  dark: {
    service:    { background: '#1e293b', border: '#38bdf8' },
    gateway:    { background: '#312e81', border: '#a78bfa' },
    database:   { background: '#0c4a4a', border: '#94a3b8' },
    pool:       { background: '#0b1220', border: '#94a3b8' },
    direct:     { background: '#ef4444', border: '#7f1d1d' },
    trans:      { background: '#fb923c', border: '#7c2d12' },
    gatewayHit: { background: '#7c3aed', border: '#a78bfa' },
    dim:        { background: '#1f2937', border: '#334155' },
  },
  light: {
    service:    { background: '#e0f2fe', border: '#0284c7' },
    gateway:    { background: '#ede9fe', border: '#8b5cf6' },
    database:   { background: '#ccfbf1', border: '#64748b' },
    pool:       { background: '#e2e8f0', border: '#64748b' },
    direct:     { background: '#ef4444', border: '#7f1d1d' },
    trans:      { background: '#fb923c', border: '#7c2d12' },
    gatewayHit: { background: '#7c3aed', border: '#a78bfa' },
    dim:        { background: '#e2e8f0', border: '#94a3b8' },
  },
};
let COLORS = COLOR_THEMES.dark;

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

const ROUTE_PALETTE = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#60a5fa'];
// Routed edges are colored by their gateway, so both legs of a call (caller→gw,
// gw→target) and every route sharing a gateway get one consistent color.
function gatewayColor(gatewayId) {
  let h = 0;
  for (let i = 0; i < gatewayId.length; i++) h = (h * 31 + gatewayId.charCodeAt(i)) & 0xffff;
  return ROUTE_PALETTE[h % ROUTE_PALETTE.length];
}

const GROUP_PALETTE = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#facc15', '#c084fc', '#4ade80'];
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

let network, nodesDS, edgesDS;
let allNodes = [];
let allEdges = [];
let savedPositions = {};
// Which LB pools are currently collapsed into a cluster node. Tracked here rather
// than asking vis via network.isCluster('lb:'+pool), because that logs
// "Node does not exist." to the console for any pool that isn't clustered.
let collapsedPools = new Set();
let selectedGroupNames = new Set();

// The in-memory graph. Replaces the server-side GraphLoader; everything is
// derived from this via the BR.* model modules (no backend).
let model = { services: [] };

// Re-render all views from the current model. Synchronous now that the former
// /api/graph, /api/services and /api/matrix calls are local BR.shape functions.
function load() {
  const graph = BR.shape.graph(model);
  const services = BR.shape.services(model);
  const matrix = BR.shape.matrix(model);
  selectedGroupNames.clear();
  document.getElementById('impact').innerHTML = 'Select a service or group.';
  renderServices(services);
  renderGraph(graph);
  renderMatrix(matrix);
}

// The working graph is persisted to localStorage so a page reload restores the
// user's state instead of resetting to the bundled default. The key holds the
// serialized YAML; absence means "no user state — use the default".
const MODEL_KEY = 'blast-radius-model';

function persistModel() {
  try {
    localStorage.setItem(MODEL_KEY, BR.yaml.dump(model, jsyaml));
  } catch (e) { /* quota exceeded / private mode — persistence is best-effort */ }
}

// Node coordinates are persisted separately from the model (a { id: {x, y} } map)
// so the force-directed layout doesn't re-shuffle every reload. Keyed by node id,
// so positions survive edits that keep the same services.
const POS_KEY = 'blast-radius-positions';

function loadSavedPositions() {
  try {
    const obj = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) { return {}; }
}

function savePositions() {
  if (!network) return;
  try {
    const ids = allNodes.map(n => n.id);
    // Also persist the position of each collapsed LB-pool cluster node; otherwise
    // it would be rebuilt at its children's centroid on reload, which doesn't match
    // where it actually settled, and the pool appears to jump.
    for (const pool of collapsedPools) ids.push('lb:' + pool);
    const pos = network.getPositions(ids);
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch (e) { /* best-effort */ }
}

// Fetch and parse the bundled default graph. Served as a static asset, so this
// works behind any static file server.
async function loadDefaultModel() {
  const res = await fetch('services.yml');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return BR.parse.normalize(jsyaml.load(await res.text()));
}

async function bootstrap() {
  let saved = null;
  try { saved = localStorage.getItem(MODEL_KEY); } catch (e) {}
  if (saved) {
    try {
      model = BR.parse.normalize(jsyaml.load(saved));
      load();
      return;
    } catch (e) {
      // Corrupt saved state — discard it and fall through to the default.
      try { localStorage.removeItem(MODEL_KEY); } catch (e2) {}
    }
  }
  try {
    model = await loadDefaultModel();
  } catch (e) {
    model = { services: [] };
    document.getElementById('impact').innerHTML =
      'Could not load services.yml (' + e.message + '). Use the YAML menu to load or edit.';
  }
  load();
}

function downloadYaml() {
  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  try {
    const text = BR.yaml.dump(model, jsyaml);
    const blob = new Blob([text], { type: 'application/x-yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'services.yml';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    status.className = 'ok';
    status.textContent = 'Downloaded services.yml (' + model.services.length + ' services).';
  } catch (e) {
    status.className = 'err';
    status.textContent = 'Download failed: ' + e.message;
  }
}

async function uploadYaml(file) {
  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  status.className = '';
  status.textContent = 'Loading ' + file.name + '…';
  try {
    const text = await file.text();
    model = BR.parse.normalize(jsyaml.load(text));
    load();
    persistModel();
    status.className = 'ok';
    status.textContent = 'Loaded ' + file.name + ' (' + model.services.length + ' services).';
  } catch (e) {
    status.className = 'err';
    status.textContent = 'Upload failed: ' + e.message;
  }
}

let matrixData = null;
let matrixGateways = new Set();
let matrixDirect = new Map();
let matrixVia = new Map();
let matrixTrans = new Map();

function keypair(a, b) { return a + ' ' + b; }

function computeTransitive(services, deps) {
  matrixDirect = new Map();
  matrixVia = new Map();
  for (const d of deps) {
    const k = keypair(d.from, d.to);
    if (d.via) matrixVia.set(k, d.via);
    else matrixDirect.set(k, true);
  }
  // Transitive reachability comes from the shared impact analyzer rather than a
  // second hand-rolled BFS, so the matrix and the node-click impact panel can
  // never disagree (review #4).
  matrixTrans = new Map();
  for (const s of services) {
    for (const t of BR.impact.analyzeService(model, s.id).transitive) {
      const k = keypair(s.id, t);
      if (!matrixDirect.has(k) && !matrixVia.has(k)) matrixTrans.set(k, true);
    }
  }
}

function cellKind(fromId, toId) {
  if (fromId === toId) return 'self';
  const k = keypair(fromId, toId);
  if (matrixDirect.has(k)) return 'direct';
  if (matrixVia.has(k)) return 'via';
  if (matrixTrans.has(k)) return 'trans';
  return 'none';
}

function renderMatrix(data) {
  matrixData = data;
  matrixGateways = new Set(data.services.filter(s => s.kind === 'gateway').map(s => s.id));
  computeTransitive(data.services, data.deps);
  registerGroups(data.services.map(s => s.group));

  const services = data.services;
  // Group boundary indices for block borders
  const groupBoundaries = new Set([0]);
  for (let i = 1; i < services.length; i++) {
    if (services[i].group !== services[i - 1].group) groupBoundaries.add(i);
  }

  const wrap = document.getElementById('matrix-wrap');
  wrap.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'matrix-title';
  title.innerHTML = `<b>Dependency matrix</b> — rows depend on columns. ${services.length} services, ${data.deps.length} declared deps.`;
  wrap.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'matrix-grid';
  // 1 corner + N service columns. Rows: 1 group header + 1 service col header + N service rows
  grid.style.gridTemplateColumns = `auto auto repeat(${services.length}, var(--mcs, 26px))`;

  // --- Row 1: group column headers ---
  appendCell(grid, '', { gridColumn: '1 / span 2' }); // corner
  let i = 0;
  while (i < services.length) {
    let j = i + 1;
    while (j < services.length && services[j].group === services[i].group) j++;
    const span = j - i;
    const g = services[i].group;
    const c = groupColor(g) || '#475569';
    const cell = document.createElement('div');
    cell.className = 'mgroup-col' + (i === 0 ? '' : ' mblock-vstart');
    cell.style.color = c;
    cell.style.borderBottomColor = c;
    cell.style.gridColumn = `${3 + i} / span ${span}`;
    cell.textContent = g || '—';
    cell.title = `Group: ${g || '(none)'} (${span} services) — click to highlight block`;
    cell.onclick = () => highlightMatrixGroup(g);
    grid.appendChild(cell);
    i = j;
  }

  // --- Row 2: per-service column labels ---
  appendCell(grid, '', {}); // corner top-left of svc rows
  appendCell(grid, '', {}); // corner
  for (let c = 0; c < services.length; c++) {
    const s = services[c];
    const lbl = document.createElement('div');
    lbl.className = 'mlabel-col' + (groupBoundaries.has(c) && c > 0 ? ' mblock-vstart' : '');
    lbl.dataset.col = c;
    lbl.dataset.id = s.id;
    lbl.textContent = s.name;
    lbl.title = `${s.name} (${s.id})\nClick to highlight column (services that depend on this)`;
    lbl.onclick = () => highlightMatrixCol(c, s);
    grid.appendChild(lbl);
  }

  // --- Service rows ---
  // We track current group so we can emit a single group label spanning its rows
  let r = 0;
  while (r < services.length) {
    let rEnd = r + 1;
    while (rEnd < services.length && services[rEnd].group === services[r].group) rEnd++;
    const span = rEnd - r;
    const g = services[r].group;
    const c = groupColor(g) || '#475569';

    // Group row label (spans `span` rows)
    const gLab = document.createElement('div');
    gLab.className = 'mgroup-row' + (r === 0 ? '' : ' mblock-hstart');
    gLab.style.color = c;
    gLab.style.borderRightColor = c;
    gLab.style.gridRow = `${3 + r} / span ${span}`;
    gLab.style.gridColumn = '1';
    gLab.textContent = g || '—';
    gLab.title = `Group: ${g || '(none)'} (${span} services) — click to highlight block`;
    gLab.onclick = () => highlightMatrixGroup(g);
    grid.appendChild(gLab);

    for (let rr = r; rr < rEnd; rr++) {
      const s = services[rr];
      const rowLbl = document.createElement('div');
      rowLbl.className = 'mlabel-row' + (rr === r && rr > 0 ? ' mblock-hstart' : '');
      rowLbl.style.gridRow = `${3 + rr}`;
      rowLbl.style.gridColumn = '2';
      rowLbl.dataset.row = rr;
      rowLbl.dataset.id = s.id;
      rowLbl.textContent = s.name;
      rowLbl.title = `${s.name} (${s.id})\nClick to highlight row (what this depends on)`;
      rowLbl.onclick = () => highlightMatrixRow(rr, s);
      grid.appendChild(rowLbl);

      for (let cc = 0; cc < services.length; cc++) {
        const t = services[cc];
        const kind = cellKind(s.id, t.id);
        const cell = document.createElement('div');
        const cls = ['mcell', kind];
        if (groupBoundaries.has(cc) && cc > 0) cls.push('mblock-vstart');
        if (rr === r && rr > 0) cls.push('mblock-hstart');
        cell.className = cls.join(' ');
        cell.style.gridRow = `${3 + rr}`;
        cell.style.gridColumn = `${3 + cc}`;
        cell.style.setProperty('--mc', groupColor(s.group) || '#38bdf8');
        cell.dataset.row = rr;
        cell.dataset.col = cc;
        if (kind === 'direct') cell.title = `${s.name} → ${t.name}  (direct)`;
        else if (kind === 'via') cell.title = `${s.name} → ${t.name}  (via ${matrixVia.get(keypair(s.id, t.id))})`;
        else if (kind === 'trans') cell.title = `${s.name} → ${t.name}  (transitive)`;
        else if (kind === 'self') cell.title = s.name;
        else cell.title = `no dep`;
        if (kind !== 'self' && kind !== 'none') {
          cell.onclick = () => highlightMatrixCell(rr, cc, s, t, kind);
        }
        grid.appendChild(cell);
      }
    }
    r = rEnd;
  }

  wrap.appendChild(grid);

  const legend = document.createElement('div');
  legend.className = 'mlegend';
  legend.innerHTML = `
    <div class="row"><span class="swatch" style="background:#38bdf8;"></span>direct dep</div>
    <div class="row"><span class="swatch" style="background:#38bdf8;background-image:linear-gradient(45deg,transparent 45%,rgba(0,0,0,.35) 45% 55%,transparent 55%);"></span>via gateway</div>
    <div class="row"><span class="swatch" style="background:#38bdf8;opacity:0.22;"></span>transitive</div>
    <div class="row"><span class="swatch" style="background:#1f2937;"></span>self</div>
    <div class="row">Cell color = source group color</div>
  `;
  wrap.appendChild(legend);
  if (wrap.offsetWidth > 0) sizeMatrix();
}

function appendCell(grid, text, styles) {
  const d = document.createElement('div');
  if (text) d.textContent = text;
  for (const k in styles) d.style[k] = styles[k];
  grid.appendChild(d);
}

function clearMatrixHighlights() {
  document.querySelectorAll('.mlabel-row.active, .mlabel-col.active, .mgroup-row.active, .mgroup-col.active').forEach(e => e.classList.remove('active'));
  document.querySelectorAll('.mhighlight-row, .mhighlight-col').forEach(e => e.classList.remove('mhighlight-row', 'mhighlight-col'));
}

function highlightMatrixRow(rowIdx, svc) {
  clearMatrixHighlights();
  document.querySelectorAll(`.mlabel-row[data-row="${rowIdx}"]`).forEach(e => e.classList.add('active'));
  document.querySelectorAll(`.mcell[data-row="${rowIdx}"]`).forEach(e => e.classList.add('mhighlight-row'));
  const targets = matrixData.services.filter((_, c) => {
    const k = cellKind(svc.id, matrixData.services[c].id);
    return k === 'direct' || k === 'via';
  });
  const trans = matrixData.services.filter((_, c) => cellKind(svc.id, matrixData.services[c].id) === 'trans');
  document.getElementById('impact').innerHTML = `
    <div><b>${svc.name}</b> · ${svc.id}<div style="font-size:11px;color:var(--text-muted);">${svc.group || ''}</div></div>
    <div style="margin-top:8px;color:var(--accent-direct);font-weight:600;">Depends on (direct/via)</div>
    ${targets.length ? '<ul>' + targets.map(t => `<li>${t.name}</li>`).join('') + '</ul>' : '<em style="color:var(--text-faint)">none</em>'}
    <div style="margin-top:6px;color:var(--accent-trans);font-weight:600;">Transitive</div>
    ${trans.length ? '<ul>' + trans.map(t => `<li>${t.name}</li>`).join('') + '</ul>' : '<em style="color:var(--text-faint)">none</em>'}
  `;
}

function highlightMatrixCol(colIdx, svc) {
  clearMatrixHighlights();
  document.querySelectorAll(`.mlabel-col[data-col="${colIdx}"]`).forEach(e => e.classList.add('active'));
  document.querySelectorAll(`.mcell[data-col="${colIdx}"]`).forEach(e => e.classList.add('mhighlight-col'));
  const dependents = matrixData.services.filter((_, r) => {
    const k = cellKind(matrixData.services[r].id, svc.id);
    return k === 'direct' || k === 'via';
  });
  const transDeps = matrixData.services.filter((_, r) => cellKind(matrixData.services[r].id, svc.id) === 'trans');
  document.getElementById('impact').innerHTML = `
    <div><b>${svc.name}</b> · ${svc.id}<div style="font-size:11px;color:var(--text-muted);">${svc.group || ''}</div></div>
    <div style="margin-top:8px;color:var(--accent-impact);font-weight:600;">Depended on by (direct/via)</div>
    ${dependents.length ? '<ul>' + dependents.map(t => `<li>${t.name}</li>`).join('') + '</ul>' : '<em style="color:var(--text-faint)">none</em>'}
    <div style="margin-top:6px;color:var(--accent-trans);font-weight:600;">Transitive dependents</div>
    ${transDeps.length ? '<ul>' + transDeps.map(t => `<li>${t.name}</li>`).join('') + '</ul>' : '<em style="color:var(--text-faint)">none</em>'}
  `;
}

function highlightMatrixCell(r, c, src, tgt, kind) {
  clearMatrixHighlights();
  document.querySelectorAll(`.mlabel-row[data-row="${r}"], .mlabel-col[data-col="${c}"]`).forEach(e => e.classList.add('active'));
  const detail = kind === 'via'
    ? `via <b style="color:var(--accent-routed)">${matrixVia.get(keypair(src.id, tgt.id))}</b>`
    : kind;
  document.getElementById('impact').innerHTML = `
    <div><b>${src.name}</b> <span style="color:var(--text-muted);">→</span> <b>${tgt.name}</b></div>
    <div style="margin-top:8px;color:var(--text-muted);font-size:11px;">${detail}</div>
    <div style="margin-top:8px;font-size:11px;color:var(--text-muted);">${src.id} → ${tgt.id}</div>
  `;
}

function highlightMatrixGroup(groupName) {
  clearMatrixHighlights();
  const members = matrixData.services.map((s, i) => s.group === groupName ? i : -1).filter(i => i >= 0);
  for (const idx of members) {
    document.querySelectorAll(`.mlabel-row[data-row="${idx}"], .mlabel-col[data-col="${idx}"]`).forEach(e => e.classList.add('active'));
    document.querySelectorAll(`.mcell[data-row="${idx}"]`).forEach(e => e.classList.add('mhighlight-row'));
    document.querySelectorAll(`.mcell[data-col="${idx}"]`).forEach(e => e.classList.add('mhighlight-col'));
  }
  const color = groupColor(groupName) || '#94a3b8';
  document.getElementById('impact').innerHTML = `
    <div><b style="color:${color}">${groupName}</b> &middot; ${members.length} service(s)</div>
    <div style="margin-top:8px;color:${color};font-weight:600;">Members</div>
    <ul>${members.map(i => `<li>${matrixData.services[i].name}</li>`).join('')}</ul>
  `;
}

function setView(view) {
  const isMatrix = view === 'matrix';
  document.getElementById('matrix-wrap').style.display = isMatrix ? '' : 'none';
  document.getElementById('network').style.display = isMatrix ? 'none' : '';
  document.getElementById('legend').style.display = isMatrix ? 'none' : '';
  document.querySelectorAll('#view-toggle button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (!isMatrix && network) {
    network.redraw();
    setTimeout(() => network.fit({ animation: false }), 50);
  }
  if (isMatrix) setTimeout(sizeMatrix, 0);
}

function sizeMatrix() {
  if (!matrixData) return;
  const wrap = document.getElementById('matrix-wrap');
  const grid = wrap.querySelector('.matrix-grid');
  if (!wrap || !grid || wrap.offsetWidth === 0) return;

  // Measure label/header dims at their natural size first
  grid.style.removeProperty('--mcs');

  const cs = getComputedStyle(wrap);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

  const title = wrap.querySelector('.matrix-title');
  const legend = wrap.querySelector('.mlegend');
  const chromeH = (title ? title.offsetHeight + 14 : 0) + (legend ? legend.offsetHeight + 18 : 0);

  const groupRow = grid.querySelector('.mgroup-row');
  const labelRow = grid.querySelector('.mlabel-row');
  const groupCol = grid.querySelector('.mgroup-col');
  const labelCol = grid.querySelector('.mlabel-col');
  const labelW = (groupRow ? groupRow.offsetWidth : 0) + (labelRow ? labelRow.offsetWidth : 0);
  const headerH = (groupCol ? groupCol.offsetHeight : 0) + (labelCol ? labelCol.offsetHeight : 0);

  const availW = wrap.clientWidth - padX - labelW - 4;
  const availH = wrap.clientHeight - padY - chromeH - headerH - 4;
  const n = matrixData.services.length || 1;
  const size = Math.max(20, Math.min(64, Math.floor(Math.min(availW / n, availH / n))));
  grid.style.setProperty('--mcs', size + 'px');
}

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
  if (n.kind === 'gateway') return 26;
  if (n.kind === 'database') return 14;
  if (n.kind === 'pool') return 22;
  return 18;
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
    physics: haveAllPos ? false : {
      solver: 'forceAtlas2Based',
      forceAtlas2Based: {
        gravitationalConstant: -150,
        centralGravity: 0.005,
        springLength: 220,
        springConstant: 0.06,
        damping: 0.6,
        avoidOverlap: 0.6,
      },
      stabilization: { enabled: true, iterations: 600, updateInterval: 25, fit: true },
      minVelocity: 0.75,
    },
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

function setActive(btn) {
  document.querySelectorAll('.item.active').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('[data-kind="group"]').forEach(el => { el.style.outline = ''; el.style.outlineOffset = ''; });
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

  document.querySelectorAll('[data-kind="group"]').forEach(el => {
    if (selectedGroupNames.has(el.dataset.id)) {
      const c = groupColor(el.dataset.id);
      el.style.outline = `2px solid ${c}`;
      el.style.outlineOffset = '1px';
    } else {
      el.style.outline = '';
      el.style.outlineOffset = '';
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

document.getElementById('reset').onclick = resetView;
document.getElementById('theme-toggle').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
document.getElementById('recluster').onclick = () => clusterPools();
document.getElementById('sidebar-toggle').onclick = () => {
  const app = document.getElementById('app');
  const btn = document.getElementById('sidebar-toggle');
  const collapsed = app.classList.toggle('sidebar-collapsed');
  btn.textContent = collapsed ? '▶' : '◀';
  btn.title = collapsed ? 'Show sidebar' : 'Hide sidebar';
  setTimeout(() => {
    if (network) network.redraw();
    if (matrixData && document.getElementById('matrix-wrap').offsetWidth > 0) sizeMatrix();
  }, 250);
};
document.getElementById('upload-yaml').onclick = () => document.getElementById('file-input').click();
document.getElementById('download-yaml').onclick = downloadYaml;

const aboutOverlay = document.getElementById('about-overlay');
const setAbout = (open) => { aboutOverlay.hidden = !open; };
document.getElementById('about-open').onclick = () => setAbout(true);
document.getElementById('about-close').onclick = () => setAbout(false);
// Close when clicking the backdrop (outside the dialog) or pressing Escape.
aboutOverlay.onclick = (ev) => { if (ev.target === aboutOverlay) setAbout(false); };
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !aboutOverlay.hidden) setAbout(false); });
// Show the About dialog once per app version: on a visitor's first load, and
// again the first time they load after APP_VERSION is bumped. The stored value
// is the last version whose About they saw, so a newer version re-shows it.
const ABOUT_SEEN_KEY = 'blast-radius-about-seen';
let aboutSeenVersion = null;
try { aboutSeenVersion = localStorage.getItem(ABOUT_SEEN_KEY); } catch (e) {}
if (aboutSeenVersion !== APP_VERSION) {
  setAbout(true);
  try { localStorage.setItem(ABOUT_SEEN_KEY, APP_VERSION); } catch (e) {}
}
document.getElementById('revert-yaml').onclick = async () => {
  if (!confirm('Discard your saved changes and reload the bundled default graph?')) return;
  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  try {
    try { localStorage.removeItem(MODEL_KEY); localStorage.removeItem(POS_KEY); } catch (e) {}
    model = await loadDefaultModel();
    load();
    status.className = 'ok';
    status.textContent = 'Reverted to default services.yml (' + model.services.length + ' services).';
  } catch (e) {
    status.className = 'err';
    status.textContent = 'Revert failed: ' + e.message;
  }
};

const yamlMenu = document.getElementById('yaml-menu');
const yamlMenuList = document.getElementById('yaml-menu-list');
document.getElementById('yaml-menu-btn').onclick = (ev) => {
  ev.stopPropagation();
  yamlMenuList.hidden = !yamlMenuList.hidden;
};
// Picking an item (click bubbles up) or clicking anywhere outside closes the menu.
yamlMenuList.onclick = () => { yamlMenuList.hidden = true; };
document.addEventListener('click', (ev) => {
  if (!yamlMenu.contains(/** @type {Node} */ (ev.target))) yamlMenuList.hidden = true;
});
document.getElementById('file-input').onchange = (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (file) uploadYaml(file);
  ev.target.value = '';
};

function validateServiceGraph(text) {
  let doc;
  try {
    doc = jsyaml.load(text);
  } catch (e) {
    let msg = e.message || String(e);
    if (e.mark) msg += '\n  at line ' + (e.mark.line + 1) + ', column ' + (e.mark.column + 1);
    return { ok: false, error: msg };
  }
  if (doc == null) return { ok: false, error: 'Empty YAML.' };
  if (typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, error: 'Top-level must be a mapping with a "services:" array.' };
  if (!Array.isArray(doc.services)) return { ok: false, error: '"services" must be an array.' };
  const ids = new Set();
  for (let i = 0; i < doc.services.length; i++) {
    const s = doc.services[i];
    const ctx = 'services[' + i + ']';
    if (typeof s !== 'object' || s == null || Array.isArray(s)) return { ok: false, error: ctx + ': must be an object.' };
    if (typeof s.id !== 'string' || !s.id.trim()) return { ok: false, error: ctx + ': "id" is required (non-empty string).' };
    if (ids.has(s.id)) return { ok: false, error: ctx + ': duplicate id "' + s.id + '".' };
    ids.add(s.id);
    if (s.dependsOn != null) {
      if (!Array.isArray(s.dependsOn)) return { ok: false, error: ctx + '.dependsOn: must be an array.' };
      for (let j = 0; j < s.dependsOn.length; j++) {
        const d = s.dependsOn[j];
        const dctx = ctx + '.dependsOn[' + j + ']';
        if (typeof d === 'string') continue;
        if (typeof d !== 'object' || d == null || Array.isArray(d)) return { ok: false, error: dctx + ': must be a string or {target, via}.' };
        if (typeof d.target !== 'string' || !d.target.trim()) return { ok: false, error: dctx + ': "target" is required.' };
        if (d.via != null && typeof d.via !== 'string') return { ok: false, error: dctx + ': "via" must be a string.' };
      }
    }
  }
  return { ok: true, services: doc.services.length };
}

let lintTimer = null;
function lintYaml() {
  const ta = document.getElementById('yaml-text');
  const status = document.getElementById('yaml-lint');
  const save = document.getElementById('yaml-save');
  const result = validateServiceGraph(ta.value);
  if (result.ok) {
    status.className = 'lint-status ok';
    status.textContent = 'Valid — ' + result.services + ' service(s).';
    save.disabled = false;
  } else {
    status.className = 'lint-status err';
    status.textContent = result.error;
    save.disabled = true;
  }
}

function closeYamlPanel() {
  const app = document.getElementById('app');
  app.classList.remove('yaml-open');
  app.classList.remove('yaml-min');
  setTimeout(() => { if (network) network.redraw(); }, 250);
}

document.getElementById('edit-yaml').onclick = async () => {
  const app = document.getElementById('app');
  const wasOpen = app.classList.contains('yaml-open');
  app.classList.add('yaml-open');
  app.classList.remove('yaml-min');
  const yamlBtn = document.getElementById('yaml-toggle');
  yamlBtn.textContent = '▶';
  yamlBtn.title = 'Hide YAML panel';

  const ta = document.getElementById('yaml-text');
  if (!wasOpen) {
    const status = document.getElementById('yaml-lint');
    try {
      ta.value = BR.yaml.dump(model, jsyaml);
    } catch (e) {
      ta.value = 'services: []\n';
      status.className = 'lint-status err';
      status.textContent = 'Could not serialize current graph: ' + e.message + ' — starting blank.';
    }
    lintYaml();
  }
  setTimeout(() => { ta.focus(); if (network) network.redraw(); }, 250);
};
document.getElementById('yaml-text').oninput = () => {
  if (lintTimer) clearTimeout(lintTimer);
  lintTimer = setTimeout(lintYaml, 200);
};
document.getElementById('yaml-cancel').onclick = closeYamlPanel;
document.getElementById('yaml-close').onclick = closeYamlPanel;
document.getElementById('yaml-toggle').onclick = () => {
  const app = document.getElementById('app');
  const minimized = app.classList.toggle('yaml-min');
  const btn = document.getElementById('yaml-toggle');
  btn.textContent = minimized ? '◀' : '▶';
  btn.title = minimized ? 'Show YAML panel' : 'Hide YAML panel';
  setTimeout(() => { if (network) network.redraw(); }, 250);
};
document.getElementById('yaml-save').onclick = () => {
  const text = document.getElementById('yaml-text').value;
  const status = document.getElementById('yaml-lint');
  const save = document.getElementById('yaml-save');
  save.disabled = true;
  try {
    model = BR.parse.normalize(jsyaml.load(text));
    persistModel();
    closeYamlPanel();
    load();
  } catch (e) {
    status.className = 'lint-status err';
    status.textContent = 'Save failed: ' + e.message;
    save.disabled = false;
  }
};
document.querySelectorAll('#view-toggle button').forEach(b => b.onclick = () => setView(b.dataset.view));
window.addEventListener('resize', () => { if (document.getElementById('matrix-wrap').offsetWidth > 0) sizeMatrix(); });

(function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('blast-radius-theme') || 'dark'; } catch (e) {}
  applyTheme(saved);
})();

bootstrap();
