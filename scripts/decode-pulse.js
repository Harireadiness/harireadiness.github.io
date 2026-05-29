#!/usr/bin/env node
/**
 * decode-pulse.js
 *
 * Extracts the compressed single-file pulse.html into editable source files:
 *   pulse-19800226/src/
 *     shell.html        — the outer HTML (head, styles, thumbnail SVG, loader)
 *     loader.js         — the bootstrap/unpacker script
 *     manifest.json     — asset registry (uuid → mime, compressed, data)
 *     ext_resources.json— external resource mappings
 *     template.html     — the actual app HTML (decoded from JSON string)
 *
 * Usage: npm run decode
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PULSE_DIR = path.resolve(__dirname, '..', 'pulse-19800226');
const PULSE_HTML = path.join(PULSE_DIR, 'pulse.html');
const SRC_DIR = path.join(PULSE_DIR, 'src');

function extractBetweenTags(html, type) {
  const openTag = `<script type="${type}">`;
  const closeTag = '</script>';
  const start = html.indexOf(openTag);
  if (start === -1) return null;
  const contentStart = start + openTag.length;
  const end = html.indexOf(closeTag, contentStart);
  if (end === -1) return null;
  return {
    content: html.slice(contentStart, end).trim(),
    start,
    end: end + closeTag.length
  };
}

function extractLoaderScript(html) {
  // The loader is the first <script> tag (without a type attribute) before the bundler tags
  const marker = '<script type="__bundler/manifest">';
  const bundlerStart = html.indexOf(marker);

  // Find the last </script> before the bundler manifest
  const beforeBundler = html.slice(0, bundlerStart);
  const scriptOpenRegex = /<script>/g;
  let lastScriptOpen = -1;
  let match;
  while ((match = scriptOpenRegex.exec(beforeBundler)) !== null) {
    lastScriptOpen = match.index;
  }

  if (lastScriptOpen === -1) return null;

  const contentStart = lastScriptOpen + '<script>'.length;
  const scriptClose = beforeBundler.lastIndexOf('</script>');
  const content = html.slice(contentStart, scriptClose).trim();

  return {
    content,
    start: lastScriptOpen,
    end: scriptClose + '</script>'.length
  };
}

function main() {
  if (!fs.existsSync(PULSE_HTML)) {
    console.error(`Error: ${PULSE_HTML} not found`);
    process.exit(1);
  }

  const html = fs.readFileSync(PULSE_HTML, 'utf-8');

  // Extract the loader script
  const loader = extractLoaderScript(html);
  if (!loader) {
    console.error('Error: Could not find loader script');
    process.exit(1);
  }

  // Extract bundler data sections
  const manifest = extractBetweenTags(html, '__bundler/manifest');
  const extResources = extractBetweenTags(html, '__bundler/ext_resources');
  const template = extractBetweenTags(html, '__bundler/template');

  if (!manifest) {
    console.error('Error: Could not find __bundler/manifest');
    process.exit(1);
  }
  if (!template) {
    console.error('Error: Could not find __bundler/template');
    process.exit(1);
  }

  // The shell is everything before the loader script
  const shell = html.slice(0, loader.start).trimEnd();

  // Create src directory
  fs.mkdirSync(SRC_DIR, { recursive: true });

  // Write shell.html
  fs.writeFileSync(path.join(SRC_DIR, 'shell.html'), shell + '\n');
  console.log('  ✓ shell.html');

  // Write loader.js
  fs.writeFileSync(path.join(SRC_DIR, 'loader.js'), loader.content + '\n');
  console.log('  ✓ loader.js');

  // Write manifest.json (pretty-printed)
  const manifestData = JSON.parse(manifest.content);
  fs.writeFileSync(
    path.join(SRC_DIR, 'manifest.json'),
    JSON.stringify(manifestData, null, 2) + '\n'
  );
  console.log(`  ✓ manifest.json (${Object.keys(manifestData).length} assets)`);

  // Write ext_resources.json
  if (extResources) {
    const extData = JSON.parse(extResources.content);
    fs.writeFileSync(
      path.join(SRC_DIR, 'ext_resources.json'),
      JSON.stringify(extData, null, 2) + '\n'
    );
    console.log(`  ✓ ext_resources.json (${extData.length} entries)`);
  }

  // Write template.html (the template is a JSON-encoded HTML string)
  const templateHtml = JSON.parse(template.content);
  fs.writeFileSync(path.join(SRC_DIR, 'template.html'), templateHtml);
  console.log('  ✓ template.html');

  // Also decode individual assets into an assets/ directory for inspection
  const assetsDir = path.join(SRC_DIR, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const mimeToExt = {
    'application/javascript': '.js',
    'text/javascript': '.js',
    'text/css': '.css',
    'text/html': '.html',
    'image/svg+xml': '.svg',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'application/json': '.json',
    'font/woff2': '.woff2',
    'font/woff': '.woff',
    'font/ttf': '.ttf',
    'text/plain': '.txt'
  };

  let assetCount = 0;
  for (const [uuid, entry] of Object.entries(manifestData)) {
    const ext = mimeToExt[entry.mime] || '.bin';
    const filename = `${uuid}${ext}`;

    try {
      const raw = Buffer.from(entry.data, 'base64');
      let decoded;
      if (entry.compressed) {
        decoded = zlib.gunzipSync(raw);
      } else {
        decoded = raw;
      }
      fs.writeFileSync(path.join(assetsDir, filename), decoded);
      assetCount++;
    } catch (err) {
      console.warn(`  ⚠ Failed to decode asset ${uuid}: ${err.message}`);
    }
  }
  console.log(`  ✓ assets/ (${assetCount} files decoded)`);

  console.log(`\nDone! Source files written to: ${SRC_DIR}`);
  console.log('Edit the files in src/, then run: npm run build');
}

main();
