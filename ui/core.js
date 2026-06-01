// @ts-check
// Core state (the in-memory model + graph datasets), load() orchestration,
// localStorage persistence, bootstrap, and YAML import/export.

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

function persistModel() {
  try {
    localStorage.setItem(MODEL_KEY, BR.yaml.dump(model, jsyaml));
  } catch (e) { /* quota exceeded / private mode — persistence is best-effort */ }
}

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
