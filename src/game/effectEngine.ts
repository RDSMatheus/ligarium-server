import {
  CardEffect,
  CardTemplate,
  EffectTrigger,
  getTemplateOrThrow,
} from "./data/cardDatabase";
import {
  CardInstance,
  EffectSpeed,
  EffectWindow,
  FastTimingWindow,
  FastType,
  GameState,
  PlayerState,
  StackEntry,
} from "./gameTypes";
import { getPlayerState, getOpponentState } from "./turnManager";

// ══════════════════════════════════════════════════════════
//  HELPERS DE CLASSIFICAÇÃO
// ══════════════════════════════════════════════════════════

/**
 * Retorna todos os trigger effects de um template que casam com um evento.
 * Trigger effects ativam automaticamente quando o evento ocorre.
 */
export function collectTriggerEffects(
  card: CardTemplate,
  trigger: EffectTrigger,
): CardEffect[] {
  return (
    card.effects?.filter(
      (e) => e.speed === "trigger" && e.trigger.includes(trigger),
    ) ?? []
  );
}

/** Atalho: retorna efeitos trigger do tipo "played" */
export function playedEffects(card: CardTemplate): CardEffect[] {
  return collectTriggerEffects(card, "played");
}

export function attackingEffects(card: CardTemplate): CardEffect[] {
  return collectTriggerEffects(card, "attacking");
}

export function attackedEffects(card: CardTemplate): CardEffect[] {
  return collectTriggerEffects(card, "attacked");
}

export function evolvingEffects(card: CardTemplate): CardEffect[] {
  return collectTriggerEffects(card, "evolving");
}

/** Atalho: retorna o primeiro efeito "played" ou null */
export function playedEffect(card: CardTemplate): CardEffect | null {
  return playedEffects(card)[0] ?? null;
}

/**
 * Retorna todos os efeitos fast de um template.
 */
export function getFastEffects(card: CardTemplate): CardEffect[] {
  return card.effects?.filter((e) => e.speed === "fast") ?? [];
}

// ══════════════════════════════════════════════════════════
//  VALIDAÇÃO DE JANELA (FAST EFFECTS)
// ══════════════════════════════════════════════════════════

/**
 * Verifica se um efeito fast pode ser ativado na janela atual.
 *
 * Regras:
 * - free     → qualquer janela aberta
 * - timed    → somente nas janelas listadas em fastTiming
 * - response → somente quando há ação/efeito ativo (janela ≠ "open")
 */
export function canActivateInWindow(
  effect: CardEffect,
  window: EffectWindow | null,
): boolean {
  if (effect.speed !== "fast") return false;
  if (!window) return false;

  switch (effect.fastType) {
    case "free":
      // Fast livre: pode ser usado em qualquer janela aberta
      return true;

    case "timed":
      // Fast com timing: só em janelas específicas
      if (!effect.fastTiming || effect.fastTiming.length === 0) return false;
      return effect.fastTiming.includes(window.type as FastTimingWindow);

    case "response":
      // Fast de resposta: precisa de um evento ativo (não pode ser janela "open")
      return window.type !== "open";

    default:
      return false;
  }
}

/**
 * Verifica se um efeito é de interação (exceção à regra geral).
 *
 * Efeitos de interação podem responder ANTES da resolução do efeito principal,
 * porque agem diretamente sobre a ação em andamento.
 */
export function isInteractionEffect(effect: CardEffect): boolean {
  return effect.speed === "fast" && effect.interaction === true;
}

// ══════════════════════════════════════════════════════════
//  BUSCA DE EFEITOS DISPONÍVEIS
// ══════════════════════════════════════════════════════════

/**
 * Retorna todos os efeitos fast que um jogador pode ativar na janela atual.
 * Percorre todas as zonas relevantes e valida timing + condições.
 */
export function getAvailableFastEffects(
  state: GameState,
  playerId: string,
): { card: CardInstance; effect: CardEffect; template: CardTemplate }[] {
  const ps = getPlayerState(state, playerId);
  const window = state.effectWindow;
  if (!window) return [];

  const result: {
    card: CardInstance;
    effect: CardEffect;
    template: CardTemplate;
  }[] = [];

  // Verifica cartas em todas as zonas relevantes
  const allCards = [
    ...ps.hand,
    ...ps.battleZone,
    ...ps.mainZone,
    ...ps.farm,
    ...ps.terrainsZone,
  ];

  for (const card of allCards) {
    const template = getTemplateOrThrow(card.templateId);
    if (!template.effects) continue;

    for (const effect of template.effects) {
      if (effect.speed !== "fast") continue;
      if (!canActivateInWindow(effect, window)) continue;

      // Checar condição do efeito
      if (!checkEffectCondition(state, playerId, card, effect)) continue;

      result.push({ card, effect, template });
    }
  }

  return result;
}

/**
 * Verifica se o oponente tem efeitos de interação que podem responder
 * ANTES da resolução de um efeito.
 *
 * Esta é a exceção à regra geral: efeitos de interação podem agir
 * sobre a ação/efeito em andamento antes de ele ser resolvido.
 */
export function hasInteractionResponse(
  state: GameState,
  respondingPlayerId: string,
): boolean {
  const available = getAvailableFastEffects(state, respondingPlayerId);
  return available.some(({ effect }) => isInteractionEffect(effect));
}

// ══════════════════════════════════════════════════════════
//  GESTÃO DE JANELAS DE EFEITO
// ══════════════════════════════════════════════════════════

/**
 * Abre uma janela de efeito no estado do jogo.
 * Determina quais efeitos fast podem ser ativados.
 */
