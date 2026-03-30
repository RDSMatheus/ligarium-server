import { openChain, pushToChain } from "./chainEngine";
import { getTemplateOrThrow } from "./data/cardDatabase";
import { openEffectWindow } from "./effectEngine";
import { CardInstance, GameState, PlayerState } from "./gameTypes";
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

  if (targetInstanceId) {
    const opp = getOpponentState(state, playerId);
    const hasTaunt = opp.battleZone.find((c) => {
      const t = getTemplateOrThrow(c.templateId);
      return (
        c.exhausted &&
        t.effects?.some((e) => e.action === "taunt_while_exhausted")
      );
    });
    if (hasTaunt && targetInstanceId !== hasTaunt.instanceId)
      throw new Error("Você deve atacar o monstro com [Taunt].");

    if (!opp.battleZone.find((c) => c.instanceId === targetInstanceId))
      throw new Error("Alvo não encontrado.");
  }

  attacker.exhausted = true;
  state.battle = {
    step: "declare",
    attackerPlayerId: playerId,
    attackerInstanceId,
    targetInstanceId,
    blockerInstanceId: null,
    damageModifiers: [],
  };

  // Abre chain com janela de ataque declarado
  openChain(state, playerId, "on_attack_declared", attackerInstanceId);

  const template = getTemplateOrThrow(attacker.templateId);
  const attackingEffect = template.effects?.find(
    (e) => e.trigger === "attacking",
  );
  if (attackingEffect) {
    pushToChain(state, {
      sourceInstanceId: attackerInstanceId,
      ownerId: playerId,
      trigger: "attacking",
      effectSpeed: attackingEffect.speed ?? "trigger",
      interaction: attackingEffect.interaction,
    });
  }
}

export function declareBlock(
  state: GameState,
  playerId: string,
  blockerInstanceId: string,
) {
  const ps = getPlayerState(state, playerId);
  const blocker = ps.battleZone.find((c) => c.instanceId === blockerInstanceId);
  if (!state.battle) throw new Error("Não há batalha ativa.");

  if (state.battle.step !== "declare")
    throw new Error("Momento inválido para bloquear.");

  if (!blocker) throw new Error("Bloqueador não encontrado na battleZone.");

  if (blocker.exhausted) throw new Error("Esse monstro não pode bloquear");

  blocker.exhausted = true;
  state.battle.blockerInstanceId = blockerInstanceId;

  state.battle.step = "damage";
}

export function skipBlocking(state: GameState, playerId: string) {
  const ps = getPlayerState(state, playerId);

  if (!state.battle) throw new Error("Não há batalha ativa.");
  if (state.battle.step !== "declare")
    throw new Error("Não há janela de bloqueio");

  state.battle.step = "damage";
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
