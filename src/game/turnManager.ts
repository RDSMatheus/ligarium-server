import {
  GameState,
  PlayerState,
  TurnPhase,
  ID,
  CardInstance,
} from "./gameTypes";
import { getTemplateOrThrow } from "./data/cardDatabase";

const PHASE_ORDER: TurnPhase[] = ["refresh", "draw", "farm", "main", "end"];

export function isPlayerTurn(state: GameState, playerId: ID): boolean {
  return state.currentPlayerId === playerId;
}

export function getCurrentPhase(state: GameState): TurnPhase {
  return state.currentPhase;
}

export function getPlayerState(state: GameState, playerId: ID): PlayerState {
  const ps = state.playerStates.find((p) => p.playerId === playerId);
  if (!ps) throw new Error(`Jogador não encontrado: ${playerId}`);
  return ps;
}

export function getOpponentState(state: GameState, playerId: ID): PlayerState {
  const opponentState = state.playerStates.find((p) => p.playerId !== playerId);
  if (!opponentState) throw new Error("Oponente não encontrado");
  return opponentState;
}

/**
 * Envia uma carta (e quaisquer anexos) para o trash do dono.
 * Garante que, se uma carta tem `attached`, cada attached é enviado como entrada separada.
 */
export function sendCardToTrash(player: PlayerState, card: CardInstance) {
  // Primeiro, se a carta tem anexos, envie-os também (mantendo ordem: attached primeiro)
  if (card.attached && card.attached.length > 0) {
    for (const attached of card.attached) {
      // recursivamente limpar attached aninhados
      sendCardToTrash(player, attached);
    }
  }

  // Remover referências: se esta carta está attachedTo de outro, limpe do host
  if (card.attachedTo) {
    const host = [
      ...player.battleZone,
      ...player.mainZone,
      ...player.farm,
      ...player.hand,
      ...player.terrainsZone,
    ].find((c) => c.instanceId === card.attachedTo);
    if (host && host.attached) {
      host.attached = host.attached.filter(
        (a) => a.instanceId !== card.instanceId,
      );
    }
    card.attachedTo = null;
  }

  // Finalmente, adicione ao trash. Não assumimos que a carta esteja numa zona específica aqui —
  // o chamador normalmente a removeu da zona antes.
  player.trash.push(card);
}

export function advancePhase(state: GameState): void {
  const currentIndex = PHASE_ORDER.indexOf(state.currentPhase);
  const nextIndex = currentIndex + 1;

  if (nextIndex >= PHASE_ORDER.length) {
    endTurn(state);
    return;
  }

  state.currentPhase = PHASE_ORDER[nextIndex];
}

export function endTurn(state: GameState): void {
  const playerIds = state.playerStates.map((player) => player.playerId);
  const currentIndex = playerIds.indexOf(state.currentPlayerId ?? "");
  const nextIndex = (currentIndex + 1) % playerIds.length;

  state.currentPlayerId = playerIds[nextIndex];
  state.turnNumber += 1;
  state.currentPhase = "refresh";
}

export function revealTerrain(state: GameState, playerId: ID): void {
  const ps = getPlayerState(state, playerId);
  const turnNumber = state.turnNumber;

  const terrain = ps.terrainsDeck.splice(0, 1)[0];
  terrain.revealed = true;
  ps.terrainsZone.push(terrain);
}

export function revealFirstTerrain(state: GameState, playerId: ID): void {
  const ps = getPlayerState(state, playerId);
  const turnNumber = state.turnNumber;

  if (turnNumber < 3) {
    const terrain = ps.terrainsDeck.splice(0, 1)[0];
    terrain.revealed = true;
    ps.terrainsZone.push(terrain);
  }
}

export function executeRefreshPhase(state: GameState, playerId: ID): void {
  const ps = getPlayerState(state, playerId);
  console.log(
    "executeRefresh:",
    ps.terrainsZone.length === 0 && state.turnNumber < 2,
  );

  if (!ps.hasRevealedFirstTerrain && ps.terrainsDeck.length > 0)
    revealFirstTerrain(state, ps.playerId);

  for (const card of ps.mainZone) {
    const template = getTemplateOrThrow(card.templateId);
    // Se o card está lockedUntilEndOfTurn, não o torna Active agora.
    if (!card.lockedUntilEndOfTurn) {
      card.exhausted = false;
      card.canAttack = true;
    }
    card.currentHp = template.hp ?? card.currentHp;
  }

  while (ps.battleZone.length > 0) {
    const card = ps.battleZone.pop()!;
    const template = getTemplateOrThrow(card.templateId);
    if (!card.lockedUntilEndOfTurn) {
      card.exhausted = false;
      card.canAttack = true;
    }
    card.currentHp = template.hp ?? card.currentHp;
    ps.mainZone.push(card);
  }

  for (const card of ps.farm) {
    if (!card.lockedUntilEndOfTurn) card.exhausted = false;
  }
  for (const card of ps.terrainsZone) {
    if (!card.lockedUntilEndOfTurn) card.exhausted = false;
  }

  // Ao final do Refresh do jogador, limpa locks que duravam até o fim deste Refresh.
  for (const card of [
    ...ps.hand,
    ...ps.farm,
    ...ps.mainZone,
    ...ps.battleZone,
    ...ps.terrainsZone,
  ]) {
    if (card.lockedUntilEndOfTurn) card.lockedUntilEndOfTurn = false;
  }
}

export function executeDrawPhase(state: GameState, playerId: ID): void {
  const ps = getPlayerState(state, playerId);

  if (ps.deck.length === 0) return;

  const drawCard = ps.deck.splice(0, 1);
  ps.hand.push(...drawCard);
}

// Ações de jogo do jogador (farm, jogar carta, evoluir, mover) → ver gameEngine.ts
