import {
  GameRoom,
  GameState,
  PlayerConnection,
  PlayerState,
} from "./gameTypes";
import { generateId } from "../utils/ids";
import { buildDeck, buildTerrains, shuffle } from "./data/cardDatabase";

const games: Record<string, GameRoom> = {};

export function createRoom(roomName?: string): GameRoom {
  const room: GameRoom = {
    id: generateId("room_"),
    state: "waiting",
    roomName: roomName ?? "Sala aleatória",
    players: [],
    gameState: null,
    createdAt: Date.now(),
  };

  games[room.id] = room;
  return room;
}

export function getRoom(id: string): GameRoom | undefined {
  return games[id];
}

export function addPlayerToRoom(
  room: GameRoom,
  socketId: string,
  name?: string,
): PlayerConnection {
  const player: PlayerConnection = {
    playerId: generateId("p-"),
    socketId,
    name: name ? name : `Jogador ${room.players.length + 1}`,
    joinedAt: Date.now(),
    isReady: false,
  };

  room.players.push(player);
  return player;
}

export function removePlayerFromRoom(room: GameRoom, socketId: string): void {
  room.players = room.players.filter((p) => p.socketId !== socketId);
  if (room.players.length === 0) delete games[room.id];
}

// ── Iniciar partida ──────────────────────────────────────

/**
 * Cria um GameState mínimo e marca a sala como "in_game".
 * Retorna o gameState criado.
 *
 * 🔮 DIA 2: Substituir por createInitialGameState() que:
 *   - Embaralha e distribui deck de 50 cartas
 *   - Posiciona 4 terrenos por jogador
 *   - Distribui mão inicial de 5 cartas
 *   - Define a fase inicial (DRAW ou FARM)
 */
export function startGame(room: GameRoom): GameState {
  const playerStates: PlayerState[] = [];

  room.players.forEach((player) => {
    const terrainsDeck = buildTerrains();
    const deck = shuffle(buildDeck());
    const hand = deck.splice(0, 5);
    const p = {
      playerId: player.playerId,
      deck,
      hand,
      terrainsDeck,
      terrainsZone: [],
      farm: [],
      mainZone: [],
      battleZone: [],
      trash: [],
      hasRevealedFirstTerrain: false,
    };
    playerStates.push(p);
  });

  const randomTurnStart = Math.round(Math.random() * (1 - 0) + 0);

  console.log(randomTurnStart);

  const gameState: GameState = {
    id: room.id,
    players: [...room.players],
    playerStates,
    winner: null,
    currentPhase: "refresh",
    currentPlayerId: room.players[randomTurnStart]?.playerId,
    turnNumber: 1,
    battle: null,
    chain: null,
    pendingOptionalEffects: null,
    effectWindow: null,
  };

  room.state = "in_game";
  room.gameState = gameState;

  return gameState;
}

export function getAllRooms(): GameRoom[] {
  return Object.values(games);
}

export function deleteRoom(id: string): boolean {
  if (!(id in games)) return false;
  delete games[id];
  return true;
}
