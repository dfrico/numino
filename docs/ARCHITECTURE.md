# Numino: architecture, testing and limitations

The engineering write-up for [Numino](../README.md). Moved here unchanged from the README so the README can stay product-first.

# Architecture

## Shape of the system

One Node process serves both the Next.js app and the WebSocket server on a single port:

```
server.ts
  ├── Next.js request handler   → serves the React app
  └── socket.io server          → all realtime game traffic
        └── src/server/socket.ts    event handlers, auth, broadcast
              └── src/lib/game.ts    pure rules, no I/O
                    └── src/lib/room-store.ts   storage interface
                          └── InMemoryRoomStore  current implementation
```

A custom server is required because Vercel's serverless model can't hold a WebSocket
connection. On a long-lived host this is the simplest thing that works: no database, no
external realtime service, no pub/sub.

## The number-hiding invariant

This is the part everything else is arranged around. **The server never sends a player
their own number.** Not hidden with CSS, not sent and obscured — absent from the payload.

`toRoomView(room, viewerId)` in `src/lib/game.ts` is the single function that constructs
anything a client receives. It's the only place where the secret can leak, so there's only
one place to audit:

```ts
const hideNumber = !revealEverything && player.id === viewerId && !player.solved
return { ...player, number: hideNumber ? null : player.number, ... }
```

Three conditions gate visibility, and each one matters:

- `player.id === viewerId` — you can't see your own
- `!player.solved` — once you solve, you see your own
- `!revealEverything` — at the end of the game, everyone's number is public

Because every player needs a *different* payload, broadcast is per-socket rather than
per-room:

```ts
for (const id of room.order) {
  const player = room.players.get(id)
  if (!player?.socketId) continue
  io.to(player.socketId).emit('room:state', toRoomView(room, player.id))
}
```

The first version of this emitted to the socket.io room (`io.to('room:code')`). That looks
equivalent and is not: it would have delivered every player's payload to every player,
each containing every other player's number, and completely broken the game. The smoke test
asserts that no `room:state` frame ever contains the recipient's own number.

The practical consequence is that opening devtools shows you nothing, because there is
nothing there to find. A player *can* be told their number by another player over Discord,
but that's the physical game — you need other people to answer your questions.

## Server as referee

`room:guess` sends a number to `submitGuess`, which validates turn order, marks the player
solved, and returns whether the guess was right. The server holds the truth, so guessing is
verified rather than trusted.

Authorisation is resolved from `socket.data` (set at join/resume), never from the payload.
A client can't ask to be treated as a different player. Guess restrictions live in
`submitGuess`: it must be your turn, the game must be running, you must not already be
solved, and the value must be a whole number in range.

## Dealing numbers

`dealNumber` in `src/lib/game.ts` does a weighted draw without repeats. Each number's
weight is `e^(-0.05·(n − min))`, so on 1–100 the median deal is about 14. Roughly 63% of
numbers are 20 or below, and only about 8% are above 50. `FUNNY_NUMBERS` gives a few numbers
a bump by weighting them as if they were a smaller number: 69 is dealt about as often as 40,
and roughly four times as often as 68. A player who joins mid-game draws from the numbers
nobody holds yet.

Since nobody shares a number, you can rule out every number you can see. That's deliberate.

## Turn order

`room.order` is an array of player ids in join order; `turnIndex` is a cursor into it.
`advanceTurn` runs after every guess, right or wrong, and after a pass. It scans forward
from the current position and wraps, skipping solved players.
It scans exactly `size` steps, so a lone remaining player finds themselves and keeps the
turn. If nobody is unsolved, the phase flips to `finished`.

This is a plain array cursor rather than a linked queue so it survives players leaving —
`removePlayer` filters `order` and moves the cursor back when the removed seat was before it,
so the current asker keeps their turn.

## Storage seam

`RoomStore` (`src/lib/room-store.ts`) is a small interface: `get`, `create`, `save`, `delete`,
`sweep`, `count`, `countSync`. The game logic only ever talks to this interface, so moving to
Postgres means writing a second implementation and nothing else. The in-memory version is held
on a `Symbol.for()` global so Next's dev-mode module reloading doesn't duplicate it.

A room whose players have all been disconnected for 2 minutes counts as abandoned, and
`room:create` can reuse its name. That covers a tab closed before the game started, which
would otherwise hold the name until the sweeper runs. A sweeper drops rooms idle for 6 hours. `sweep` is already part of the interface so a
database-backed version can clean up without touching callers. It returns how many rooms it
removed, which feeds `guess_rooms_swept_total`.

## Client state

The server is authoritative. `RoomScreen` holds one `RoomView` and replaces it wholesale on
every `room:state` — there's no local game state to drift out of sync. Local state is
limited to UI concerns: whether the guess sheet is open, transient error text, and the
confetti trigger.

Confetti and sound fire from inside the socket subscription callback, keyed on
`lastSolved.at` so they trigger once per solve rather than on every subsequent frame. The
random confetti geometry is generated at module scope and picked from by `useMemo`, keeping
render pure and avoiding a hydration mismatch.

localStorage holds two keys: a `guess.profile` (name and avatar, so you don't retype it)
and a per-room `guess.session.<code>` holding the player's resume token. The token is a
separate secret from the player id: ids appear in every `room:state` frame, so if an id could
resume a session, any player could take over another player's seat and read their own number
from that player's view. Tokens are never broadcast, which is why `room:resume` can skip the
password check.

A socket belongs to one player in one room at a time. Creating, joining or resuming detaches
it from whatever it was attached to before, so switching rooms can't leave it receiving the
old room's state. A disconnect only marks a player offline if it comes from the socket they
are currently using. A late disconnect from a socket they've already replaced (a phone
switching networks, a second tab) is ignored.

