// Run against disposable fixture accounts only; credentials stay in a private file.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const [base, fixturePath] = process.argv.slice(2);
if (!base || !fixturePath) throw Error("base URL and fixture file required");
const users = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const clients = [];
const access = (user, method = "GET", origin = base) => fetch(base + "/api/todo/mcp/access", { method, headers: { Cookie: "life_session=" + user.token, ...(origin ? { Origin: origin } : {}) } });
const args = revision => ({ request_id: randomUUID(), expected_revision: revision });
try {
  assert.equal((await fetch(base + "/api/todo/mcp")).status, 401);
  assert.equal((await fetch(base + "/api/todo/mcp/access")).status, 401);
  assert.equal((await access(users[0], "POST", "https://elsewhere.example")).status, 403);
  assert.equal((await access(users[0], "POST", null)).status, 403);
  for (const user of users) {
    const response = await access(user, "POST"); assert.equal(response.status, 200);
    const { key } = await response.json();
    const client = new Client({ name: "xipo-live-smoke", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(base + "/api/todo/mcp"), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
    assert.equal((await client.listTools()).tools.length, 6);
    clients.push({ client, key });
  }
  const [a,b] = clients;
  const call = async (client, name, arguments_) => { const result = await client.callTool({ name, arguments: arguments_ }); assert.notEqual(result.isError, true, JSON.stringify(result)); return result.structuredContent; };
  const day = await call(a.client, "get_day_schedule", { date: "2099-02-01" });
  const request = { ...args(day.revision), title: "MCP临时验证", date: "2099-02-01", start: "14:00", end: "15:00", notes: "测试细节" };
  const created = await call(a.client, "create_event", request), id = created.changed[0].event.id;
  const replay = await call(a.client, "create_event", request); assert.equal(replay.replayed, true); assert.equal(replay.changed[0].event.id,id);
  const foreign = await b.client.callTool({ name: "get_event_details", arguments: { id } }); assert.equal(foreign.isError,true);
  const details = await call(a.client, "get_event_details", { id }); assert.equal(details.event.notes,"测试细节");
  const updated = await call(a.client, "update_event", { ...args(created.revision), id, patch: { title:"已调整", start:"16:00", end:"17:00" } });
  const day2 = await call(a.client,"get_day_schedule",{date:"2099-02-01"});assert.equal(day2.events[0].title,"已调整");
  const apiResponse = await fetch(base+"/api/todo",{headers:{Cookie:"life_session="+users[0].token}});const app=await apiResponse.json();assert.equal(app.state.events.find(e=>e.id===id).start,"16:00");
  await call(a.client,"delete_event",{...args(updated.revision),id});
  assert.equal((await call(a.client,"get_day_schedule",{date:"2099-02-01"})).total,0);
  const status=await(await access(users[0])).json();assert.ok(status.calls>0);assert.ok(status.lastUsedAt);assert.equal('key'in status,false);
  const replacement=await(await access(users[0],"POST")).json();assert.ok(replacement.key);
  const oldResponse=await fetch(base+"/api/todo/mcp",{headers:{Authorization:`Bearer ${a.key}`}});assert.equal(oldResponse.status,401);
  await access(users[0],"DELETE");await access(users[1],"DELETE");
  assert.equal((await fetch(base+"/api/todo/mcp",{headers:{Authorization:`Bearer ${replacement.key}`}})).status,401);
  assert.equal((await fetch(base+"/widgets/xipo-today.js")).status,200);
  console.log("PASS: official MCP client handshake, six tools, create/read/update/delete, retry deduplication, account isolation, shared app data, key status/rotation/revocation and script delivery.");
} finally {
  await Promise.allSettled(clients.map(({client})=>client.close()));
  await Promise.allSettled(users.map(user=>access(user,"DELETE")));
}
