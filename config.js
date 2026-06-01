// @ts-check
// Static configuration for the UI: palettes, the theme color map, localStorage
// keys, node sizes, and the vis-network physics options. Pulled out of app.js so
// the "magic numbers and colors" live in one discoverable place. Loaded as a
// plain <script> before app.js, so these are globals shared with it.

// Bump this when the About dialog content changes enough that returning visitors
// should see it again (it re-shows once per new version).
const APP_VERSION = '1';

// Node fill/border per kind and per theme. applyTheme() swaps the active set.
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

// Routed edges hash their gateway id into this palette (gatewayColor).
const ROUTE_PALETTE = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#60a5fa'];

// Group chips/nodes hash their group name into this palette (registerGroups).
const GROUP_PALETTE = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#facc15', '#c084fc', '#4ade80'];

// localStorage keys. The model and node positions persist across reloads; the
// about-seen key remembers the last APP_VERSION whose About dialog was shown.
const MODEL_KEY = 'blast-radius-model';
const POS_KEY = 'blast-radius-positions';
const ABOUT_SEEN_KEY = 'blast-radius-about-seen';

// vis-network node radius per kind.
const NODE_SIZE = { gateway: 26, database: 14, pool: 22, service: 18 };

// Force-directed layout used until positions are saved (then physics is off).
const NETWORK_PHYSICS = {
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
};
