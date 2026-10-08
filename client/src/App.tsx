import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useGame } from "./useGame";
import type { Action, Player, Question, Room, Session } from "./types";
import {
  downloadExcelTemplate,
  exportCurrentBoard,
  parseExcelFile,
  type ParsedBoard,
} from "./excel";

const params = new URLSearchParams(location.search);
function getRoute() {
  return location.pathname.split("/").filter(Boolean);
}
function readSession(): Session | null {
  const route = getRoute();
  const code = (route[1] ?? params.get("room") ?? "").toUpperCase();
  if (route[0] === "display" && code)
    return { code, token: "", role: "display" };
  if (!route[0] || !code)
    return null;
  const key =
    route[0] === "host"
      ? `rwd-host-${code}`
      : `rwd-player-${code}`;
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as Session | null;
  } catch {
    return null;
  }
}
function saveSession(session: Session) {
  sessionStorage.setItem(
    `rwd-${session.role}-${session.code}`,
    JSON.stringify(session),
  );
  history.pushState(
    null,
    "",
    `/${session.role === "player" ? "join" : session.role}/${session.code}`,
  );
}
const score = (n: number) => n.toLocaleString("en-US");
export function Wordmark() {
  return (
    <div className="wordmark" aria-label="rb7a wla db7a">
      <span>RB7A</span>
      <small>WLA</small>
      <span>DB7A</span>
    </div>
  );
}
function Pill({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
function Scores({ room }: { room: Room }) {
  return (
    <div className="scores">
      {room.players.map((p) => (
        <div
          className={`score-card ${p.id === room.winnerId ? "active" : ""}`}
          key={p.id}
        >
          <span>{p.name}</span>
          <strong>{score(p.score)}</strong>
        </div>
      ))}
    </div>
  );
}
function PlayerList({ room }: { room: Room }) {
  return (
    <div className="player-list">
      {room.players.map((p) => (
        <div className="player-row" key={p.id}>
          <span className="avatar" aria-hidden="true">
            {p.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="player-name">
            <b>{p.name}</b>
            <small className={p.connected ? "online" : "muted"}>
              {p.connected ? "Connected" : "Offline"}
            </small>
          </div>
          <strong>{score(p.score)}</strong>
        </div>
      ))}
    </div>
  );
}
function Timer({
  deadline,
  serverNow,
}: {
  deadline: string;
  serverNow: string;
}) {
  const [seconds, setSeconds] = useState(30);
  useEffect(() => {
    const receivedAt = performance.now();
    const duration = Date.parse(deadline) - Date.parse(serverNow);
    const update = () =>
      setSeconds(
        Math.min(
          30,
          Math.max(
            0,
            Math.ceil((duration - (performance.now() - receivedAt)) / 1000),
          ),
        ),
      );
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [deadline, serverNow]);
  return (
    <span className="timer" aria-label="Time remaining">
      00:{String(seconds).padStart(2, "0")}
    </span>
  );
}
export function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState(() => (getRoute()[1] ?? params.get("room") ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [entryError, setEntryError] = useState("");
  const game = useGame(session, (reason) => {
    if (session) {
      sessionStorage.removeItem(`rwd-${session.role}-${session.code}`);
    }
    history.pushState(null, "", "/");
    setSession(null);
    setCode("");
    setName("");
    setEntryError(reason || "The host closed the room.");
  });

  useEffect(() => {
    const handlePopState = () => {
      setSession(readSession());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  async function handleBackToCreate() {
    const currentRoom = game.room;
    if (!session || !currentRoom) {
      history.pushState(null, "", "/");
      setSession(null);
      setCode("");
      setName("");
      setEntryError("");
      return;
    }

    if (currentRoom.phase !== "lobby") {
      // Game has started: return to "Your room is ready" page with questions intact
      try {
        await game.act({ kind: "lobby" });
      } catch (e) {
        console.error("Failed to return to lobby:", e);
      }
    } else {
      // In lobby: delete the room, kick players, and return to game creating page
      try {
        await game.act({ kind: "delete" });
      } catch {
        await fetch(`/api/rooms/${encodeURIComponent(session.code)}`, {
          method: "DELETE",
          headers: { "X-Host-Token": session.token },
        }).catch(() => { });
      }
      sessionStorage.removeItem(`rwd-host-${session.code}`);
      history.pushState(null, "", "/");
      setSession(null);
      setCode("");
      setName("");
      setEntryError("");
    }
  }
  async function enter(host: boolean) {
    setPending(true);
    setEntryError("");
    try {
      const response = await fetch(
        host
          ? "/api/rooms"
          : `/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/players`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: host ? undefined : JSON.stringify({ name: name.trim() }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not connect. Please try again.");
      }
      const data = await response.json();
      const next: Session = { ...data, role: host ? "host" : "player" };
      saveSession(next);
      setSession(next);
    } catch (e) {
      setEntryError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setPending(false);
    }
  }
  if (!session)
    return (
      <main className="entry">
        <Wordmark />
        <div className="entry-card panel">
          <Pill tone="lavender">GAME NIGHT STARTS HERE</Pill>
          <h1>
            {location.pathname.startsWith("/host")
              ? "Host session missing"
              : "Ready to play?"}
          </h1>
          {location.pathname.startsWith("/host") && (
            <p className="muted">
              Open the host link in the browser where you created the room. Or
              create a new room below.
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enter(false);
            }}
          >
            <label>
              Room code
              <input
                autoComplete="off"
                name="room"
                maxLength={6}
                placeholder="Enter room code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </label>
            <label>
              Your name
              <input
                name="name"
                autoComplete="nickname"
                maxLength={32}
                placeholder="What should we call you?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={pending}>
              Join the game →
            </button>
          </form>
          <div className="or">or take the controls</div>
          <button
            className="secondary full"
            disabled={pending}
            onClick={() => void enter(true)}
          >
            Create a room
          </button>
          {entryError && (
            <p role="alert" className="error">
              {entryError}
            </p>
          )}
        </div>
        <p className="muted center">
          One host. A shared screen. Your phone is the buzzer.
        </p>
      </main>
    );
  const room = game.room;
  const connected = game.connection === "connected";
  const command = (action: Action) => {
    void game.act(action).catch(() => { });
  };
  if (!room)
    return (
      <main className="entry">
        <Wordmark />
        <div className="panel center">
          <h1>Connecting to {session.code}…</h1>
          <p>Finding your game.</p>
          {game.error && (
            <p className="error" role="alert">
              {game.error}
            </p>
          )}
          <button className="secondary" onClick={() => location.reload()}>
            Reconnect
          </button>
          <a className="text-link" href="/">
            Back to join
          </a>
        </div>
      </main>
    );
  return (
    <main
      className={`${session.role === "display" ? "display" : session.role === "player" ? "mobile" : "host"} app ${!connected ? "offline" : ""}`}
    >
      <header>
        <Wordmark />
        <div className="header-pills">
          {session.role === "host" && (
            <button
              id="back-to-create-btn"
              type="button"
              className="header-btn"
              onClick={() => void handleBackToCreate()}
              title={
                room.phase !== "lobby"
                  ? "Return to 'Your room is ready' page with questions intact"
                  : "Delete room, kick players, and return to game creating page"
              }
            >
              ← Back to create game
            </button>
          )}
          {session.role === "host" && <Pill tone="lavender">HOST VIEW</Pill>}
          <Pill>ROOM {room.code}</Pill>
        </div>
      </header>
      <div className="divider" />
      {!connected && (
        <div className="connection-banner" role="status">
          Connection lost. Buzzers are paused on this device.{" "}
          <button className="quiet" onClick={() => location.reload()}>
            Reconnect
          </button>
        </div>
      )}
      {game.error && (
        <div className="error-banner" role="alert">
          {game.error}
          <button
            aria-label="Dismiss error"
            className="quiet"
            onClick={() => game.setError("")}
          >
            ×
          </button>
        </div>
      )}
      <fieldset className="game-content" disabled={!connected}>
        {session.role === "host" ? (
          <Host room={room} command={command} act={game.act} />
        ) : session.role === "display" ? (
          <Display room={room} />
        ) : (
          <Phone
            room={room}
            playerId={session.playerId!}
            buzz={game.buzz}
            connected={connected}
          />
        )}
      </fieldset>
      <footer>
        <span className={connected ? "online" : "muted"}>
          ● {connected ? "Connected" : game.connection}
        </span>
        {session.role === "host" && (
          <span>Answers stay on your screen until you reveal them.</span>
        )}
        {session.role === "player" && room.deadline ? (
          <Timer deadline={room.deadline} serverNow={room.serverNow} />
        ) : (
          <span>
            {room.players.filter((p) => p.connected).length} players connected
          </span>
        )}
      </footer>
    </main>
  );
}
function JoinDetails({ room }: { room: Room }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/join/${room.code}`;
  return (
    <div className="join-details">
      <div className="qr">
        <QRCodeSVG
          value={url}
          size={172}
          level="M"
          title="Scan to join the game"
        />
      </div>
      <div>
        <p className="eyebrow">SCAN TO JOIN, OR ENTER</p>
        <div className="room-code">{room.code}</div>
        <p className="muted join-url">{url}</p>
        <button
          className="secondary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => { });
          }}
        >
          {copied ? "Copied!" : "Copy join link"}
        </button>
      </div>
    </div>
  );
}
function Host({
  room,
  command,
  act,
}: {
  room: Room;
  command: (action: Action) => void;
  act: (action: Action) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Question | null>(null);
  const [importBoard, setImportBoard] = useState<ParsedBoard | null>(null);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportError("");
    setImportSuccess("");
    try {
      const parsed = await parseExcelFile(file);
      setImportBoard(parsed);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to parse Excel file."
      );
    }
  };

  const question = room.questions.find((q) => q.id === room.questionId);
  const winner = room.players.find((p) => p.id === room.winnerId);
  const active = !["lobby", "board", "finished", "wager_setup"].includes(room.phase);
  const wagerSetup = room.phase === "wager_setup";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {room.phase === "lobby"
              ? "Get the gang together."
              : room.phase === "finished"
                ? "That’s a wrap."
                : wagerSetup
                  ? "Wager in progress."
                  : active
                    ? "You’re in control."
                    : "Your board. Your rules."}
          </h1>
          <p className="muted">
            {room.phase === "lobby"
              ? "Share the code. Edit your board. Start when everyone’s here."
              : wagerSetup
                ? "Set the wager with the chosen participant, then reveal the clue."
                : active
                  ? "Read the question, open the buzzers, then judge the answer."
                  : "Click a tile to show the question. Click a category to rename it."}
          </p>
        </div>
        <a
          className="button secondary"
          href={`/display/${room.code}`}
          target="_blank"
          rel="noopener"
        >
          Open shared display ↗
        </a>
      </div>
      {room.phase === "lobby" && (
        <div className="lobby-layout">
          <section className="panel">
            <h2>Your room is ready.</h2>
            <JoinDetails room={room} />
            <div className="note">
              Personalise the questions below before starting, or import an Excel file.
            </div>
          </section>
          <section className="panel">
            <h2>
              Who’s here <Pill tone="lavender">{room.players.length}/16</Pill>
            </h2>
            <PlayerList room={room} />
            {!room.players.length && (
              <p className="muted">Waiting for your first player…</p>
            )}
            <button
              className="primary full"
              disabled={!room.players.some((p) => p.connected)}
              onClick={() => command({ kind: "start" })}
            >
              Start game →
            </button>
          </section>
        </div>
      )}
      {room.phase === "lobby" && (
        <div className="excel-tools-panel">
          <div className="excel-tools-info">
            <div>
              <h3>Questions & Answers Board</h3>
              <p className="muted">
                Import your customized categories, clues, and answers from an Excel file (.xlsx, .xls, .csv).
              </p>
            </div>
            {importSuccess && <Pill tone="mint">{importSuccess}</Pill>}
          </div>
          {importError && (
            <div className="error-banner">
              <span>{importError}</span>
              <button type="button" onClick={() => setImportError("")}>✕</button>
            </div>
          )}
          <div className="excel-buttons">
            <button
              className="primary"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              📂 Import from Excel
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => downloadExcelTemplate()}
            >
              📥 Download Excel template
            </button>
            <button
              className="quiet"
              type="button"
              onClick={() => exportCurrentBoard(room)}
            >
              ↗ Export current board
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={onFileSelected}
            />
          </div>
        </div>
      )}
      {room.phase === "finished" ? (
        <section className="panel final-scores">
          <h2>Final scores</h2>
          <Leaderboard players={room.players} />
          <a href="/" className="button primary">
            Create another room
          </a>
        </section>
      ) : (
        <div
          className={`workspace ${room.phase === "lobby" ? "lobby-board" : ""}`}
        >
          <section>
            {active && question ? (
              <div className="panel question-panel">
                <div className="question-top">
                  {room.wager && room.wager.locked ? (
                    <div className="wager-active-pill-row">
                      <Pill tone="amber">JBTI RB7A</Pill>
                      <Pill tone="mint">STAKE: {score(room.wager.amount)} PTS</Pill>
                      <Pill tone="lavender">
                        {
                          room.categories.find(
                            (c) => c.id === question.categoryId,
                          )?.name
                        }{" "}
                        · {room.wager.playerName}
                      </Pill>
                    </div>
                  ) : (
                    <Pill tone="lavender">
                      {
                        room.categories.find(
                          (c) => c.id === question.categoryId,
                        )?.name
                      }{" "}
                      · {question.value}
                    </Pill>
                  )}
                  {room.phase === "reading" && !room.wager && (
                    <button
                      className="quiet"
                      onClick={() => setEditing(question)}
                    >
                      Edit question
                    </button>
                  )}
                </div>
                <h2 className="question-title">{question.text}</h2>
                <div className="private-answer">
                  <p className="eyebrow">
                    {room.phase === "revealed"
                      ? "ANSWER · REVEALED TO EVERYONE"
                      : "ANSWER · ONLY YOU CAN SEE THIS"}
                  </p>
                  <h3>{question.answer}</h3>
                </div>
                {winner &&
                  ["answering", "wrong", "resolved"].includes(room.phase) && (
                    <div
                      className={`winner-banner ${room.phase === "wrong" ? "wrong" : ""}`}
                    >
                      <b>
                        {room.phase === "wrong"
                          ? "Wrong answer"
                          : room.phase === "resolved"
                            ? "Correct answer"
                            : "First buzz"}
                        : {winner.name}
                      </b>
                      <span>
                        {room.phase === "wrong"
                          ? `−${score(room.wager ? room.wager.amount : question.value)}`
                          : room.phase === "resolved"
                            ? `+${score(room.wager ? room.wager.amount : question.value)}`
                            : "has the floor"}
                      </span>
                    </div>
                  )}
                {room.phase === "answering" && (
                  <div className="actions">
                    <button
                      className="success"
                      onClick={() => command({ kind: "judge", correct: true })}
                    >
                      Correct +{score(room.wager ? room.wager.amount : question.value)}
                    </button>
                    <button
                      className="danger"
                      onClick={() => command({ kind: "judge", correct: false })}
                    >
                      Wrong −{score(room.wager ? room.wager.amount : question.value)}
                    </button>
                  </div>
                )}
                {room.wager && room.wager.locked ? (
                  room.phase === "reading" ? (
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={() => command({ kind: "open" })}
                      >
                        Enable buzzer for {room.wager.playerName}
                      </button>
                      <button
                        className="secondary"
                        onClick={() => command({ kind: "floor" })}
                      >
                        Give floor to {room.wager.playerName}
                      </button>
                    </div>
                  ) : room.phase === "wrong" ? (
                    <div className="note">
                      Wager round concluded: wrong answer (−{score(room.wager.amount)} pts). Other players cannot steal this question.
                    </div>
                  ) : room.phase === "expired" ? (
                    <button
                      className="primary"
                      onClick={() => command({ kind: "open" })}
                    >
                      Reopen buzzer for {room.wager.playerName}
                    </button>
                  ) : null
                ) : (
                  ["reading", "wrong", "expired"].includes(room.phase) && (
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={() => command({ kind: "open" })}
                      >
                        {room.phase === "reading"
                          ? "Enable buzzers"
                          : "Reopen buzzers"}
                      </button>
                      {room.phase === "reading" && !room.wager && (
                        <button
                          className="secondary wager-launch-inline-btn"
                          onClick={() =>
                            command({
                              kind: "wager_init",
                              questionId: question.id,
                            })
                          }
                          title="Assign this specific question as JBTI RB7A"
                        >
                          JBTI RB7A
                        </button>
                      )}
                    </div>
                  )
                )}
                {room.phase === "open" && (
                  <div className="note">
                    {room.wager
                      ? `Buzzers are open for ${room.wager.playerName}. Waiting for buzz…`
                      : "Buzzers are open. Waiting for the first valid buzz…"}
                  </div>
                )}
                {room.phase === "expired" && (
                  <p className="muted">
                    Time’s up. Reopen the buzzers or reveal the answer.
                  </p>
                )}
                <div className="actions bottom-actions">
                  {room.phase === "revealed" ? (
                    <button
                      className="primary"
                      onClick={() => command({ kind: "board" })}
                    >
                      Back to board →
                    </button>
                  ) : (
                    <>
                      <button
                        className="quiet"
                        onClick={() => command({ kind: "reveal" })}
                      >
                        Reveal answer
                      </button>
                      <button
                        className="secondary"
                        onClick={() => command({ kind: "skip" })}
                      >
                        Skip question
                      </button>
                    </>
                  )}
                  {["wrong", "resolved"].includes(room.phase) && (
                    <button
                      className="secondary"
                      onClick={() => command({ kind: "undo" })}
                    >
                      Undo judgement
                    </button>
                  )}
                </div>
                {room.phase === "revealed" && (
                  <p className="online">
                    The answer is now on everyone’s screen.
                  </p>
                )}
              </div>
            ) : (
              <Board room={room} host command={command} onEdit={setEditing} />
            )}
          </section>
          {room.phase !== "lobby" && (
            <aside className="panel">
              <h2>{active ? "Buzzers" : "Game controls"}</h2>
              <Pill tone={room.phase === "open" ? "amber" : "lavender"}>
                {phaseLabel(room.phase)}
              </Pill>
              <button
                id="bet-wla-db7a-btn"
                type="button"
                className="primary full wager-launch-btn"
                disabled={
                  active ||
                  room.phase !== "board" ||
                  room.questions.every((q) => q.played) ||
                  room.players.length === 0
                }
                onClick={() => command({ kind: "wager_init" })}
                title={
                  room.questions.every((q) => q.played)
                    ? "No unused questions remaining on the active board"
                    : active
                      ? "Cannot launch wager while a question is active"
                      : "Launch  wager round"
                }
              >
                JBTI RB7A
              </button>
              {room.deadline && (
                <div className="large-timer">
                  <Timer deadline={room.deadline} serverNow={room.serverNow} />
                </div>
              )}
              <h3>Players</h3>
              <PlayerList room={room} />
              <div className="aside-note">
                <p className="muted">
                  {active
                    ? "First valid buzz takes the floor."
                    : "30-second buzzer window · correct adds points · wrong subtracts points"}
                </p>
              </div>
            </aside>
          )}
        </div>
      )}
      {wagerSetup && (
        <WagerSetupModal
          room={room}
          onClose={() => command({ kind: "wager_cancel" })}
          onLock={async (playerId, wagerAmount, questionId) => {
            await act({ kind: "wager_lock", playerId, wagerAmount, questionId });
          }}
          onPlayerChange={async (playerId) => {
            await act({ kind: "wager_player", playerId });
          }}
          onQuestionChange={async (questionId) => {
            await act({ kind: "wager_question", questionId });
          }}
        />
      )}
      {editing && (
        <Editor
          question={editing}
          onClose={() => setEditing(null)}
          onSave={async (text, answer) => {
            await act({
              kind: "edit",
              edit: { questionId: editing.id, text, answer },
            });
            setEditing(null);
          }}
        />
      )}
      {importBoard && (
        <ImportModal
          board={importBoard}
          onClose={() => setImportBoard(null)}
          onApply={async () => {
            await act({
              kind: "import_board",
              board: importBoard,
            });
            setImportBoard(null);
            setImportSuccess("Board updated from Excel!");
          }}
        />
      )}
    </>
  );
}
function Board({
  room,
  host = false,
  command,
  onEdit,
}: {
  room: Room;
  host?: boolean;
  command?: (a: Action) => void;
  onEdit?: (q: Question) => void;
}) {
  return (
    <div className="board">
      {room.categories.map((c) => (
        <div className="category-column" key={c.id}>
          {host ? (
            <CategoryName
              name={c.name}
              onSave={(name) =>
                command!({ kind: "category", categoryId: c.id, name })
              }
            />
          ) : (
            <div className="category">{c.name}</div>
          )}
          {room.questions
            .filter((q) => q.categoryId === c.id)
            .map((q) => (
              <div
                className={`tile-wrap ${q.played ? "played" : ""}`}
                key={q.id}
              >
                {host && room.phase === "lobby" ? (
                  <button
                    className="tile"
                    onClick={() => onEdit!(q)}
                    aria-label={`Edit ${c.name} ${q.value}`}
                  >
                    <strong>{q.value}</strong>
                    <small>Edit question</small>
                  </button>
                ) : host ? (
                  <button
                    className="tile"
                    aria-label={`${c.name} ${q.value}${q.played ? " played" : ""}`}
                    disabled={q.played}
                    onClick={() =>
                      command!({ kind: "select", questionId: q.id })
                    }
                  >
                    <strong>{q.played ? "✓" : q.value}</strong>
                  </button>
                ) : (
                  <div className="tile">
                    <strong>{q.played ? "✓" : q.value}</strong>
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
function CategoryName({
  name,
  onSave,
}: {
  name: string;
  onSave: (name: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState(name);
  if (!edit)
    return (
      <button
        className="category"
        onClick={() => {
          setValue(name);
          setEdit(true);
        }}
        aria-label={`Rename ${name}`}
      >
        {name}
        <span aria-hidden="true"> ✎</span>
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onSave(value.trim());
          setEdit(false);
        }
      }}
    >
      <input
        className="category-input"
        aria-label="Category name"
        maxLength={32}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim() && value !== name) onSave(value.trim());
          setEdit(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setEdit(false);
          }
        }}
        autoFocus
      />
    </form>
  );
}
function Editor({
  question,
  onClose,
  onSave,
}: {
  question: Question;
  onClose: () => void;
  onSave: (text: string, answer: string) => Promise<void>;
}) {
  const [text, setText] = useState(question.text ?? "");
  const [answer, setAnswer] = useState(question.answer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="panel editor"
      aria-labelledby="editor-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!saving) onClose();
      }}
    >
      <h2 id="editor-title">Edit question · {question.value}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          void onSave(text, answer)
            .catch((e) =>
              setError(e instanceof Error ? e.message : "Could not save."),
            )
            .finally(() => setSaving(false));
        }}
      >
        <label>
          Question
          <textarea
            aria-label="Question"
            maxLength={600}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
            autoFocus
          />
        </label>
        <label>
          Answer · host only
          <textarea
            aria-label="Answer · host only"
            maxLength={300}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={2}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button className="primary" disabled={saving}>
            Save question
          </button>
          <button
            className="secondary"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
function ImportModal({
  board,
  onClose,
  onApply,
}: {
  board: ParsedBoard;
  onClose: () => void;
  onApply: () => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="panel editor excel-modal"
      aria-labelledby="import-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!applying) onClose();
      }}
    >
      <div className="excel-modal-header">
        <div>
          <h2 id="import-title">Import Questions from Excel</h2>
          <p className="muted">
            Found {board.categories.length} categories and {board.questions.length} questions.
          </p>
        </div>
        <Pill tone="mint">EXCEL READY</Pill>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="excel-preview-list">
        {board.categories.map((cat) => {
          const qs = board.questions.filter((q) => q.categoryId === cat.id);
          return (
            <div key={cat.id} className="excel-cat-preview">
              <div className="excel-cat-title">
                <strong>{cat.name}</strong>
                <Pill tone="lavender">{qs.length} questions</Pill>
              </div>
              <table className="excel-preview-table">
                <thead>
                  <tr>
                    <th style={{ width: "60px" }}>Pts</th>
                    <th>Question</th>
                    <th>Answer</th>
                  </tr>
                </thead>
                <tbody>
                  {qs.map((q) => (
                    <tr key={q.id}>
                      <td className="points-cell">{q.value}</td>
                      <td>{q.text}</td>
                      <td className="answer-cell">{q.answer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <div className="modal-actions">
        <button
          className="secondary"
          type="button"
          disabled={applying}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="primary"
          type="button"
          disabled={applying}
          onClick={async () => {
            setApplying(true);
            setError("");
            try {
              await onApply();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Failed to apply board."
              );
              setApplying(false);
            }
          }}
        >
          {applying ? "Applying to board..." : "Replace Board with Excel"}
        </button>
      </div>
    </dialog>
  );
}

function WagerSetupModal({
  room,
  onClose,
  onLock,
  onPlayerChange,
  onQuestionChange,
}: {
  room: Room;
  onClose: () => void;
  onLock: (
    playerId: string,
    wagerAmount: number,
    questionId: string
  ) => Promise<void>;
  onPlayerChange: (playerId: string) => Promise<void>;
  onQuestionChange: (questionId: string) => Promise<void>;
}) {
  const unplayedQuestions = room.questions.filter((q) => !q.played);
  const defaultQuestion =
    room.questions.find((q) => q.id === room.questionId && !q.played) ??
    unplayedQuestions[0];
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    defaultQuestion?.id ?? ""
  );

  const defaultPlayer =
    room.players.find((p) => p.id === room.wager?.playerId) ??
    room.players.find((p) => p.connected) ??
    room.players[0];
  const [selectedPlayerId, setSelectedPlayerId] = useState(
    defaultPlayer?.id ?? ""
  );
  const [wagerInput, setWagerInput] = useState("");
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);

  const selectedQuestion =
    room.questions.find((q) => q.id === selectedQuestionId) ?? defaultQuestion;
  const selectedCategory = selectedQuestion
    ? room.categories.find((c) => c.id === selectedQuestion.categoryId)
    : null;

  const selectedPlayer =
    room.players.find((p) => p.id === selectedPlayerId) ?? defaultPlayer;

  const handleQuestionChange = async (newQId: string) => {
    setSelectedQuestionId(newQId);
    setError("");
    try {
      await onQuestionChange(newQId);
    } catch {
      // ignore
    }
  };

  const handlePlayerChange = async (newId: string) => {
    setSelectedPlayerId(newId);
    setError("");
    try {
      await onPlayerChange(newId);
    } catch {
      // ignore
    }
  };

  const handleLock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!selectedQuestion) {
      setError("Please select a question to assign.");
      return;
    }
    if (!selectedPlayer) {
      setError("Please select a participant.");
      return;
    }
    const trimmed = wagerInput.trim();
    if (!trimmed) {
      setError("Enter a wager amount.");
      return;
    }
    if (trimmed.includes(".") || trimmed.includes(",")) {
      setError("Wager must be a whole number (no decimals).");
      return;
    }
    const num = Number(trimmed);
    if (!Number.isInteger(num) || isNaN(num) || num <= 0) {
      setError("Wager must be a positive whole number greater than 0.");
      return;
    }
    setLocking(true);
    try {
      await onLock(selectedPlayer.id, num, selectedQuestion.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to lock wager.");
      setLocking(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="panel editor wager-modal"
      aria-labelledby="wager-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!locking) onClose();
      }}
    >
      <div className="wager-modal-header">
        <div>
          <h2 id="wager-modal-title">JBTI RB7A Setup</h2>
          <p className="muted">
            Assign a specific question and enter the participant's approved wager.
          </p>
        </div>
        <Pill tone="amber">ASSIGN QUESTION</Pill>
      </div>

      <form onSubmit={handleLock}>
        <label>
          Assigned Question
          <select
            value={selectedQuestionId}
            onChange={(e) => void handleQuestionChange(e.target.value)}
            disabled={locking}
          >
            {room.categories.map((c) => {
              const catQs = unplayedQuestions.filter(
                (q) => q.categoryId === c.id
              );
              if (catQs.length === 0) return null;
              return (
                <optgroup key={c.id} label={c.name}>
                  {catQs.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.value} pts —{" "}
                      {q.text
                        ? q.text.length > 50
                          ? q.text.slice(0, 50) + "…"
                          : q.text
                        : `Question (${q.value} pts)`}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>

        {selectedQuestion && (
          <div className="wager-question-preview">
            <div className="wager-question-preview-meta">
              <Pill tone="lavender">
                {selectedCategory?.name ?? "Category"}
              </Pill>
              <Pill tone="mint">
                {score(selectedQuestion.value)} PTS ORIGINAL
              </Pill>
            </div>
            <p className="wager-question-preview-text">
              <strong>Clue:</strong> {selectedQuestion.text}
            </p>
            {selectedQuestion.answer && (
              <p className="wager-question-preview-answer">
                <strong>Answer:</strong> {selectedQuestion.answer}
              </p>
            )}
          </div>
        )}

        <label>
          Participant
          <select
            value={selectedPlayerId}
            onChange={(e) => void handlePlayerChange(e.target.value)}
            disabled={locking}
          >
            {room.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.connected ? "(Connected)" : "(Offline)"} ·{" "}
                {score(p.score)} pts
              </option>
            ))}
          </select>
        </label>

        {selectedPlayer && (
          <div className="wager-score-preview">
            <span>
              Current score for <b>{selectedPlayer.name}</b>:
            </span>
            <strong>{score(selectedPlayer.score)} pts</strong>
          </div>
        )}

        <label>
          Wager amount (Points at stake)
          <input
            type="number"
            step="1"
            min="1"
            placeholder="Enter points to wager (e.g. 500)"
            value={wagerInput}
            onChange={(e) => {
              setWagerInput(e.target.value);
              setError("");
            }}
            disabled={locking}
            autoFocus
            required
          />
          <small className="muted">
            Positive whole numbers only. Correct adds this amount; wrong subtracts
            it.
          </small>
        </label>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className="modal-actions">
          <button
            className="secondary"
            type="button"
            disabled={locking}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="primary" type="submit" disabled={locking}>
            {locking ? "Locking & Revealing..." : "Lock wager & reveal →"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function phaseLabel(phase: string) {
  return (
    (
      {
        lobby: "Waiting room",
        board: "Choose a question",
        wager_setup: "JBTI RB7A",
        reading: "Buzzers locked",
        open: "Buzzers open",
        answering: "Answer in progress",
        wrong: "Wrong answer",
        resolved: "Correct answer",
        expired: "Time’s up",
        revealed: "Answer revealed",
        finished: "Final scores",
      } as Record<string, string>
    )[phase] ?? phase
  );
}
function Leaderboard({ players }: { players: Player[] }) {
  return (
    <ol className="leaderboard">
      {[...players]
        .sort((a, b) => b.score - a.score)
        .map((p) => (
          <li key={p.id}>
            <b>{p.name}</b>
            <strong>{score(p.score)}</strong>
          </li>
        ))}
    </ol>
  );
}
function Display({ room }: { room: Room }) {
  const q = room.questions.find((q) => q.id === room.questionId);
  const winner = room.players.find((p) => p.id === room.winnerId);
  return (
    <>
      <div className="display-stage">
        {room.phase === "lobby" ? (
          <div className="display-lobby">
            <h1>The gang’s all here?</h1>
            <p>Grab your phone. Scan to join.</p>
            <JoinDetails room={room} />
            <div className="joined-names">
              {room.players.map((p) => (
                <Pill key={p.id}>
                  {p.name} {p.connected ? "✓" : "…"}
                </Pill>
              ))}
            </div>
          </div>
        ) : room.phase === "finished" ? (
          <>
            <h1>Final scores</h1>
            <Leaderboard players={room.players} />
          </>
        ) : room.phase === "wager_setup" ? (
          <div className="display-wager-suspense">
            <Pill tone="amber">JBTI DB7A</Pill>
            <h1 className="display-wager-title">
              {room.wager?.playerName ?? "Participant"}
            </h1>
            <div className="display-status active">
              <h2>Wager being placed…</h2>
              <p>The host and participant are agreeing on the points at stake.</p>
            </div>
          </div>
        ) : q ? (
          <>
            <div className="stage-metadata">
              {room.wager && room.wager.locked ? (
                <div className="wager-active-pill-row">
                  <Pill tone="amber">JBTI DB7A · {room.wager.playerName}</Pill>
                  <Pill tone="mint">STAKE: {score(room.wager.amount)} PTS</Pill>
                  <Pill>
                    {room.categories
                      .find((c) => c.id === q.categoryId)
                      ?.name.toUpperCase()}
                  </Pill>
                </div>
              ) : (
                <Pill>
                  {room.categories
                    .find((c) => c.id === q.categoryId)
                    ?.name.toUpperCase()}{" "}
                  · {q.value}
                </Pill>
              )}
              <Pill>
                {room.deadline ? (
                  <Timer deadline={room.deadline} serverNow={room.serverNow} />
                ) : (
                  phaseLabel(room.phase)
                )}
              </Pill>
            </div>
            <h1 className="display-question">{q.text}</h1>
            <div
              className={`display-status ${winner && room.phase === "answering" ? "active" : ""}`}
              aria-live="polite"
            >
              <h2>
                {room.phase === "revealed"
                  ? q.answer
                  : winner
                    ? `${winner.name} ${room.phase === "wrong"
                      ? room.wager
                        ? `lost ${score(room.wager.amount)} pts!`
                        : "got it wrong"
                      : room.phase === "resolved"
                        ? room.wager
                          ? `won ${score(room.wager.amount)} pts!`
                          : "got it right!"
                        : "has the floor"
                    }`
                    : room.wager && room.wager.locked
                      ? `${room.wager.playerName}’s Turn · ${score(room.wager.amount)} pts at stake`
                      : phaseLabel(room.phase).toUpperCase()}
              </h2>
              <p>
                {room.phase === "open"
                  ? room.wager
                    ? `Buzzer open for ${room.wager.playerName}.`
                    : "Know it? Hit the buzzer on your phone."
                  : room.phase === "reading"
                    ? room.wager
                      ? `Only ${room.wager.playerName} can answer this question.`
                      : "Read the question. Wait for the host to open the buzzers."
                    : room.phase === "wrong"
                      ? room.wager
                        ? "Wager lost. Other players cannot steal."
                        : "The host can reopen the buzzers."
                      : room.phase === "revealed"
                        ? "Answer revealed"
                        : room.phase === "expired"
                          ? "Waiting for the host."
                          : "First valid buzz takes the floor."}
              </p>
            </div>
          </>
        ) : (
          <>
            <h2 className="display-board-title">Pick your next question.</h2>
            <Board room={room} />
          </>
        )}
      </div>
      <Scores room={room} />
    </>
  );
}
function Phone({
  room,
  playerId,
  buzz,
  connected,
}: {
  room: Room;
  playerId: string;
  buzz: () => Promise<boolean | undefined>;
  connected: boolean;
}) {
  const me = room.players.find((p) => p.id === playerId);
  const winner = room.players.find((p) => p.id === room.winnerId);
  const q = room.questions.find((q) => q.id === room.questionId);
  const [pending, setPending] = useState(false);

  const isWagerRound = room.wager !== null && room.wager.locked;
  const isWagerTarget = isWagerRound && room.wager?.playerId === playerId;
  const isWagerLockedOut = isWagerRound && !isWagerTarget;

  const ready = connected && room.phase === "open" && !isWagerLockedOut;
  const won =
    room.winnerId === playerId &&
    ["answering", "resolved"].includes(room.phase);
  const beaten = !won && room.phase === "answering" && !!winner;
  return (
    <>
      {me && (
        <div className="phone-player">
          <h2>{me.name}</h2>
          <strong>{score(me.score)}</strong>
        </div>
      )}
      {room.phase === "lobby" ? (
        <section className="panel">
          <Pill tone="mint">YOU’RE IN</Pill>
          <h1>Waiting for the host.</h1>
          <p className="muted">
            Keep this page open. Your buzzer will appear when the game starts.
          </p>
          <PlayerList room={room} />
        </section>
      ) : room.phase === "finished" ? (
        <section className="panel">
          <h1>Final scores</h1>
          <Leaderboard players={room.players} />
        </section>
      ) : room.phase === "wager_setup" ? (
        <section className="panel wager-suspense-panel">
          <Pill tone="amber">JBTI DB7A</Pill>
          <h1 className="wager-target-name">
            {room.wager?.playerName ?? "Participant"}
          </h1>
          <p className="wager-status-text">Wager being placed…</p>
          <div className="wager-suspense-indicator">
            <div className="pulse-dot" />
            <span>Waiting for host to lock the wager</span>
          </div>
          <p className="muted center">
            The question and buzzer will appear once the wager is locked.
          </p>
        </section>
      ) : q ? (
        <>
          <section className="panel phone-question">
            <p className="eyebrow">
              {isWagerRound ? (
                <>
                  JBTI DB7A · {score(room.wager!.amount)} PTS ·{" "}
                  {room.categories
                    .find((c) => c.id === q.categoryId)
                    ?.name.toUpperCase()}
                </>
              ) : (
                <>
                  {room.categories
                    .find((c) => c.id === q.categoryId)
                    ?.name.toUpperCase()}{" "}
                  · {q.value}
                </>
              )}
            </p>
            <p>{q.text}</p>
          </section>
          {room.phase === "revealed" ? (
            <section className="panel revealed">
              <Pill tone="mint">ANSWER REVEALED</Pill>
              <h2>{q.answer}</h2>
              <p className="muted">Waiting for the next question.</p>
            </section>
          ) : isWagerLockedOut ? (
            <>
              <div className="buzzer-area">
                <button
                  className="buzzer locked"
                  disabled
                  aria-label="Wager round in progress"
                >
                  <strong>LOCKED</strong>
                  <span>Only {room.wager?.playerName} can answer</span>
                </button>
              </div>
              <div className="phone-status" aria-live="polite">
                <b>BET WLA DB7A IN PROGRESS</b>
                <p className="muted">
                  Only {room.wager?.playerName} can answer this round. Other players cannot steal.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="buzzer-area">
                <button
                  className={`buzzer ${ready ? "ready" : won ? "winner" : beaten ? "beaten" : "locked"}`}
                  disabled={!ready || pending}
                  onClick={() => {
                    setPending(true);
                    void buzz().finally(() => setPending(false));
                  }}
                  aria-label={
                    ready ? "Buzz" : won ? "You’re in" : "Buzzers locked"
                  }
                >
                  <strong>
                    {ready
                      ? "BUZZ"
                      : won
                        ? "YOU’RE IN"
                        : beaten
                          ? "TOO SLOW"
                          : "WAIT"}
                  </strong>
                  <span>
                    {ready
                      ? isWagerRound
                        ? `Tap to answer for ${score(room.wager!.amount)} pts`
                        : "Tap when you know it"
                      : won
                        ? "You have the floor"
                        : beaten
                          ? `${winner?.name} buzzed first`
                          : "Wait for the host"}
                  </span>
                </button>
              </div>
              <div className="phone-status" aria-live="polite">
                <b>
                  {won
                    ? "YOU BUZZED FIRST"
                    : isWagerRound
                      ? `${room.wager!.playerName}’S TURN`
                      : phaseLabel(room.phase).toUpperCase()}
                </b>
                <p className="muted">
                  {ready
                    ? "Tap the buzzer when ready."
                    : room.phase === "wrong"
                      ? isWagerRound
                        ? `Wrong answer (−${score(room.wager!.amount)} pts).`
                        : "The host can reopen the buzzers."
                      : room.phase === "resolved"
                        ? isWagerRound
                          ? `Correct answer (+${score(room.wager!.amount)} pts)!`
                          : "Waiting for the answer reveal."
                        : "Keep your phone connected."}
                </p>
              </div>
            </>
          )}
        </>
      ) : (
        <section className="panel center">
          <h1>Eyes on the board.</h1>
          <p className="muted">The host is choosing the next question.</p>
          <Pill tone="lavender">BUZZERS LOCKED</Pill>
        </section>
      )}
    </>
  );
}
