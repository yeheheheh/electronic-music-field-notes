/**
 * 验证 HTTPS 上线后的关键路径。
 *
 *   node scripts/regression/check-https.mjs https://em.example.com/music/
 *   node scripts/regression/check-https.mjs http://127.0.0.1:5501/music/ --allow-http
 */
const args = process.argv.slice(2);
const base = (args.find((item) => !item.startsWith('--')) || '').replace(/\/?$/, '/');
const allowHttp = args.includes('--allow-http');

if (!base) {
  console.error('用法: node scripts/regression/check-https.mjs <站点根地址> [--allow-http]');
  process.exit(2);
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

async function get(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const body = await response.text();
  return { response, body };
}

const isHttps = base.startsWith('https://');
check('站点使用 HTTPS', isHttps || allowHttp, isHttps ? '' : 'http 仅用于本地验收');

const page = await get(base);
check(
  '首页返回 200',
  page.response.status === 200,
  `status=${page.response.status}`,
);
check(
  '首页是 HTML',
  (page.response.headers.get('content-type') || '').includes('text/html'),
  page.response.headers.get('content-type') || 'missing content-type',
);
check('首页包含站点标题', page.body.includes('电音档案'));

if (isHttps) {
  const httpUrl = base.replace(/^https:/, 'http:');
  const redirect = await fetch(httpUrl, { redirect: 'manual' });
  const location = redirect.headers.get('location') || '';
  check(
    'HTTP 跳转到 HTTPS',
    [301, 302, 307, 308].includes(redirect.status) && location.startsWith('https://'),
    `status=${redirect.status} location=${location || 'missing'}`,
  );
}

const sw = await get(new URL('sw.js', base));
check('sw.js 返回 200', sw.response.status === 200, `status=${sw.response.status}`);
check(
  'sw.js 是 JavaScript',
  (sw.response.headers.get('content-type') || '').includes('javascript'),
  sw.response.headers.get('content-type') || 'missing content-type',
);
check('sw.js 含 VERSION', /VERSION/.test(sw.body));
check(
  'sw.js 不被长缓存',
  /no-cache|no-store/.test(sw.response.headers.get('cache-control') || ''),
  sw.response.headers.get('cache-control') || 'missing cache-control',
);

const kb = await get(new URL('data/kb.js', base));
check('data/kb.js 返回 200', kb.response.status === 200, `status=${kb.response.status}`);
check(
  'kb.js 启用了压缩',
  /gzip|br|zstd/.test(kb.response.headers.get('content-encoding') || ''),
  kb.response.headers.get('content-encoding') || 'identity',
);

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length ? 1 : 0);
