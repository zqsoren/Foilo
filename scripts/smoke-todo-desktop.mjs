// Only runs against the named disposable local fixture. Never use real credentials.
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3000';
const sessionURL = base + '/api/todo/desktop/session';
assert.equal((await fetch(base + '/api/todo/desktop')).status, 401);
const body = JSON.stringify({ phone: '19900002601', password: 'WidgetPreview2026!' });
for (const origin of [undefined, 'https://elsewhere.example']) {
  assert.equal((await fetch(sessionURL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body })).status, 403);
}
const response = await fetch(sessionURL, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body });
assert.equal(response.status, 200);
const setCookie = response.headers.get('set-cookie');
assert.match(setCookie, /HttpOnly/i);
const cookie = setCookie.split(';')[0];
const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json' };
try {
  const day = await (await fetch(base + '/api/todo/desktop', { headers })).json();
  assert.equal(day.account.name, '小组件测试'); assert.equal(day.total, 3);
  assert.equal('messages' in day, false);
  for (const origin of [undefined, 'https://elsewhere.example']) {
    assert.equal((await fetch(base + '/api/todo/desktop', { method: 'POST', headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) }, body: '{}' })).status, 403);
    assert.equal((await fetch(sessionURL, { method: 'DELETE', headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) } })).status, 403);
  }
  assert.equal((await fetch(base + '/api/todo/desktop', { method: 'POST', headers, body: '{"unexpected":true}' })).status, 400);
} finally { assert.equal((await fetch(sessionURL, { method: 'DELETE', headers })).status, 200); }
assert.equal((await fetch(base + '/api/todo/desktop', { headers })).status, 401);
console.log('PASS: desktop login cookie, unauthenticated access, same-origin writes/logout, account identity, minimal response, malformed input and session revocation.');
