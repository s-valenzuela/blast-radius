// @ts-check
// DOM event wiring: toolbar, sidebar, YAML menu/editor, About dialog,
// initial theme, and the bootstrap kickoff.

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
el('file-input').onchange = (ev) => {
  const t = /** @type {HTMLInputElement} */ (ev.target);
  const file = t.files && t.files[0];
  if (file) uploadYaml(file);
  t.value = '';
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
  const ta = el('yaml-text');
  const status = document.getElementById('yaml-lint');
  const save = el('yaml-save');
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

  const ta = el('yaml-text');
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
  const text = el('yaml-text').value;
  const status = document.getElementById('yaml-lint');
  const save = el('yaml-save');
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
qsa('#view-toggle button').forEach(b => b.onclick = () => setView(b.dataset.view));
window.addEventListener('resize', () => { if (document.getElementById('matrix-wrap').offsetWidth > 0) sizeMatrix(); });

(function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('blast-radius-theme') || 'dark'; } catch (e) {}
  applyTheme(saved);
})();

bootstrap();
