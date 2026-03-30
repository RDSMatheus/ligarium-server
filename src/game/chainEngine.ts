import { generateId } from "../utils/ids";
import {
  ChainState,
  EffectSpeed,
  EffectWindow,
  FastTimingWindow,
  GameState,
  StackEntry,
} from "./gameTypes";
import { getOpponentState } from "./turnManager";
import {
  closeEffectWindow,
  getAvailableFastEffects,
  hasInteractionResponse,
  isInteractionEffect,
  openEffectWindow,
} from "./effectEngine";

// ══════════════════════════════════════════════════════════
//  ABERTURA DE CHAIN
// ══════════════════════════════════════════════════════════

/**
 * Abre uma chain com janela de efeito associada.
 * A priority começa com o oponente do ator que iniciou.
 */
export function openChain(
  state: GameState,
  firstActorId: string,
  windowType: FastTimingWindow | "open" = "open",
  sourceInstanceId?: string,
): void {
  const opp = getOpponentState(state, firstActorId);

  state.chain = {
    priority: opp.playerId,
    lastPassedBy: null,
    stack: [],
    currentWindow: null,
    awaitingInteraction: false,
  };

  // Abre janela de efeito no state
  openEffectWindow(state, windowType, firstActorId, sourceInstanceId);

  // Atualiza janela na chain
  state.chain.currentWindow = state.effectWindow;
}

// ══════════════════════════════════════════════════════════
//  PUSH DE EFEITOS NA STACK
// ══════════════════════════════════════════════════════════

/**
 * Empurra um efeito para a stack da chain.
 *
 * Regra geral: primeiro resolve o efeito principal, depois abre janela fast.
 * Exceção: efeitos de interação podem entrar antes da resolução.
 */
export function pushToChain(
  state: GameState,
  entry: Omit<StackEntry, "id" | "resolved">,
): void {
  if (!state.chain) throw new Error("Sem chain ativa.");

  if (state.chain.priority !== entry.ownerId)
    throw new Error("Não é sua vez na chain.");

  state.chain.stack.push({ ...entry, id: generateId("fx_"), resolved: false });
  state.chain.lastPassedBy = null;

  // Passa priority pro outro jogador
  const opp = getOpponentState(state, entry.ownerId);
  state.chain.priority = opp.playerId;

  // Se o efeito empurrado é de interação, marca que queremos resposta antes
  if (entry.interaction) {
    state.chain.awaitingInteraction = true;
  }
}

/**
 * Empurra um efeito fast na stack.
 * Valida que o efeito pode ser ativado na janela atual.
 */
export function pushFastToChain(
  state: GameState,
  entry: Omit<StackEntry, "id" | "resolved">,
): void {
  if (!state.chain) throw new Error("Sem chain ativa.");

  if (state.chain.priority !== entry.ownerId)
    throw new Error("Não é sua vez na chain.");

  // Verifica se tem fast effects disponíveis para este jogador
  const available = getAvailableFastEffects(state, entry.ownerId);
  if (available.length === 0) {
    throw new Error("Nenhum efeito fast disponível nesta janela.");
  }

  state.chain.stack.push({
    ...entry,
    id: generateId("fx_"),
    effectSpeed: "fast",
    resolved: false,
  });
  state.chain.lastPassedBy = null;

  // Passa priority
  const opp = getOpponentState(state, entry.ownerId);
  state.chain.priority = opp.playerId;
}

// ══════════════════════════════════════════════════════════
//  PASSAGEM DE PRIORITY
// ══════════════════════════════════════════════════════════

/**
 * Jogador passa a vez na chain.
 *
 * Fluxo de resolução:
 * 1. Se ambos passaram e tem itens na stack → resolve o topo
 * 2. Se aguardando interação e oponente passou → resolve sem interação
 * 3. Se stack vazia + ambos passaram → fecha chain
 *
 * Retorna true se a chain foi fechada.
 */
export function passChain(state: GameState, playerId: string): boolean {
  if (!state.chain) throw new Error("Sem chain ativa.");
  if (state.chain.priority !== playerId) throw new Error("Não é sua vez.");

  const opp = getOpponentState(state, playerId);
  const bothPassed = state.chain.lastPassedBy === opp.playerId;

  if (bothPassed) {
    // Se aguardando interação e oponente passou, limpa flag
    if (state.chain.awaitingInteraction) {
      state.chain.awaitingInteraction = false;
    }

    if (state.chain.stack.length > 0) {
      // Resolve o topo da stack
      const top = state.chain.stack.pop()!;
      top.resolved = true;
      state.chain.lastPassedBy = null;
      state.chain.priority = state.currentPlayerId ?? "";
      return false;
    }

    // Stack vazia + ambos passaram = fecha chain
    closeChain(state);
    return true;
  }

  state.chain.lastPassedBy = playerId;
  state.chain.priority = opp.playerId;
  return false;
}

// ══════════════════════════════════════════════════════════
//  INTERAÇÃO (EXCEÇÃO À REGRA GERAL)
// ══════════════════════════════════════════════════════════

/**
 * Verifica se a chain está aguardando uma resposta de interação.
 *
 * Efeitos de interação podem responder ANTES da resolução do efeito
 * principal, porque são feitos para agir diretamente sobre a ação
 * ou o efeito em andamento.
 */
export function isAwaitingInteraction(state: GameState): boolean {
  return state.chain?.awaitingInteraction === true;
}

/**
 * Abre janela de interação para o oponente responder ANTES da resolução.
 * Usado quando um efeito com interaction=true é empurrado na stack.
 */
export function openInteractionWindow(
  state: GameState,
  respondingPlayerId: string,
): void {
  if (!state.chain) return;

  state.chain.awaitingInteraction = true;
  state.chain.priority = respondingPlayerId;
  state.chain.lastPassedBy = null;
}

// ══════════════════════════════════════════════════════════
//  JANELA DE FAST EFFECTS
// ══════════════════════════════════════════════════════════

/**
 * Abre janela de fast effects após a resolução do efeito principal.
 *
 * Regra geral da engine:
 * Primeiro o jogo resolve o efeito principal, e SÓ DEPOIS abre
 * a janela para fast effects.
 */
export function openFastWindow(
  state: GameState,
  windowType: FastTimingWindow | "open",
  triggerPlayerId: string,
  sourceInstanceId?: string,
): void {
  openEffectWindow(state, windowType, triggerPlayerId, sourceInstanceId);

  if (state.chain) {
    state.chain.currentWindow = state.effectWindow;
    // Priority vai para o oponente do jogador que causou o evento
    const opp = getOpponentState(state, triggerPlayerId);
    state.chain.priority = opp.playerId;
    state.chain.lastPassedBy = null;
  }
}

// ══════════════════════════════════════════════════════════
//  FECHAMENTO DE CHAIN
// ══════════════════════════════════════════════════════════

/** Fecha a chain e limpa a janela de efeitos. */
export function closeChain(state: GameState): void {
  state.chain = null;
  closeEffectWindow(state);
}
