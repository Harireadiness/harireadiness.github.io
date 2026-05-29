#!/usr/bin/env node
/**
 * build-pulse.js
 *
 * Reassembles the editable source files back into a single-file pulse.html.
 * Reads from pulse-19800226/src/ and writes to pulse-19800226/pulse.html.
 *
 * Usage: npm run build
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PULSE_DIR = path.resolve(__dirname, '..', 'pulse-19800226');
const SRC_DIR = path.join(PULSE_DIR, 'src');
const OUTPUT = path.join(PULSE_DIR, 'pulse.html');

function main() {
  // Verify source files exist
  const requiredFiles = ['shell.html', 'loader.js', 'manifest.json', 'template.html'];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(SRC_DIR, file))) {
      console.error(`Error: ${path.join(SRC_DIR, file)} not found`);
      console.error('Run "npm run decode" first to extract source files.');
      process.exit(1);
    }
  }

  // Read source files
  const shell = fs.readFileSync(path.join(SRC_DIR, 'shell.html'), 'utf-8').trimEnd();
  const loader = fs.readFileSync(path.join(SRC_DIR, 'loader.js'), 'utf-8').trimEnd();
  const manifestData = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'manifest.json'), 'utf-8'));
  const templateHtml = fs.readFileSync(path.join(SRC_DIR, 'template.html'), 'utf-8');

  let extResourcesJson = '[]';
  const extResourcesPath = path.join(SRC_DIR, 'ext_resources.json');
  if (fs.existsSync(extResourcesPath)) {
    const extData = JSON.parse(fs.readFileSync(extResourcesPath, 'utf-8'));
    extResourcesJson = JSON.stringify(extData);
  }

  // Check if decoded assets should be re-encoded into the manifest
  // If assets/ dir has files that are newer than manifest.json, re-encode them
  const assetsDir = path.join(SRC_DIR, 'assets');
  if (fs.existsSync(assetsDir)) {
    const manifestMtime = fs.statSync(path.join(SRC_DIR, 'manifest.json')).mtimeMs;
    const assetFiles = fs.readdirSync(assetsDir);

    for (const file of assetFiles) {
      const filePath = path.join(assetsDir, file);
      const stat = fs.statSync(filePath);

      if (stat.mtimeMs > manifestMtime) {
        // This asset was modified — re-encode it into the manifest
        const uuid = path.basename(file, path.extname(file));
        if (manifestData[uuid]) {
          console.log(`  ↻ Re-encoding modified asset: ${file}`);
          const raw = fs.readFileSync(filePath);
          let encoded;
          if (manifestData[uuid].compressed) {
            encoded = zlib.gzipSync(raw);
          } else {
            encoded = raw;
          }
          manifestData[uuid].data = encoded.toString('base64');
        }
      }
    }
  }

  // Serialize manifest (compact, single line)
  const manifestJson = JSON.stringify(manifestData);

  // Serialize template (JSON-encoded HTML string, single line)
  const templateJson = JSON.stringify(templateHtml);

  // Assemble the final HTML
  // The original format has the loader inline with specific whitespace
  const parts = [
    shell,
    '',
    '  <script>\n    \n' + loader + '\n',
    '  </script>',
    '',
    '  <script type="__bundler/manifest">',
    manifestJson,
    '  </script>',
    '',
    '  <script type="__bundler/ext_resources">',
    extResourcesJson,
    '  </script>',
    '',
    '  <script type="__bundler/template">',
    templateJson,
    '  </script>',
    '',
    '</body>',
    '</html>',
    '' // trailing newline
  ];

  const output = parts.join('\n');
  fs.writeFileSync(OUTPUT, output);

  const sizeKB = (Buffer.byteLength(output) / 1024).toFixed(1);
  console.log(`\n✓ Built: ${OUTPUT} (${sizeKB} KB)`);
}

main();
