import {
  GameState,
  PlayerState,
  ID,
  StackEntry,
  CardInstance,
} from "./gameTypes";
import { getTemplateOrThrow } from "./data/cardDatabase";
import { playedEffects } from "./effectEngine";
import { executeEffect } from "./effects/index";
import { generateId } from "../utils/ids";
import { isPlayerTurn, getPlayerState } from "./turnManager";

// ── Ação: Farm ────────────────────────────────────────────────────────────────

export function executeFarmAction(
  state: GameState,
  playerId: ID,
  cardInstanceId: string,
): void {
  if (!isPlayerTurn(state, playerId)) {
    throw new Error("Não é o seu turno");
  }

  if (state.currentPhase !== "farm") {
    throw new Error("Não estamos na farm phase");
  }

  const ps = getPlayerState(state, playerId);

  const cardIndex = ps.hand.findIndex(
    (card) => card.instanceId === cardInstanceId,
  );

  if (cardIndex === -1) throw new Error("Carta não encontrada na mão");

  const card = ps.hand[cardIndex];
  const template = getTemplateOrThrow(card.templateId);

  if (template.type !== "monster")
    throw new Error("Apenas monstros podem ir para a farm");

  if (ps.farm.length >= 4) throw new Error("Farm cheia (max. 4)");

  ps.hand.splice(cardIndex, 1);
  card.canAttack = false;
  card.exhausted = false;
  ps.farm.push(card);

  if (ps.deck.length > 0) {
    const draw = ps.deck.splice(0, 1);
    ps.hand.push(...draw);
  }
}

// ── Ação: Jogar monstro da mão ────────────────────────────────────────────────

export function executePlayMonsterCardFromHand(
  state: GameState,
  playerId: ID,
  cardInstanceId: string,
  exaustedIds: string[],
) {
  if (!isPlayerTurn(state, playerId)) throw new Error("Não é o seu turno.");
  if (state.currentPhase !== "main")
    throw new Error("Você só pode realizar essa ação na main phase.");

  const ps = getPlayerState(state, playerId);

  console.log("cardInstanceId recebido:", cardInstanceId);
  console.log(
    "mão do jogador:",
    ps.hand.map((c) => c.instanceId),
  );

  const cardIndex = ps.hand.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) throw new Error("Carta não encontrada");

  const cardInHand = ps.hand[cardIndex];

  const template = getTemplateOrThrow(cardInHand.templateId);

  if (template.type !== "monster")
    throw new Error("Você não pode jogar essa carta dessa forma.");

  const cost = template.playCost ?? 0;

  if (exaustedIds.length !== cost)
    throw new Error(`Exaure ${cost} para pagar o custo.`);

  exaustedIds.forEach((id) => {
    const isCardOnFarm = ps.farm.find((card) => card.instanceId === id);
    const isCardOnTerrain = ps.terrainsZone.find(
      (card) => card.instanceId === id,
    );

    if (!isCardOnFarm && !isCardOnTerrain)
      throw new Error("Essa carta não está na farm, nem nos terrenos");

    if (isCardOnFarm?.exhausted || isCardOnTerrain?.exhausted)
      throw new Error("Carta já está exaurida.");

    if (isCardOnFarm) isCardOnFarm.exhausted = true;
    if (isCardOnTerrain) isCardOnTerrain.exhausted = true;
  });

  ps.hand.splice(cardIndex, 1);
  cardInHand.canAttack = false;
  cardInHand.exhausted = false;
  ps.mainZone.push(cardInHand);

  const onPlayEffects = playedEffects(template);

  if (onPlayEffects.length === 0) return;

  for (const effect of onPlayEffects) {
    if (effect.optional) {
      state.pendingOptionalEffects ??= [];
      state.pendingOptionalEffects.push({
        action: effect.action,
        ownerId: playerId,
        effectSpeed: effect.speed,
        requiresTarget: false,
        sourceInstanceId: cardInHand.instanceId,
        trigger: "played",
        params: {
          value: effect.value,
        },
      });
    } else {
      const entry: StackEntry = {
        id: generateId("fx_"),
        ownerId: playerId,
        sourceInstanceId: cardInHand.instanceId,
        trigger: "played",
        effectSpeed: "trigger",
        params: { value: effect.value },
        resolved: false,
      };
      executeEffect(state, entry);
    }
  }
}

