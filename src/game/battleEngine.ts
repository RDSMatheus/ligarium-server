import { generateId } from "../utils/ids";
import { openChain, pushToChain } from "./chainEngine";
import { getTemplateOrThrow } from "./data/cardDatabase";
import {
  attackedEffects,
  attackingEffects,
  hasLegalTargets,
  openEffectWindow,
} from "./effectEngine";
import { executeEffect } from "./effects";
import { CardInstance, GameState, PlayerState, StackEntry } from "./gameTypes";
import {
  getOpponentState,
  getPlayerState,
  isPlayerTurn,
  revealTerrain,
  sendCardToTrash,
} from "./turnManager";

export function declareAttack(
  state: GameState,
  playerId: string,
  attackerInstanceId: string,
  targetInstanceId: string | null,
): void {
  if (!isPlayerTurn(state, playerId)) throw new Error("Não é seu turno.");
  if (state.currentPhase !== "main")
    throw new Error("Não é a fase de batalha.");

  const ps = getPlayerState(state, playerId);
  const attacker = ps.battleZone.find(
    (c) => c.instanceId === attackerInstanceId,
  );

  if (!attacker) throw new Error("Atacante não encontrado.");
  if (attacker.exhausted) throw new Error("Carta já exaurida.");

  const opp = getOpponentState(state, playerId);
  const hasTaunt = opp.battleZone.find((c) => {
    const t = getTemplateOrThrow(c.templateId);
    return (
      c.exhausted &&
      t.effects?.some((e) => e.action === "taunt_while_exhausted")
    );
  });

  if (hasTaunt && !targetInstanceId)
    throw new Error("Você deve atacar o monstro com [Taunt].");

  if (hasTaunt && targetInstanceId !== hasTaunt.instanceId)
    throw new Error("Você deve atacar o monstro com [Taunt].");

  if (
    targetInstanceId &&
    !opp.battleZone.find((c) => c.instanceId === targetInstanceId)
  )
    throw new Error("Alvo não encontrado.");

  attacker.exhausted = true;
  state.battle = {
    step: "attacking",
    attackerPlayerId: playerId,
    attackerInstanceId,
    targetInstanceId,
    blockerInstanceId: null,
    damageModifiers: [],
  };

  // Abre chain com janela de ataque declarado
  openChain(state, playerId, "on_attack_declared", attackerInstanceId);

  const template = getTemplateOrThrow(attacker.templateId);
  const attackingEffect = attackingEffects(template);
  if (attackingEffect.length === 0) return;

  for (const effect of attackingEffect) {
    if (effect.optional) {
      state.pendingOptionalEffects ??= [];
      state.pendingOptionalEffects.push({
        action: effect.action,
        ownerId: playerId,
        effectSpeed: effect.speed,
        targetFilter: effect.targetFilter,
        targetZone: effect.targetZones ? effect.targetZones : null,
        requiresTarget: effect.requiresTarget,
        sourceInstanceId: attacker.instanceId,
        trigger: "attacking",
        params: {
          value: effect.value,
        },
      });
    } else {
      const entry: StackEntry = {
        id: generateId("fx_"),
        ownerId: playerId,
        sourceInstanceId: attacker.instanceId,
        trigger: "attacking",
        effectSpeed: "trigger",
        params: { value: effect.value },
        resolved: false,
      };
      executeEffect(state, entry);
    }
  }
}

export function hasAttackedEffects(state: GameState, targetInstanceId: string) {
  if (!state || !targetInstanceId)
    throw new Error("GameState ou alvo não enviado");

  const ownerPs = state.playerStates.find((ps) =>
    ps.battleZone.some((c) => c.instanceId === targetInstanceId),
  );
  if (!ownerPs) throw new Error("Jogador não encontrado");

  const target = ownerPs.battleZone.find(
    (c) => c.instanceId === targetInstanceId,
  );
  if (!target) throw new Error("Alvo de ataque não encontrado");

  const tpl = getTemplateOrThrow(target.templateId);
  const effects = attackedEffects(tpl);

  console.log("template effects: ", tpl.effects);

  const hasActivatable = effects.some((f) =>
    hasLegalTargets(f, state, ownerPs.playerId),
  );

  if (!hasActivatable) return false;
  return true;
}

export function attacked(state: GameState) {
  if (!state.battle) throw new Error("Não há batalha ativa.");
  if (state.battle.step !== "attacking")
    throw new Error("Momento inválido para attacked.");

  const { targetInstanceId } = state.battle;
  if (!targetInstanceId) return null;

  const ownerPs = findOwner(state, targetInstanceId);

  if (!ownerPs)
    throw new Error("Não foi possivel encontrar o dono do alvo dessa batalha");

  const target = ownerPs.battleZone.find(
    (c) => c.instanceId === targetInstanceId,
  );

  if (!target) throw new Error("Alvo de ataque não encontrado");

  const template = getTemplateOrThrow(target.templateId);
  const attackedEffect = attackedEffects(template);

  state.battle.step = "blocking";

  if (attackedEffect.length === 0) return;

  for (const effect of attackedEffect) {
    if (effect.optional) {
      state.pendingOptionalEffects ??= [];
      state.pendingOptionalEffects.push({
        action: effect.action,
        ownerId: ownerPs.playerId,
        effectSpeed: effect.speed,
        targetFilter: effect.targetFilter,
        targetZone: effect.targetZones ? effect.targetZones : null,
        requiresTarget: effect.requiresTarget,
        sourceInstanceId: target.instanceId,
        trigger: "attacked",
        params: {
          value: effect.value,
        },
      });
    } else {
      const entry: StackEntry = {
        id: generateId("fx_"),
        ownerId: ownerPs.playerId,
        sourceInstanceId: target.instanceId,
        trigger: "attacked",
        effectSpeed: "trigger",
        params: { value: effect.value },
        resolved: false,
      };
      executeEffect(state, entry);
    }
  }
}

