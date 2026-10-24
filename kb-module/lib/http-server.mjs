import http from 'node:http';

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, status, payload) {
  setCors(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, status, text) {
  setCors(response);
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(text);
}

function readBody(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function queryOptions(params) {
  return {
    limit: params.get('limit') || undefined,
    family: params.get('family') || undefined,
    type: params.get('type') || undefined,
    sourceId: params.get('source_id') || params.get('sourceId') || undefined,
    bpmMin: params.get('bpm_min') || params.get('bpmMin') || undefined,
    bpmMax: params.get('bpm_max') || params.get('bpmMax') || undefined,
  };
}

export async function startHttpServer({ kb, port = 8787, host = '127.0.0.1' } = {}) {
  if (!kb) throw new Error('startHttpServer requires a loaded kb instance');
  const server = http.createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      setCors(response);
      response.writeHead(204);
      response.end();
      return;
    }
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const pathname = url.pathname.replace(/\/+$/, '') || '/';

      if (request.method === 'GET' && pathname === '/') {
        sendJson(response, 200, {
          module: kb.manifestInfo().module,
          endpoints: ['/health', '/manifest', '/families', '/search?q=', '/context?q=', '/get?id=', '/entry/:id'],
        });
        return;
      }
      if (request.method === 'GET' && pathname === '/health') {
        sendJson(response, 200, {
          status: 'ok',
          module: kb.manifestInfo().module,
          builtAt: kb.manifestInfo().builtAt,
          stats: kb.stats(),
        });
        return;
      }
      if (request.method === 'GET' && pathname === '/manifest') {
        sendJson(response, 200, kb.manifestInfo());
        return;
      }
      if (request.method === 'GET' && pathname === '/families') {
        sendJson(response, 200, { families: kb.families() });
        return;
      }
      if (request.method === 'GET' && pathname === '/search') {
        const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
        if (!query.trim()) {
          sendJson(response, 400, { error: 'q 参数不能为空' });
          return;
        }
        sendJson(response, 200, kb.search(query, queryOptions(url.searchParams)));
        return;
      }
      if (request.method === 'POST' && pathname === '/search') {
        const body = JSON.parse((await readBody(request)) || '{}');
        const query = body.query || body.q || '';
        if (!String(query).trim()) {
          sendJson(response, 400, { error: 'query 不能为空' });
          return;
        }
        sendJson(response, 200, kb.search(query, body));
        return;
      }
      if (request.method === 'GET' && pathname === '/context') {
        const query = url.searchParams.get('q') || url.searchParams.get('query') || '';
        if (!query.trim()) {
          sendJson(response, 400, { error: 'q 参数不能为空' });
          return;
        }
        const result = kb.context(query, {
          ...queryOptions(url.searchParams),
          maxChars: url.searchParams.get('max_chars') || url.searchParams.get('maxChars') || undefined,
        });
        if (url.searchParams.get('format') === 'text') {
          sendText(response, 200, result.markdown);
        } else {
          sendJson(response, 200, result);
        }
        return;
      }
      if (request.method === 'GET' && (pathname === '/get' || pathname.startsWith('/entry/'))) {
        const id = pathname === '/get'
          ? url.searchParams.get('id')
          : decodeURIComponent(pathname.slice('/entry/'.length));
        if (!id) {
          sendJson(response, 400, { error: 'id 参数不能为空' });
          return;
        }
        const item = kb.get(id);
        if (!item) {
          sendJson(response, 404, { error: `没有找到：${id}` });
          return;
        }
        sendJson(response, 200, item);
        return;
      }
      sendJson(response, 404, { error: 'Not found', path: pathname });
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    server,
    host,
    port: typeof address === 'object' && address ? address.port : port,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
