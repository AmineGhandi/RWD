import assert from "node:assert/strict";
import {
  HubConnectionBuilder,
  LogLevel,
  HttpTransportType,
} from "../client/node_modules/@microsoft/signalr/dist/cjs/index.js";
const base = process.env.GAME_BASE_URL ?? "http://127.0.0.1:5080";
async function post(path, body) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(r.status, 200);
  return r.json();
}
const h = await post("/api/rooms");
const a = await post(`/api/rooms/${h.code}/players`, { name: "Amine" });
const b = await post(`/api/rooms/${h.code}/players`, { name: "Sara" });
const sessions = [];
async function connect(credentials, role) {
  const s = {
    state: null,
    hub: new HubConnectionBuilder()
      .withUrl(base + "/game", { transport: HttpTransportType.LongPolling })
      .configureLogging(LogLevel.Error)
      .build(),
  };
  s.hub.on("State", (next) => {
    if (!s.state || next.revision >= s.state.revision) s.state = next;
  });
  await s.hub.start();
  await s.hub.invoke("Attach", h.code, role, credentials?.token ?? "");
  sessions.push(s);
  return s;
}
const host = await connect(h, "host"),
  pa = await connect(a, "player"),
  pb = await connect(b, "player"),
  tv = await connect(null, "display");
async function wait(test) {
  for (let i = 0; i < 100; i++) {
    if (test()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("State sync timeout");
}
async function act(kind, extra = {}) {
  await host.hub.invoke("Act", h.code, {
    kind,
    roundId: host.state.roundId,
    attemptId: host.state.attemptId,
    ...extra,
  });
  await wait(() =>
    sessions.every((s) => s.state.revision >= host.state.revision),
  );
}
try {
  await wait(() => sessions.every((s) => s.state));
  assert.ok(
    pa.state.questions.every((q) => q.answer === null && q.text === null),
  );
  assert.ok(tv.state.questions.every((q) => q.answer === null));
  await assert.rejects(pa.hub.invoke("Act", h.code, { kind: "start" }));
  await act("start");
  await act("select", { questionId: "q0-0" });
  assert.equal(await pa.hub.invoke("Buzz", h.code, host.state.roundId), false);
  await act("open");
  const race = await Promise.all([
    pa.hub.invoke("Buzz", h.code, host.state.roundId),
    pb.hub.invoke("Buzz", h.code, host.state.roundId),
  ]);
  assert.equal(race.filter(Boolean).length, 1);
  await wait(() => host.state.phase === "answering");
  const winner = host.state.winnerId;
  const winnerSession = winner === a.playerId ? pa : pb;
  const loserSession = winner === a.playerId ? pb : pa;
  const oldAttempt = host.state.attemptId;
  await act("judge", { correct: false });
  await assert.rejects(
    host.hub.invoke("Act", h.code, {
      kind: "judge",
      roundId: host.state.roundId,
      attemptId: oldAttempt,
      correct: false,
    }),
  );
  await act("open");
  assert.equal(
    await winnerSession.hub.invoke("Buzz", h.code, host.state.roundId),
    true,
  );
  await wait(() => host.state.phase === "answering");
  await act("judge", { correct: false });
  await act("open");
  assert.equal(
    await loserSession.hub.invoke("Buzz", h.code, host.state.roundId),
    true,
  );
  await wait(() => host.state.phase === "answering");
  await act("judge", { correct: true });
  assert.ok(tv.state.questions.every((q) => q.answer === null));
  await act("reveal");
  assert.equal(
    pa.state.questions.find((q) => q.id === "q0-0").answer,
    "The Terminator",
  );
  assert.equal(
    tv.state.questions.find((q) => q.id === "q0-0").answer,
    "The Terminator",
  );
  assert.equal(pa.state.players.find((p) => p.id === winner).score, -200);
  assert.equal(pa.state.players.find((p) => p.id !== winner).score, 100);
  const oldScore = pa.state.players.find((p) => p.id === a.playerId).score;
  await pa.hub.stop();
  await pa.hub.start();
  await pa.hub.invoke("Attach", h.code, "player", a.token);
  await wait(() => pa.state.players.find((p) => p.id === a.playerId).connected);
  assert.equal(
    pa.state.players.find((p) => p.id === a.playerId).score,
    oldScore,
  );
  await act("board");
  assert.ok(host.state.questions.find((q) => q.id === "q0-0").played);
  assert.ok(tv.state.questions.every((q) => q.answer === null));
  console.log(
    "PASS: live HTTP + SignalR host / two players / display, authorization, race, wrong lockout, duplicate judgement, private answer, score sync and reconnect.",
  );
} finally {
  await Promise.all(sessions.map((s) => s.hub.stop()));
}
