const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '../build/chrome-mv3-dev'),
  path.join(__dirname, '../build/chrome-mv3-prod')
];

// Sync chrome-mv3-prod to chrome-mv3-dev so both build targets have identical updated files
const prodDir = path.join(__dirname, '../build/chrome-mv3-prod');
const devDir = path.join(__dirname, '../build/chrome-mv3-dev');
if (fs.existsSync(prodDir)) {
  fs.cpSync(prodDir, devDir, { recursive: true });
  console.log(`Synced build files from chrome-mv3-prod to chrome-mv3-dev`);
}

dirs.forEach(dir => {
  const manifestPath = path.join(dir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      let modified = false;
      if (Array.isArray(manifest.content_scripts)) {
        manifest.content_scripts.forEach(cs => {
          if (Array.isArray(cs.js)) {
            const hasInterceptor = cs.js.some(file => file.includes('main-world-interceptor'));
            if (hasInterceptor && cs.world !== 'MAIN') {
              cs.world = 'MAIN';
              modified = true;
              console.log(`Updated world to MAIN for main-world-interceptor in ${manifestPath}`);
            }
          }
        });
      }
      if (modified) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      }
    } catch (e) {
      console.error(`Error updating manifest at ${manifestPath}:`, e);
    }
  }

  // Copy interceptor.js to the build assets directory
  const srcInterceptor = path.join(__dirname, '../assets/interceptor.js');
  const destAssets = path.join(dir, 'assets');
  const destInterceptor = path.join(destAssets, 'interceptor.js');
  if (fs.existsSync(srcInterceptor)) {
    if (!fs.existsSync(destAssets)) {
      fs.mkdirSync(destAssets, { recursive: true });
    }
    fs.copyFileSync(srcInterceptor, destInterceptor);
    console.log(`Copied interceptor.js to ${destInterceptor}`);
  }
});