## Metrics

`GET http://127.0.0.1:9464/metrics` serves Prometheus text format. It's a second HTTP server
bound to loopback, so it is never reachable from the LAN or the public internet even though
the game itself is. Override with `METRICS_PORT`.

| Metric | Type | Labels | Notes |
| ------ | ---- | ------ | ----- |
| `guess_rooms_active` | gauge | | rooms in memory right now |
| `guess_players_connected` | gauge | | open sockets, from `io.engine.clientsCount` |
| `guess_players_in_rooms` | gauge | | players across live rooms, connected or not |
| `guess_rooms_created_total` | counter | | |
| `guess_rooms_ended_total` | counter | `reason` | `played_to_end` or `host_ended` |
| `guess_rooms_swept_total` | counter | | rooms dropped by the idle sweeper |
| `guess_reconnects_total` | counter | `result` | `resumed` or `expired` |
| `guess_socket_events_total` | counter | `event`, `result` | `result` is `ok`, `rejected`, or `error` |
| `guess_socket_errors_total` | counter | `event` | handlers that threw |
| `guess_game_duration_seconds` | histogram | | first guess to game over |

Counting happens in one place. Every handler is registered through `onAck`
(`src/server/socket.ts`), which wraps the ack callback, so `ok` versus `rejected` is recorded
uniformly whether the handler returns early or falls through. A handler that throws is counted
once in `guess_socket_events_total{result="error"}`, once in `guess_socket_errors_total`, and
still acks the client — which is what turns a silent dead button into a visible counter.

`guess_game_duration_seconds` is the one worth actually reading. It measures from a room's
first guess to it finishing, which tells you how long a real game takes and therefore whether
the 6-hour idle TTL is sensible.

Two constraints. Label values are only ever `event`, `result`, or `reason` — never a room
code or player id, which would blow up cardinality. And because state is in-process, all of
this is single-instance and resets on deploy; these numbers stop being meaningful the moment
you run more than one replica, which is the same Redis requirement as scaling the game itself.

The counters have no dependencies. `src/lib/metrics.ts` is a few dozen lines of
`Counter`/`Gauge`/`Histogram` and serialises to the text format directly, so `curl` works
today and adding Prometheus later needs no code change.

## Event reference

Every handler acknowledges with `{ ok: true, ... }` or `{ ok: false, error }`, and the
client surfaces `error` verbatim.

| Event          | Direction       | Purpose                                        |
| -------------- | --------------- | ---------------------------------------------- |
| `room:create`  | client → server | Create a room, returns `code`, `playerId`, `token` |
| `room:join`    | client → server | Join by code and password                      |
| `room:resume`  | client → server | Re-attach by `token` after a refresh           |
| `room:start`   | client → server | Host deals numbers, or redeals a rematch       |
| `room:guess`   | client → server | Submit a number; server returns correct/incorrect |
| `room:pass`    | client → server | Skip to the next player                        |
| `room:end`     | client → server | Host reveals all numbers                       |
| `room:kick`    | client → server | Host removes a player                          |
| `room:leave`   | client → server | Voluntary departure, frees the slot            |
| `room:state`   | server → client | Full `RoomView`; the only state channel        |
| `room:kicked`  | server → client | Redirect the removed player to the join screen |

Note the handler signature convention: `(payload, ack)`, with `payload` always sent —
socket.io does not strip `undefined` arguments, so a handler declaring a lone optional
`ack` receives the callback in the wrong position and silently never responds.

# Testing

`npm test` runs `scripts/smoke.ts`, which drives a real server with four socket.io clients
and asserts 96 conditions. It covers room lifecycle, all the validation rejections,
number and token secrecy across every emitted frame, turn order, wrong guesses passing the
turn, correct guesses, restart, joining mid-game, token-based reconnect, stale disconnects,
switching rooms, departure, and the ack-signature behaviour described above.

It needs a server running — start one with `npm run dev`, or `npm run build && npm start`.

The host handoff isn't covered, because it takes 30 seconds. `migrateHostIfAway` in
`src/lib/game.ts` is a pure function, so it's the obvious first unit test.

One thing worth knowing if you extend it: the test can never learn a player's number from
that player's own payload, because that is the point of the app. It reads the target's number
out of *another* player's view, which is exactly how information flows in a real game.

The UI was verified separately by driving Chromium through the full flow — join, lobby,
deal, turn, wrong guess, solve, reload, mobile viewport, and no-session redirect — with
console and page errors asserted empty. That pass caught two bugs that typecheck and lint
could not: `room:create` not returning `code`/`playerId` (the app redirected to
`/room/undefined`), and a hydration mismatch from a random avatar default.

# Known limitations

- **State is in memory.** A server restart drops all rooms. Fine for a party; not fine if
  you want a room to survive deploys. `RoomStore` is the seam for fixing this.
- **No authentication.** A room password is a shared string compared server-side, and the
  resume token is a bearer token. Appropriate for a game among people in the same room, not a
  security boundary.
- **Socket handler exceptions are not logged.** `server.ts` only reports startup failures.
  An exception inside a handler is swallowed by socket.io and the client just times out. If
  you see a silent failure, add a `try/catch` with logging in `src/server/socket.ts`.
- **No rate limiting on guesses.** Each guess ends your turn, so you get one guess per
  lap of the table. With few players that still adds up quickly, but you can't brute-force
  your number in one go.
- **Vercel is not a deployment target** without a managed realtime service in front of it.
  Fly.io or Railway run this as-is.
