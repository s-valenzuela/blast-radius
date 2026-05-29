// Ambient declarations for the vendored browser globals that app.js relies on.
// These libraries are loaded via <script> tags in index.html, not imported,
// so the type checker needs to be told they exist on the global scope.

/** vis-network UMD global (vendor/vis-network.min.js). */
declare const vis: any;

/** js-yaml UMD global (vendor/js-yaml.min.js). */
declare const jsyaml: any;