export function skipAttacked(state: GameState, playerId: string) {
  const ps = getPlayerState(state, playerId);

  if (!state.battle) throw new Error("Não há batalha ativa.");
  if (state.battle.step !== "attacking")
    throw new Error("Não há janela de [Attacked]");

  state.battle.step = "blocking";
}

export function declareBlock(
  state: GameState,
  playerId: string,
  blockerInstanceId: string,
) {
  const ps = getPlayerState(state, playerId);
  const blocker = ps.battleZone.find((c) => c.instanceId === blockerInstanceId);
  if (!state.battle) throw new Error("Não há batalha ativa.");

  if (state.battle.step !== "blocking")
    throw new Error("Momento inválido para bloquear.");

  if (!blocker) throw new Error("Bloqueador não encontrado na battleZone.");

  if (blocker.exhausted) throw new Error("Esse monstro não pode bloquear");

  blocker.exhausted = true;
  state.battle.blockerInstanceId = blockerInstanceId;

  state.battle.step = "battling";
}

export function skipBlocking(state: GameState, playerId: string) {
  const ps = getPlayerState(state, playerId);

  if (!state.battle) throw new Error("Não há batalha ativa.");
  if (state.battle.step !== "blocking")
    throw new Error("Não há janela de bloqueio");

  state.battle.step = "battling";
}

export function resolveCombatDamage(state: GameState) {
  if (!state.battle) return;

  const {
    attackerPlayerId,
    attackerInstanceId,
    targetInstanceId,
    blockerInstanceId,
    damageModifiers,
  } = state.battle;

  const attackerPs = getPlayerState(state, attackerPlayerId);
  const defenderPs = getOpponentState(state, attackerPlayerId);

  const attacker = attackerPs.battleZone.find(
    (c) => c.instanceId === attackerInstanceId,
  )!;

  const attackerAp = getCurrentAp(attacker);

  const combatTarget = getCombatTarget({
    blockerInstanceId,
    defenderPs,
    targetInstanceId,
  });

  if (combatTarget && blockerInstanceId) {
    const defenderAp = getCurrentAp(combatTarget);

    console.log("combatTarget: ", combatTarget);
    console.log("attacker: ", attacker);

    combatTarget.currentHp -= attackerAp;
    attacker.currentHp -= defenderAp;
  } else if (combatTarget) {
    combatTarget.currentHp -= attackerAp;
  } else {
    if (defenderPs.terrainsDeck.length > 0) {
      revealTerrain(state, defenderPs.playerId);
    } else {
      state.winner = attackerPlayerId;
    }
  }

  state.battle.step = "cleanup";
}

export function cleanupBattle(state: GameState): void {
  if (!state.battle) return;

  const playerStates = state.playerStates;

  playerStates.forEach((player) => {
    const deadCard = [...player.battleZone, ...player.mainZone].filter(
      (c) => c.currentHp <= 0,
    );

    deadCard.forEach((card) => {
      const fromBattle = player.battleZone.findIndex(
        (c) => c.instanceId === card.instanceId,
      );

      const fromMain = player.mainZone.findIndex(
        (c) => c.instanceId === card.instanceId,
      );

      if (fromBattle !== -1) {
        const [removed] = player.battleZone.splice(fromBattle, 1);

        sendCardToTrash(player, removed);
      }

      if (fromMain !== -1) {
        const [removed] = player.mainZone.splice(fromMain, 1);

        sendCardToTrash(player, removed);
      }
    });
  });

  state.battle = null;
}

export function getCombatTarget({
  blockerInstanceId,
  defenderPs,
  targetInstanceId,
}: {
  blockerInstanceId: string | null;
  defenderPs: PlayerState;
  targetInstanceId: string | null;
}) {
  let combatTarget;
  if (blockerInstanceId) {
    combatTarget = defenderPs.battleZone.find(
      (c) => c.instanceId === blockerInstanceId,
    );
  }

  if (targetInstanceId) {
    combatTarget = defenderPs.battleZone.find(
      (c) => c.instanceId === targetInstanceId,
    );
  }
  if (combatTarget) return combatTarget;
  return null;
}

export function getCurrentAp(card: CardInstance): number {
  const template = getTemplateOrThrow(card.templateId);
  const base = template.ap ?? 0;

  // soma todos os modificadores temporários
  const total = (card.apModifier ?? []).reduce(
    (acc, mod) => acc + mod.value,
    0,
  );

  return Math.max(0, base + total); // AP nunca abaixo de 0
}

export const findOwner = (state: GameState, cardId: string) => {
  const ownerPs = state.playerStates.find((ps) =>
    ps.battleZone.some((c) => c.instanceId === cardId),
  );
  if (!ownerPs) throw new Error("Jogador não encontrado");

  return ownerPs;
};
