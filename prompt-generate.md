Crie um projeto Node.js + TypeScript mínimo para o Day 1 do meu card game multiplayer.
O objetivo deste passo é gerar a estrutura inicial de pastas e os arquivos de configuração (scripts, tsconfig, package.json) e arquivos fontes básicos para um servidor Express + Socket.io que permita: create_game, join_game, emitir room_update e iniciar o jogo (game_started) automaticamente quando houver 2 jogadores na sala.

Requisitos técnicos obrigatórios:

TypeScript em strict mode.

Estrutura do servidor em src/.

Uso de ts-node-dev para desenvolvimento.

Socket.io configurado com CORS (origem liberada para desenvolvimento).

Estado de partidas em memória (Map<string, GameRoom>).

Código organizado: server.ts, socket.ts, game/gameManager.ts, game/gameTypes.ts, utils/ids.ts.

package.json, tsconfig.json, .gitignore e README.md.

Scripts npm: dev, build, start.

Comentários claros nos arquivos explicando onde expandir no Dia 2 (deck, gameState completo).

Estruture o projeto exatamente assim e gere os conteúdos mínimos abaixo:

Arquivos e conteúdos solicitados

package.json com:

dependências: express, socket.io

devDependencies: typescript, ts-node-dev, @types/express, @types/node

scripts:

"dev": "ts-node-dev --respawn --transpile-only src/server.ts"

"build": "tsc -p ."

"start": "node dist/server.js"

tsconfig.json com strict: true, rootDir: "src", outDir: "dist", target ES2020, module CommonJS.

.gitignore com node_modules, dist, .env, .cache.

README.md com instruções mínimas:

npm install

npm run dev

breve explicação dos eventos socket implementados.

src/server.ts:

cria um app Express

cria servidor HTTP

instancia socket.io com CORS origin: "\*"

importa e chama registerSocket(io)

rota GET / retornando mensagem de status

PORT padrão 4000

src/socket.ts:

exporta registerSocket(io: Server)

registra connection e disconnect

implementa handlers:

create_game -> cria sala usando gameManager.createRoom() e responde via callback com { ok: true, gameId }

join_game (payload { gameId, name? }) -> valida existência, espaço (max 2), estado waiting; cria player via gameManager.addPlayerToRoom(), usa socket.join(gameId), emite ack joined_game ao jogador e room_update para a sala; se atingir 2 jogadores chama gameManager.startGame(room) e emite game_started com gameState para a sala.

todos os erros devem retornar callback({ ok: false, error: "<CODE>" }).

src/game/gameTypes.ts:

defina os types ID, RoomState = "waiting"|"in_game"|"finished", PlayerConnection, GameState (mínimo: id, players[], currentPlayerId?, turnNumber), GameRoom.

incluir breve comentário explicando onde ampliar o GameState no Dia 2.

src/game/gameManager.ts:

mantenha const games = new Map<string, GameRoom>().

exporte funções:

createRoom(): GameRoom

getRoom(id: string): GameRoom | undefined

addPlayerToRoom(room: GameRoom, socketId: string, name?: string): PlayerConnection

removePlayerFromRoom(room: GameRoom, socketId: string)

startGame(room: GameRoom): GameState (cria um GameState mínimo, define currentPlayerId com o primeiro player e turnNumber = 1, atribui room.state = "in_game", retorna gameState)

comentar que startGame é um stub simples e será substituído no Dia 2 por createInitialGameState() com decks e terrenos.

src/utils/ids.ts:

exporte generateId(prefix = "") => string (ex.: prefix + Math.random().toString(36).slice(2,9)).

src/game/README.md (opcional):

resumo rápido de como ampliar GameState no Dia 2 (deck de 50 cartas, 4 terrenos, distribuir 5 cartas etc).

Comportamento esperado ao rodar

npm install

npm run dev

Servidor sobe em http://localhost:4000

Um cliente que fizer create_game recebe { ok: true, gameId }

Dois clientes que fizerem join_game no mesmo gameId recebem room_update e, quando o segundo entra, recebem game_started com gameState para ambos.

Instruções adicionais para a IA (Copilot):

Gere código legível, com comentários em PT-BR.

Não implemente lógica de jogo além de criar e iniciar GameState mínimo.

Evite dependências extras.

Estruture arquivos conforme listado.

Gere conteúdo pronto para colar (ou commit) em cada arquivo.

Fim do prompt.