export function openEffectWindow(
  state: GameState,
  type: FastTimingWindow | "open",
  triggerPlayerId: string,
  sourceInstanceId?: string,
  context?: Record<string, any>,
): void {
  state.effectWindow = {
    type,
    triggerPlayerId,
    sourceInstanceId,
    context,
  };
}

/** Fecha a janela de efeito atual. */
export function closeEffectWindow(state: GameState): void {
  state.effectWindow = null;
}

// ══════════════════════════════════════════════════════════
//  RESOLUÇÃO DE EFEITOS
// ══════════════════════════════════════════════════════════

/**
 * Fluxo principal de resolução após uma ação:
 *
 * 1. A ação principal ocorre (jogar monstro, declarar ataque, etc.)
 * 2. Trigger effects que casam com o evento são coletados
 * 3. Regra geral: resolve o efeito principal PRIMEIRO
 * 4. Depois abre janela para fast effects
 * 5. Exceção: efeitos de interação podem responder ANTES da resolução
 */
export function processGameEvent(
  state: GameState,
  trigger: EffectTrigger,
  triggerPlayerId: string,
  sourceInstanceId?: string,
  context?: Record<string, any>,
): {
  triggerEntries: StackEntry[];
  windowType: FastTimingWindow | "open";
  hasInteraction: boolean;
} {
  const windowType = mapTriggerToWindow(trigger);

  // 1. Coleta trigger effects de TODOS os jogadores que casam com o evento
  const triggerEntries: StackEntry[] = [];

  for (const ps of state.playerStates) {
    const allCards = [
      ...ps.battleZone,
      ...ps.mainZone,
      ...ps.farm,
      ...ps.terrainsZone,
    ];

    for (const card of allCards) {
      const template = getTemplateOrThrow(card.templateId);
      const effects = collectTriggerEffects(template, trigger);

      for (const effect of effects) {
        if (!checkEffectCondition(state, ps.playerId, card, effect)) continue;

        if (!hasLegalTargets(effect, state, ps.playerId)) continue;

        triggerEntries.push({
          id: "", // será preenchido pelo chamador
          sourceInstanceId: card.instanceId,
          ownerId: ps.playerId,
          targetFilter: effect.targetFilter,
          trigger,
          effectSpeed: "trigger",
          params: { value: effect.value, ...context },
          resolved: false,
        });
      }
    }
  }

  // 2. Abre janela de efeito
  openEffectWindow(
    state,
    windowType,
    triggerPlayerId,
    sourceInstanceId,
    context,
  );

  // 3. Verifica se o oponente tem efeitos de interação
  const opp = getOpponentState(state, triggerPlayerId);
  const hasInteraction = hasInteractionResponse(state, opp.playerId);

  return { triggerEntries, windowType, hasInteraction };
}

// ══════════════════════════════════════════════════════════
//  HELPERS INTERNOS
// ══════════════════════════════════════════════════════════

/**
 * Mapeia um trigger de evento para a FastTimingWindow correspondente.
 */
function mapTriggerToWindow(trigger: string): FastTimingWindow | "open" {
  switch (trigger) {
    case "played":
    case "when_played":
      return "on_monster_played";
    case "when_destroyed":
      return "on_monster_destroyed";
    case "when_returned":
      return "on_monster_returned";
    case "attacking":
    case "attacked":
      return "on_attack_declared";
    case "blocking":
    case "blocked":
      return "on_block_declared";
    default:
      return "on_card_activated";
  }
}

/**
 * Verifica se a condição de um efeito é satisfeita.
 */
function checkEffectCondition(
  state: GameState,
  playerId: string,
  card: CardInstance,
  effect: CardEffect,
): boolean {
  const condition = effect.condition;
  if (!condition || condition === "always") return true;

  const ps = getPlayerState(state, playerId);

  switch (condition) {
    case "while_exhausted":
      return card.exhausted;
    case "while_active":
      return !card.exhausted;
    case "if_farm_has_active":
      return ps.farm.some((c) => !c.exhausted && !c.lockedUntilEndOfTurn);
    case "if_opponent_farm_empty": {
      const opp = getOpponentState(state, playerId);
      return opp.farm.length === 0;
    }
    default:
      return true;
  }
}

export function hasLegalTargets(
  effect: CardEffect,
  state: GameState,
  ownerId: string,
): boolean {
  if (!effect.requiresTarget) return true;

  const ps = getPlayerState(state, ownerId);
  const oppState = getOpponentState(state, ownerId);

  const zonesObj = {
    opponent_farm: oppState.farm,
    own_farm: ps.farm,
    opponent_battle: oppState.battleZone,
    own_battle: ps.battleZone,
    opponent_hand: oppState.hand,
    own_hand: ps.hand,
    opponent_main: oppState.mainZone,
    own_main: ps.mainZone,
    opponent_trash: oppState.trash,
    own_trash: ps.trash,
    any: [
      ...oppState.farm,
      ...ps.farm,
      ...oppState.battleZone,
      ...ps.battleZone,
      ...oppState.hand,
      ...ps.hand,
      ...oppState.mainZone,
      ...oppState.trash,
      ...ps.trash,
    ],
  };

  const zones = effect.targetZones;

  if (!zones) return false;

  zones.forEach((zone) =>
    zonesObj[zone].some((c) => {
      if (!c) return false;
      const f = effect.targetFilter ?? "any";
      if (f === "any") return true;
      if (f === "exhausted") return !!c.exhausted;
      if (f === "active") return !c.exhausted && !c.lockedUntilEndOfTurn;
    }),
  );

  return false;
}
