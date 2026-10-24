const BASE = process.env.KB_HTTP_BASE || 'http://127.0.0.1:8787';

const search = await fetch(`${BASE}/search?q=${encodeURIComponent('uplifting trance')}&limit=3`).then((response) => response.json());
console.log('search:', search.results.map((item) => `${item.title} [${item.id}]`));

const context = await fetch(`${BASE}/context?q=${encodeURIComponent('七组音色怎么分工')}&limit=3&max_chars=4000`).then((response) => response.json());
console.log('\ncontext:\n', context.markdown);

const entry = await fetch(`${BASE}/get?id=g-1581`).then((response) => response.json());
console.log('\nentry:', entry.name, entry.family?.name);
