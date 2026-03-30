# Ligarium – Card Game Server

Servidor multiplayer para o card game **Ligarium**.  
Stack: Node.js · TypeScript · Express · Socket.io

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

O servidor inicia em `http://localhost:4000`.

---

## 📡 Eventos Socket.io (Day 1)

### Cliente → Servidor

| Evento        | Payload             | Callback                                   |
| ------------- | ------------------- | ------------------------------------------ |
| `create_game` | —                   | `{ ok, gameId }`                           |
| `join_game`   | `{ gameId, name? }` | `{ ok, gameId }` ou `{ ok: false, error }` |

### Servidor → Cliente

| Evento         | Payload                            | Descrição                                |
| -------------- | ---------------------------------- | ---------------------------------------- |
| `joined_game`  | `{ gameId, player, playersCount }` | Confirmação para quem acabou de entrar   |
| `room_update`  | `{ gameId, state, players[] }`     | Broadcast para todos da sala             |
| `game_started` | `{ gameId, gameState }`            | Emitido quando 2 jogadores estão na sala |

### Erros

| Código             | Significado                       |
| ------------------ | --------------------------------- |
| `ROOM_NOT_FOUND`   | Sala não existe                   |
| `ROOM_FULL`        | Sala já tem 2 jogadores           |
| `ROOM_NOT_WAITING` | Sala não está em estado de espera |

---

## 📁 Estrutura

```
src/
  server.ts           ← Ponto de entrada (Express + HTTP + Socket.io)
  socket.ts           ← Registro de eventos Socket.io
  game/
    gameTypes.ts      ← Tipos: GameRoom, GameState, PlayerConnection
    gameManager.ts    ← Lógica de salas (criar, entrar, iniciar)
  utils/
    ids.ts            ← Gerador de IDs curtos
```

---
