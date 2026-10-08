# rb7a wla db7a — playable milestone 1

A host-led quiz game with a React + TypeScript interface and an ASP.NET Core .NET 10 / SignalR server. This version implements one complete multiplayer game loop from the RWD Figma designs: room creation, QR joining, editable categories and clues, first-buzz arbitration, judging, answer reveal, scores and final standings.

## Run locally

Install **Node.js 22.12+** (or 24 LTS) and the **.NET 10 SDK**. From this folder:

```sh
npm ci --prefix client
```

In terminal 1:

```sh
dotnet run --project server/Rwd.Server.csproj --urls http://0.0.0.0:5080
```

In terminal 2:

```sh
npm run dev --prefix client
```

Open `http://localhost:5173`, choose **Create a room**, then use **Open shared display** on the TV or a second browser window. Players open `/join/ROOMCODE`, enter their names and leave the page open. At least one player must be connected to start.

### Phones on the same Wi-Fi

On the host laptop, open `http://YOUR-LAPTOP-LAN-IP:5173` instead of localhost **before creating the room**. The QR code and join link use that address, so phones can reach it. Allow local-network access to port 5173 in your firewall. Vite proxies API and SignalR requests to port 5080; only 5173 needs to be reachable by phones in development. Copying the join link requires a browser secure context; the QR and visible URL work on ordinary LAN HTTP.

The host identity is kept in that tab's session storage. Refreshing the tab resumes the session. Copying a host URL into another browser does not grant host access. Player identity and score also survive refresh in the same tab. A closed tab/browser may lose its session; save/recover host access and user accounts are future work.

## Play a round

1. Create a room and join from two phones or separate browser sessions.
2. Edit the sample **Friend lore** clues to fit your group; the default answers are placeholders. Rename categories inline if wanted.
3. Start the game and choose a point tile. Phones see the clue with their buzzers locked.
4. Select **Enable buzzers**. The server opens a 30-second window.
5. The first valid request received by the server wins. Only one player gets the floor; network latency can affect arrival order.
6. Mark the answer **Correct** to add its value, or **Wrong** to subtract it. A wrong player cannot buzz again on that clue. Reopen for the remaining players.
7. Use **Undo judgement** to correct a marking mistake before reopening/revealing. Select **Reveal answer** or **Skip question**, then **Back to board**.
8. Played tiles are disabled. Final standings appear after all 25 clues are played.

## Production build (single server)

```sh
npm run build --prefix client
```

Copy the **contents** of `client/dist/` into `server/wwwroot/` (create that folder first). On macOS/Linux:

```sh
mkdir -p server/wwwroot
cp -R client/dist/. server/wwwroot/
dotnet publish server/Rwd.Server.csproj -c Release -o publish
```

Run the published application from its output directory:

```sh
cd publish
dotnet Rwd.Server.dll --urls http://0.0.0.0:5080
```

Open `http://YOUR-LAPTOP-LAN-IP:5080` for a single-server LAN game. For internet deployment, use HTTPS and a host that supports ASP.NET Core and WebSockets. Keep one server instance for this milestone; active room state is held in-process. Deployment is not included in this source package.

## Verification

```sh
dotnet run --project tests/Rwd.Tests.csproj
npm run build --prefix client
```

With the server running, verify the HTTP/SignalR multiplayer flow:

```sh
node tests/live.mjs
```

The dependency-free .NET test runner checks authorization, private answers, 100 concurrent buzz requests, scoring, duplicate judgement rejection, undo, stale request rejection, wrong-player lockout, reconnect presence/score and timer expiry.

## Project layout

- `client/src/App.tsx`: host, public display and phone views; shared UI components.
- `client/src/styles.css`: Figma colours, bundled fonts, responsive layout and buzzer states.
- `client/src/useGame.ts`: SignalR lifecycle, reconnection, state revision filtering.
- `server/GameStore.cs`: room state, tokens, atomic rules and role-specific snapshots.
- `server/GameHub.cs`: SignalR commands, updates and server timer.
- `server/DemoBoard.cs`: editable sample questions.
- `tests/Program.cs`: meaningful domain checks without third-party test packages.

## Scope and next milestone

Rooms and edits are **in memory**: restarting the server clears them. This milestone supports up to 16 players per room and rejects new players after a game starts; existing players can reconnect. Answers are sent only to the host until a reveal, and future question text remains private to the host. Scores and buzzer decisions are server-owned; credentials are never included in public state.

SQL Server board storage, room expiry/cleanup, account/session recovery, configurable timers, durable event history, media clues and public hosting are future milestones. The removed “Friday night, questionable knowledge.” text and decorative phone OS status bar are absent from the app.
