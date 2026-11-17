// Rebuilds server/node_modules/better-sqlite3 for Electron's Node ABI —
// the embedded LAN sync server (server/dist/index.js) runs under
// Electron's bundled runtime (ELECTRON_RUN_AS_NODE=1, see
// electron/lanServer.ts), not system Node, so its native module must be
// built for Electron's ABI, not whatever Node installed it.
//
// A plain JS script using @electron/rebuild's API directly, rather than
// shelling out to its CLI binary — avoids Windows cmd.exe quoting/relative
// path issues that broke an earlier version of this as an inline
// `node -e "..."` one-liner in package.json.
const path = require('node:path');

async function main() {
  const { rebuild } = require('@electron/rebuild');
  const electronVersion = require('electron/package.json').version;
  const serverDir = path.resolve(__dirname, '..', 'server');

  console.log(`[rebuild-server-native] Rebuilding server/node_modules/better-sqlite3 for Electron ${electronVersion}...`);
  await rebuild({
    buildPath: serverDir,
    electronVersion,
    onlyModules: ['better-sqlite3'],
    force: true,
  });
  console.log('[rebuild-server-native] Done.');
}

main().catch((err) => {
  console.error('[rebuild-server-native] Failed:', err);
  process.exit(1);
});