// ── Ação: Evoluir monstro ─────────────────────────────────────────────────────

export function executeEvolveMonsterCardFromHand(
  state: GameState,
  playerId: ID,
  evoInstanceId: string,
  preEvoInstanceId: string,
  exaustedIds: string[],
) {
  if (!isPlayerTurn(state, playerId)) throw new Error("Não é o seu turno.");
  if (state.currentPhase !== "main")
    throw new Error("Você só pode realizar essa ação na main phase.");

  const ps = getPlayerState(state, playerId);

  console.log("cardInstanceId recebido:", evoInstanceId);
  console.log(
    "mão do jogador:",
    ps.hand.map((c) => c.instanceId),
  );

  const evoCardIndex = ps.hand.findIndex((c) => c.instanceId === evoInstanceId);
  if (evoCardIndex === -1) throw new Error("Evolução não encontrada");

  const cardInHand = ps.hand[evoCardIndex];
  const cardInBattleOrMain = findPreEvoOnField(preEvoInstanceId, ps);

  if (!cardInBattleOrMain) throw new Error("Carta não está no campo. ");

  const { preEvoCard, zone } = cardInBattleOrMain;

  const preEvoCardIndex = ps[zone].findIndex(
    (c) => c.instanceId === preEvoInstanceId,
  );
  if (preEvoCardIndex === -1) throw new Error("Pre-evo não encontrada");

  const evoTemplate = getTemplateOrThrow(cardInHand.templateId);
  const preEvoTemplate = getTemplateOrThrow(
    cardInBattleOrMain.preEvoCard.templateId,
  );

  if (evoTemplate.type !== "monster")
    throw new Error("Você não pode jogar essa carta dessa forma.");

  const evoCost = evoTemplate.evoCost ?? 0;

  if (exaustedIds.length !== evoCost)
    throw new Error(`Exaure ${evoCost} para pagar o custo.`);

  if (evoTemplate.evolvesFrom !== preEvoTemplate.id)
    throw new Error("Esse monstro não é a evolução.");

  exaustedIds.forEach((id) => {
    const isCardOnFarm = ps.farm.find((card) => card.instanceId === id);
    const isCardOnTerrain = ps.terrainsZone.find(
      (card) => card.instanceId === id,
    );

    if (!isCardOnFarm && !isCardOnTerrain)
      throw new Error("Essa carta não está na farm, nem nos terrenos");

    if (isCardOnFarm?.exhausted || isCardOnTerrain?.exhausted)
      throw new Error("Carta já está exaurida.");

    if (isCardOnFarm) isCardOnFarm.exhausted = true;
    if (isCardOnTerrain) isCardOnTerrain.exhausted = true;
  });

  ps.hand.splice(evoCardIndex, 1);
  cardInHand.canAttack = preEvoCard.canAttack;
  cardInHand.exhausted = preEvoCard.exhausted;
  cardInHand.attached = cardInHand.attached
    ? [...cardInHand.attached, preEvoCard]
    : [preEvoCard];
  ps[zone].splice(preEvoCardIndex, 1);
  ps[zone].push(cardInHand);

  console.log("zona após evoluir: ", ps[zone]);

  const drawCard = ps.deck.splice(0, 1);
  ps.hand.push(...drawCard);

  const onPlayEffects = playedEffects(evoTemplate);

  if (onPlayEffects.length === 0) return;

  for (const effect of onPlayEffects) {
    if (effect.optional) {
      state.pendingOptionalEffects ??= [];
      state.pendingOptionalEffects.push({
        action: effect.action,
        ownerId: playerId,
        effectSpeed: effect.speed,
        requiresTarget: false,
        sourceInstanceId: cardInHand.instanceId,
        trigger: "played",
        params: {
          value: effect.value,
        },
      });
    } else {
      const entry: StackEntry = {
        id: generateId("fx_"),
        ownerId: playerId,
        sourceInstanceId: cardInHand.instanceId,
        trigger: "played",
        effectSpeed: "trigger",
        params: { value: effect.value },
        resolved: false,
      };
      executeEffect(state, entry);
    }
  }
}

// ── Ação: Jogar monstro da farm ───────────────────────────────────────────────

