const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SRC = path.join(__dirname, '..', 'Que Social _standalone_.html');
const OUT = path.join(__dirname, '_redesign');
fs.mkdirSync(OUT, { recursive: true });

const html = fs.readFileSync(SRC, 'utf8');
function extract(type) {
  const re = new RegExp('<script type="__bundler/' + type + '">([\\s\\S]*?)</script>');
  const m = html.match(re);
  return m ? m[1] : null;
}

// ── template: the HTML (with asset-uuid placeholders) ──
const template = JSON.parse(extract('template'));
fs.writeFileSync(path.join(OUT, 'template.html'), template);
console.log('template bytes:', template.length);

// ── manifest: assets (base64, maybe gzipped). Save text assets, summarize all ──
const manifest = JSON.parse(extract('manifest'));
const summary = [];
for (const [uuid, e] of Object.entries(manifest)) {
  let bytes = Buffer.from(e.data, 'base64');
  if (e.compressed) { try { bytes = zlib.gunzipSync(bytes); } catch (err) { /* leave raw */ } }
  const mime = e.mime || '';
  summary.push({ uuid: uuid.slice(0, 8), mime, bytes: bytes.length });
  if (/text|json|javascript|css|svg|xml/.test(mime)) {
    const ext = mime.includes('css') ? 'css'
      : mime.includes('javascript') ? 'js'
      : mime.includes('html') ? 'html'
      : mime.includes('svg') ? 'svg' : 'txt';
    fs.writeFileSync(path.join(OUT, uuid.slice(0, 8) + '.' + ext), bytes);
  }
}
console.log('assets:', summary.length);
console.log(JSON.stringify(summary, null, 2));

const extRes = extract('ext_resources');
if (extRes) fs.writeFileSync(path.join(OUT, 'ext_resources.json'), extRes);
