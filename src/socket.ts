import { Server, Socket } from "socket.io";
import {
  createRoom,
  getRoom,
  addPlayerToRoom,
  removePlayerFromRoom,
  startGame,
  getAllRooms,
} from "./game/gameManager";
import {
  GameRoom,
  PlayerConnection,
  RoomState,
  StackEntry,
} from "./game/gameTypes";
import { executeEffect } from "./game/effects/index";
import {
  advancePhase,
  endTurn,
  executeDrawPhase,
  executeRefreshPhase,
  getOpponentState,
} from "./game/turnManager";
import {
  executeFarmAction,
  executePlayMonsterCardFromHand,
  executeEvolveMonsterCardFromHand,
  executePlayMonsterCardFromFarm,
  executeMoveMonsterToBattle,
} from "./game/gameEngine";
import {
  attacked,
  cleanupBattle,
  declareAttack,
  declareBlock,
  hasAttackedEffects,
  resolveCombatDamage,
  skipAttacked,
  skipBlocking,
} from "./game/battleEngine";

const MAX_PLAYERS = 2;

const ERR = {
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  ROOM_NOT_WAITING: "ROOM_NOT_WAITING",
} as const;

let rooms: GameRoom[] = [];

export function registerSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`[socket] ✅ conectado: ${socket.id}`);

    socket.emit("rooms_updated", { ok: true, rooms });

    socket.on("create_room", (callback: CallbackFn) => {
      try {
        const room = createRoom();
        console.log(`[game] 🏠 sala criada: ${room.id}`);
        callback({
          ok: true,
          room: {
            id: room.id,
            state: room.state,
            players: room.players,
            roomName: room.roomName,
          },
        });

        rooms.unshift(room);

        io.emit("rooms_updated", { ok: true, rooms });
      } catch (err: any) {
        socket.emit("error", { message: err.message });
        callback({ ok: false, error: err.message });
      }
    });

    socket.on("join_room", (payload: JoinPayload, callback: CallbackFn) => {
      try {
        const { gameId, name } = payload;

        const room = getRoom(gameId);
        if (!room) {
          callback({ ok: false, error: ERR.ROOM_NOT_FOUND });
          return;
        }

        if (room.state !== "waiting") {
          callback({ ok: false, error: ERR.ROOM_NOT_WAITING });
          return;
        }

        if (room.players.length >= MAX_PLAYERS) {
          callback({ ok: false, error: ERR.ROOM_FULL });
          return;
        }

        const player = addPlayerToRoom(room, socket.id, name);

        socket.join(gameId);

        console.log(
          `[game] 🎮 ${player.name} entrou na sala ${gameId} ` +
            `(${room.players.length}/${MAX_PLAYERS})`,
        );

        callback({ ok: true, gameId, player });
        socket.emit("joined_game", {
          gameId,
          player,
          playersCount: room.players.length,
        });

        io.to(gameId).emit("room_update", {
          gameId: room.id,
          state: room.state,
          players: room.players,
        });

        console.log(`room_update: gameId: ${room.id},
          state: ${room.state},
          players:${JSON.stringify(room.players)},`);

        io.emit("rooms_updated", { ok: true, rooms });
      } catch (err) {
        callback({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on(
      "player_ready",
      (payload: { playerId: string; roomId: string }, callback: CallbackFn) => {
        try {
          const { playerId, roomId } = payload;
          const room = getRoom(roomId);

          if (!room) {
            callback({ ok: false, error: "Sala inexistente" });
            return;
          }

          const player = findPlayerById(room, playerId);

          if (!player) {
            callback({ ok: false, error: "Jogador inexistente" });
            return;
          }

          player.isReady = true;

          callback({ ok: true, player });

          io.to(room.id).emit("room_update", {
            gameId: room.id,
            state: room.state,
            players: room.players,
          });
        } catch (error: any) {
          console.log(error);
          callback({ ok: false, error: error.message });
        }
      },
    );

    socket.on(
      "start_game",
      async (payload: JoinPayload, callback: CallbackFn) => {
        try {
          const { gameId } = payload;
          console.log("start_game payload:", payload);
          const room = getRoom(gameId);

          console.log("room:", room);
          if (!room) {
            callback({ ok: false, error: ERR.ROOM_NOT_FOUND });
            return;
          }

          if (room.state !== "waiting") {
            callback({ ok: false, error: ERR.ROOM_NOT_WAITING });
            return;
          }

          console.log(
            "jogadores prontos? ",
            room.players.filter((p) => p.isReady).length < 2,
          );

          if (room.players.filter((p) => p.isReady).length < 2) {
            callback({
              ok: false,
              error: "Há jogadores que não estão prontos.",
            });
            return;
          }

          callback({ ok: true, gameId });
          socket.emit("starting_game", {
            gameId,
            playersCount: room.players.length,
          });

          io.to(gameId).emit("room_update", {
            gameId: room.id,
            state: room.state,
            players: room.players,
          });

          if (room.players.length === MAX_PLAYERS) {
            const gameState = startGame(room);

            console.log(`[game] 🚀 partida iniciada: ${gameId}`);

            io.to(gameId).emit("game_started", {
              gameId: room.id,
              gameState,
            });
          }
        } catch (err) {
          console.error("ERRO start_game:", err);
          callback({ ok: false, error: errorMessage(err) });
        }
      },
    );

    socket.emit("get_all_rooms", (callback: any) => {
      try {
        const allRooms = getAllRooms();

        rooms.push(...allRooms);

        callback({ ok: true, rooms: allRooms });
      } catch (err: any) {
        callback({ ok: false, error: err.message });
      }
    });

    socket.on("action:refresh", (data: { gameId: string }) => {
      const room = getRoom(data.gameId);
      if (!room || !room.gameState) {
        socket.emit("error", { message: "Jogo não iniciado." });
        return;
      }

      const state = room.gameState;
      const playerId = findPlayerIdBySocket(room, socket.id);
      if (!playerId) {
        socket.emit("error", { message: "Jogador não encontrado." });
        return;
      }

      try {
        executeRefreshPhase(state, playerId);
        console.log("Esse é o state:", state);
        advancePhase(state);
        io.to(data.gameId).emit("game:update", state);
      } catch (err: any) {
        console.log(err);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("action:draw", (data: { gameId: string }, callback) => {
      const room = getRoom(data.gameId);
      if (!room || !room.gameState) {
        socket.emit("error", { message: "Jogo não iniciado." });
        return;
      }

      const state = room.gameState;
      const playerId = findPlayerIdBySocket(room, socket.id);
      if (!playerId) {
        socket.emit("error", { message: "Jogador não encontrado." });
        return;
      }

      if (state.currentPhase !== "draw") {
        callback({ ok: false, message: "Não é a drawPhase!" });
        return;
      }

      if (state.turnNumber === 1) {
        advancePhase(state);
        callback({ ok: true, message: "Passando turno!", state });
        io.to(data.gameId).emit("game:update", state);
        return;
      }

      try {
        executeDrawPhase(state, playerId);

        advancePhase(state);

        io.to(data.gameId).emit("game:update", state);
      } catch (err: any) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on(
      "action:farm",
      (data: { gameId: string; cardInstanceId: string }) => {
        const room = getRoom(data.gameId);

        if (!room || !room.gameState) {
          socket.emit("error", { message: "Jogo não iniciado." });
          return;
        }

        console.log(data);

        const state = room.gameState;
        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId) {
          socket.emit("error", { message: "Jogador não encontrado." });
          return;
        }

        try {
          executeFarmAction(state, playerId, data.cardInstanceId);
          advancePhase(state);
          console.log("Emitindo game:update para sala", data.gameId, state);
          io.to(data.gameId).emit("game:update", state);
        } catch (err: any) {
          socket.emit("error", { message: err.message });
        }
      },
    );

    socket.on("action:skip_farm", (data: { gameId: string }) => {
      const room = getRoom(data.gameId);
      if (!room || !room.gameState) {
        socket.emit("error", { message: "Jogo não iniciado." });
        return;
      }

      const state = room.gameState;
      const playerId = findPlayerIdBySocket(room, socket.id);
      if (!playerId) {
        socket.emit("error", { message: "Jogador não encontrado." });
        return;
      }

      if (state.currentPhase !== "farm") {
        return;
      }

      try {
        advancePhase(state);
        io.to(data.gameId).emit("game:update", state);
        return;
      } catch (err: any) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on(
      "action:play_monster_from_hand",
      (data: {
        gameId: string;
        cardInstanceId: string;
        exaustedIds: string[];
      }) => {
        const { cardInstanceId, exaustedIds, gameId } = data;

        console.log("action: play monster data: ", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });

        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId)
          return socket.emit("error", { message: "Jogo não iniciado." });

        try {
          executePlayMonsterCardFromHand(
            room.gameState,
            playerId,
            cardInstanceId,
            exaustedIds,
          );
          console.log("monstro invocado: ", room.gameState);
          notifyPendingEffect(room, io);

          io.to(gameId).emit("game:update", room.gameState);
        } catch (error: any) {
          console.log(error);
          socket.emit("error", { message: error.message });
        }
      },
    );

    socket.on(
      "action:evolve_monster",
      (data: {
        gameId: string;
        evoInstanceId: string;
        preEvoInstanceId: string;
        exaustedIds: string[];
      }) => {
        const { evoInstanceId, preEvoInstanceId, exaustedIds, gameId } = data;

        console.log("action: evolve monster data: ", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });

        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId)
          return socket.emit("error", { message: "Jogo não iniciado." });

        try {
          executeEvolveMonsterCardFromHand(
            room.gameState,
            playerId,
            evoInstanceId,
            preEvoInstanceId,
            exaustedIds,
          );
          console.log("monstro invocado: ", room.gameState);
          notifyPendingEffect(room, io);

          io.to(gameId).emit("game:update", room.gameState);
        } catch (error: any) {
          console.log(error);
          socket.emit("error", { message: error.message });
        }
      },
    );

    socket.on(
      "action:play_monster_from_farm",
      (data: {
        gameId: string;
        cardInstanceId: string;
        exaustedIds: string[];
      }) => {
        const { cardInstanceId, exaustedIds, gameId } = data;

        console.log("action: play monster from farm data: ", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });

        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId)
          return socket.emit("error", { message: "Jogo não iniciado." });

        try {
          executePlayMonsterCardFromFarm(
            room.gameState,
            playerId,
            cardInstanceId,
            exaustedIds,
          );
          console.log("monstro invocado: ", room.gameState);
          notifyPendingEffect(room, io);

          io.to(gameId).emit("game:update", room.gameState);
        } catch (error: any) {
          console.log(error);
          socket.emit("error", { message: error.message });
        }
      },
    );

    socket.on(
      "action:move_to_battle",
      (data: { gameId: string; cardInstanceId: string }) => {
        const { cardInstanceId, gameId } = data;

        console.log("action: move to battle: ", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });

        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId)
          return socket.emit("error", { message: "Jogo não iniciado." });

        try {
          executeMoveMonsterToBattle(room.gameState, playerId, cardInstanceId);
          console.log("monstro movido: ", room.gameState);
          io.to(gameId).emit("game:update", room.gameState);
        } catch (error: any) {
          console.log(error);
          socket.emit("error", { message: error.message });
        }
      },
    );

    socket.on(
      "action:declare_attack",
      (data: {
        gameId: string;
        attackerInstanceId: string;
        targetInstanceId: string | null;
      }) => {
        const { attackerInstanceId, targetInstanceId, gameId } = data;

        console.log("action:declare_attack", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });

        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId)
          return socket.emit("error", { message: "Jogo não iniciado." });

        try {
          declareAttack(
            room.gameState,
            playerId,
            attackerInstanceId,
            targetInstanceId,
          );
          console.log("ataque declarado: ", room.gameState);
          // step=declare → [attacking] e [attacked] já foram disparados
          notifyPendingEffect(room, io);
          io.to(gameId).emit("game:update", room.gameState);

          if (targetInstanceId) {
            const oponent = getOpponentConnection(room, playerId);
            const effects = hasAttackedEffects(
              room.gameState,
              targetInstanceId,
            );
            console.log("oponente attacked:", oponent);
            console.log("effects attacked:", effects);
            if (oponent && effects) {
              console.log("disparou prompt_attacked");
              io.to(oponent.socketId).emit("game:prompt_attacked", {
                gameId,
                attackerInstanceId,
                targetInstanceId,
              });
            }
          }
        } catch (error: any) {
          console.log(error);
          socket.emit("error", { message: error.message });
        }
      },
    );

    socket.on("action:resolve_attacked", (data: { gameId: string }) => {
      const { gameId } = data;

      console.log("action:resolve_attacked", data);

      const room = getRoom(gameId);

      if (!room) return socket.emit("error", { message: "Jogo não iniciado." });

      const { gameState } = room;

      if (!gameState)
        return socket.emit("error", {
          message: "Não foi possivel encontrar o jogo.",
        });
      const { battle } = gameState;

      if (!battle)
        return socket.emit("error", {
          message: "Você só pode tomar essa ação durante a batalha.",
        });

      const { targetInstanceId } = battle;

      if (!targetInstanceId)
        return socket.emit("error", {
          message: "Não há alvo de ataque para ativar efeitos.",
        });

      const playerId = findPlayerIdBySocket(room, socket.id);

      if (!playerId)
        return socket.emit("error", { message: "Jogo não iniciado." });

      try {
        attacked(gameState);
        console.log("resolvendo attacked: ", room.gameState);
        // step=battling → [blocking] e [battling] já foram disparados
        notifyPendingEffect(room, io);
        io.to(gameId).emit("game:update", room.gameState);
      } catch (error: any) {
        console.log(error);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("action:skip_attacked", (data: { gameId: string }) => {
      const { gameId } = data;

      console.log("action:skip_attacked", data);

      const room = getRoom(gameId);

      if (!room?.gameState)
        return socket.emit("error", { message: "Jogo não iniciado." });

      const playerId = findPlayerIdBySocket(room, socket.id);

      if (!playerId)
        return socket.emit("error", { message: "Jogo não iniciado." });

      try {
        skipAttacked(room.gameState, playerId);
        console.log("bloqueio pulado: ", room.gameState);
        // step=battling → [battling] já foi disparado
        notifyPendingEffect(room, io);
        io.to(gameId).emit("game:update", room.gameState);
      } catch (error: any) {
        console.log(error);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on(
      "action:declare_block",
      (data: { gameId: string; blockerInstanceId: string }) => {
        const { blockerInstanceId, gameId } = data;

        console.log("action:declare_block", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });

        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId)
          return socket.emit("error", { message: "Jogo não iniciado." });

        try {
          declareBlock(room.gameState, playerId, blockerInstanceId);
          console.log("bloqueio declarado: ", room.gameState);
          // step=battling → [blocking] e [battling] já foram disparados
          notifyPendingEffect(room, io);
          io.to(gameId).emit("game:update", room.gameState);
        } catch (error: any) {
          console.log(error);
          socket.emit("error", { message: error.message });
        }
      },
    );

    socket.on(
      "action:skip_block",
      (data: { gameId: string; blockerInstanceId: string }) => {
        const { blockerInstanceId, gameId } = data;

        console.log("action:skip_block", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });

        const playerId = findPlayerIdBySocket(room, socket.id);

        if (!playerId)
          return socket.emit("error", { message: "Jogo não iniciado." });

        try {
          skipBlocking(room.gameState, playerId);
          console.log("bloqueio pulado: ", room.gameState);
          // step=battling → [battling] já foi disparado
          notifyPendingEffect(room, io);
          io.to(gameId).emit("game:update", room.gameState);
        } catch (error: any) {
          console.log(error);
          socket.emit("error", { message: error.message });
        }
      },
    );

    socket.on("action:resolve_battle", (data: { gameId: string }) => {
      const { gameId } = data;

      console.log("action:resolve_battle", data);

      const room = getRoom(gameId);

      if (!room?.gameState)
        return socket.emit("error", { message: "Jogo não iniciado." });

      const playerId = findPlayerIdBySocket(room, socket.id);

      if (!playerId)
        return socket.emit("error", { message: "Jogo não iniciado." });

      try {
        resolveCombatDamage(room.gameState);
        console.log("batalha resolvida: ", room.gameState);
        // step=after_battle → [after_attacking] e [after_attacked] já foram disparados
        notifyPendingEffect(room, io);
        io.to(gameId).emit("game:update", room.gameState);
      } catch (error: any) {
        console.log(error);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("action:cleanup", (data: { gameId: string }) => {
      const { gameId } = data;

      console.log("action:cleanup", data);

      const room = getRoom(gameId);

      if (!room?.gameState)
        return socket.emit("error", { message: "Jogo não iniciado." });

      const playerId = findPlayerIdBySocket(room, socket.id);

      if (!playerId)
        return socket.emit("error", { message: "Jogo não iniciado." });

      try {
        cleanupBattle(room.gameState);
        console.log("cleanup: ", room.gameState);
        io.to(gameId).emit("game:update", room.gameState);
      } catch (error: any) {
        console.log(error);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("action:end_turn", (data: { gameId: string }) => {
      const { gameId } = data;

      console.log("action: end turn: ", data);

      const room = getRoom(gameId);

      if (!room?.gameState)
        return socket.emit("error", { message: "Jogo não iniciado." });

      try {
        endTurn(room.gameState);
        console.log("monstro movido: ", room.gameState);
        io.to(gameId).emit("game:update", room.gameState);
      } catch (error: any) {
        console.log(error);
        socket.emit("error", { message: error.message });
      }
    });

    socket.on(
      "action:resolve_optional_effect",
      (data: {
        gameId: string;
        accept: boolean;
        targetInstanceId?: string;
      }) => {
        const { gameId, accept, targetInstanceId } = data;

        console.log("action:resolve_optional_effect", data);
        console.log("action:resolve_optional_effect", data);

        const room = getRoom(gameId);

        if (!room?.gameState)
          return socket.emit("error", { message: "Jogo não iniciado." });
        const state = room.gameState;

        const effects = state.pendingOptionalEffects;
        if (!effects || effects.length <= 0)
          return socket.emit("error", { message: "Não há efeitos." });

        const playerId = effects[0].ownerId;

        if (!playerId)
          return socket.emit("error", { message: "Jogador não encontrado." });

        const [effect] = effects.splice(0, 1);

        if (accept) {
          console.log(
            "resultado: ",
            effect.requiresTarget && !targetInstanceId,
          );
          console.log("targetInstanceId: ", targetInstanceId);

          console.log("effect.requiresTarget: ", effect.requiresTarget);
          if (effect.requiresTarget && !targetInstanceId)
            throw new Error("Você deve enviar o alvo.");

          const entry: StackEntry = {
            id: `opt-${Date.now()}`,
            sourceInstanceId: effect.sourceInstanceId,
            ownerId: effect.ownerId,
            trigger: effect.trigger,
            targetFilter: effect.targetFilter,
            effectSpeed: effect.effectSpeed,
            params: {
              ...effect.params,
              ...(targetInstanceId ? { targetInstanceId } : {}),
            },
            resolved: false,
          };
          executeEffect(state, entry);
          console.log("efeito opcional executado:", effect.action);
        } else {
          console.log("efeito opcional recusado:", effect.action);
        }

        // Se ainda houver mais efeitos opcionais para este jogador, notifica
        const next = state.pendingOptionalEffects?.find(
          (e) => e.ownerId === playerId,
        );
        if (next) {
          socket.emit("game:pending_optional_effect", { effect: next });
        }

        io.to(gameId).emit("game:update", state);
      },
    );

    socket.on("disconnect", () => {
      console.log(`[socket] ❌ desconectado: ${socket.id}`);
      // 🔮 DIA 2: Implementar lógica de reconexão / cleanup de salas
    });
  });
}

interface JoinPayload {
  gameId: string;
  name?: string;
}

type CallbackFn = (response: {
  ok: boolean;
  player?: PlayerConnection;
  gameId?: string;
  room?: {
    id: string;
    state: RoomState;
    players: PlayerConnection[];
    roomName: string;
  };
  error?: string;
}) => void;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "UNKNOWN_ERROR";
}

/**
 * Se houver efeitos opcionais pendentes, notifica o dono do primeiro via socket.
 */
function notifyPendingEffect(room: GameRoom, io: Server): void {
  const pending = room.gameState?.pendingOptionalEffects;
  if (!pending || pending.length === 0) return;

  const first = pending[0];
  const ownerSocketId = room.players.find(
    (p) => p.playerId === first.ownerId,
  )?.socketId;

  if (ownerSocketId) {
    io.to(ownerSocketId).emit("game:pending_optional_effect", {
      effect: first,
    });
  }
}

function findPlayerIdBySocket(room: GameRoom, socketId: string): string | null {
  const player = room.players.find((p) => p.socketId === socketId);
  return player?.playerId ?? null;
}

function getOpponentConnection(
  room: GameRoom,
  playerId: string,
): PlayerConnection | null {
  return room.players.find((p) => p.playerId !== playerId) ?? null;
}

function findPlayerById(room: GameRoom, id: string): PlayerConnection | null {
  const player = room.players.find((p) => p.playerId === id);
  if (!player) return null;
  return player;
}