export function executePlayMonsterCardFromFarm(
  state: GameState,
  playerId: ID,
  cardInstanceId: string,
  exaustedIds: string[],
) {
  if (!isPlayerTurn(state, playerId)) throw new Error("Não é o seu turno.");
  if (state.currentPhase !== "main")
    throw new Error("Você só pode realizar essa ação na main phase.");

  const ps = getPlayerState(state, playerId);

  console.log("cardInstanceId recebido:", cardInstanceId);
  console.log(
    "farm do jogador:",
    ps.farm.map((c) => c.instanceId),
  );

  const cardIndex = ps.farm.findIndex((c) => c.instanceId === cardInstanceId);
  if (cardIndex === -1) throw new Error("Carta não encontrada");

  const cardInFarm = ps.farm[cardIndex];

  const template = getTemplateOrThrow(cardInFarm.templateId);

  if (template.type !== "monster")
    throw new Error("Você não pode jogar essa carta dessa forma.");

  const cost = template.playCost ?? 0;

  if (exaustedIds.length !== cost)
    throw new Error(`Exaure ${cost} para pagar o custo.`);

  exaustedIds.forEach((id) => {
    const isCardOnFarm = ps.farm.find((card) => card.instanceId === id);
    const isCardOnTerrain = ps.terrainsZone.find(
      (card) => card.instanceId === id,
    );

    if (!isCardOnFarm && !isCardOnTerrain)
      throw new Error("Essa carta não está na farm, nem nos terrenos");

    if (isCardOnFarm?.exhausted || isCardOnTerrain?.exhausted)
      throw new Error("Carta já está exaurida.");

    if (isCardOnFarm) isCardOnFarm.exhausted = true;
    if (isCardOnTerrain) isCardOnTerrain.exhausted = true;
  });

  ps.farm.splice(cardIndex, 1);
  cardInFarm.canAttack = false;
  cardInFarm.exhausted = exaustedIds.includes(cardInFarm.instanceId);
  ps.mainZone.push(cardInFarm);

  const onPlayEffects = playedEffects(template);

  if (onPlayEffects.length === 0) return;

  for (const effect of onPlayEffects) {
    if (effect.optional) {
      state.pendingOptionalEffects ??= [];
      state.pendingOptionalEffects.push({
        action: effect.action,
        ownerId: playerId,
        requiresTarget: false,
        effectSpeed: effect.speed,
        sourceInstanceId: cardInFarm.instanceId,
        trigger: "played",
        params: {
          value: effect.value,
        },
      });
    } else {
      const entry: StackEntry = {
        id: generateId("fx_"),
        ownerId: playerId,
        sourceInstanceId: cardInFarm.instanceId,
        trigger: "played",
        effectSpeed: "trigger",
        params: { value: effect.value },
        resolved: false,
      };
      executeEffect(state, entry);
    }
  }
}

// ── Ação: Mover monstro para battleZone ──────────────────────────────────────

export function executeMoveMonsterToBattle(
  state: GameState,
  playerId: string,
  cardInstanceId: string,
) {
  if (!isPlayerTurn(state, playerId)) throw new Error("Não é o seu turno.");
  if (state.currentPhase !== "main")
    throw new Error("Você só pode realizar essa ação na main phase.");

  const ps = getPlayerState(state, playerId);

  const cardIndex = ps.mainZone.findIndex(
    (card) => card.instanceId === cardInstanceId,
  );

  if (cardIndex === -1) throw new Error("A carta não está no campo.");

  const card = ps.mainZone.splice(cardIndex, 1)[0];
  ps.battleZone.push(card);
}

// ── Helper interno ────────────────────────────────────────────────────────────

function findPreEvoOnField(
  cardId: string,
  ps: PlayerState,
): { preEvoCard: CardInstance; zone: "mainZone" | "battleZone" } | null {
  const preEvoOnMain = ps.mainZone.find((c) => cardId === c.instanceId);
  const preEvoOnBattle = ps.battleZone.find((c) => cardId === c.instanceId);

  if (preEvoOnMain) {
    return { preEvoCard: preEvoOnMain, zone: "mainZone" };
  }

  if (preEvoOnBattle) {
    return { preEvoCard: preEvoOnBattle, zone: "battleZone" };
  }

  return null;
}
