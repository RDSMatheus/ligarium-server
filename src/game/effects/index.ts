import { getTemplateOrThrow } from "../data/cardDatabase";
import { GameState, StackEntry } from "../gameTypes";
import { getOpponentState, getPlayerState } from "../turnManager";

type EffectHandler = (state: GameState, entry: StackEntry) => void;

export const EFFECT_HANDLERS: Record<string, EffectHandler> = {
  // ── Liwigon [Attacking] ──────────────────────────────────────
  // params: { targetInstanceId }
  lock_opponent_farm_card: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const card = opp.farm.find(
      (c) => c.instanceId === entry.params?.targetInstanceId,
    );
    if (card) card.lockedUntilEndOfTurn = true;
  },

  deal_damage_to_all_opponents_battle: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const damage = entry.params?.value;

    if (!damage) return;

    opp.battleZone.forEach((monster) => {
      monster.currentHp -= damage;
    });
  },

  // ── Peacock [Played] ─────────────────────────────────────────
  // params: { value }
  deal_damage_to_all_battle_zone: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const damage = entry.params?.value ?? 10;

    opp.battleZone.forEach((monster) => {
      monster.currentHp -= damage;
    });
  },

  // ── Yamigni [Attacked] ───────────────────────────────────────
  // params: { targetInstanceId }
  destroy_exhausted_opponent_farm_card: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const idx = opp.farm.findIndex(
      (c) => c.instanceId === entry.params?.targetInstanceId && c.exhausted,
    );
    if (idx !== -1) {
      const [dead] = opp.farm.splice(idx, 1);
      const { sendCardToTrash } = require("../turnManager");
      sendCardToTrash(opp, dead);
    }
  },

  // ── Ninpola [Played] ───────────────────────────────────────
  // params: { targetInstanceId }
  exhaust_opponent_farm_card: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const targetId = entry.params?.targetInstanceId;
    if (!targetId) return;

    const card = opp.farm.find((c) => c.instanceId === targetId);
    if (!card) return;

    card.exhausted = true;
  },

  // ── Ninpola [Attacking] ────────────────────────────────────
  // params: { targetInstanceId }
  return_exhausted_opponent_farm_to_hand: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const targetId = entry.params?.targetInstanceId;
    if (!targetId) return;

    const idx = opp.farm.findIndex(
      (c) => c.instanceId === targetId && c.exhausted,
    );
    if (idx === -1) return;

    const [card] = opp.farm.splice(idx, 1);
    opp.hand.push(card);
  },

  // ── Shinonion [Attacked] ───────────────────────────────────
  // params: { targetInstanceId } — attacker instance
  lock_attacker_until_refresh: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const targetId = entry.params?.targetInstanceId;
    if (!targetId) return;

    const target = [...opp.battleZone, ...opp.mainZone].find(
      (c) => c.instanceId === targetId,
    );
    if (!target) return;

    // Marca para impedir que vire Active no próximo Refresh do dono
    target.lockedUntilEndOfTurn = true;
  },

  // ── Thundipole [Battling] ────────────────────────────────────
  // sem params
  reduce_damage_per_active_farm: (state, entry) => {
    if (!state.battle) return;
    const ps = getPlayerState(state, entry.ownerId);
    const active = ps.farm.filter(
      (c) => !c.exhausted && !c.lockedUntilEndOfTurn,
    ).length;
    if (active === 0) return;

    state.battle.damageModifiers.push({
      targetInstanceId: entry.sourceInstanceId,
      value: -(active * 10), // negativo = reduz dano recebido
    });
  },

  // ── Snowdrift Stand [Fast][Played] ───────────────────────
  // params: { targetInstanceId } — monstro Ice aliado exausto
  unexhaust_allied_ice_monster: (state, entry) => {
    const ps = getPlayerState(state, entry.ownerId);
    const targetId = entry.params?.targetInstanceId;
    if (!targetId) return;

    const alliedZones = [...ps.battleZone, ...ps.mainZone];
    const target = alliedZones.find((c) => c.instanceId === targetId);
    if (!target) return;

    const template = getTemplateOrThrow(target.templateId);
    // Valida que é um monstro Ice aliado e está exausto
    if (template.subtype !== "Ice") return;
    if (!target.exhausted) return;

    target.exhausted = false;
  },

  // ── Shadow Sneak [Played] ────────────────────────────────
  // params: { targetInstanceId } — monstro Active do oponente
  deal_damage_to_target_active_monster: (state, entry) => {
    const opp = getOpponentState(state, entry.ownerId);
    const targetId = entry.params?.targetInstanceId;
    const damage = entry.params?.value ?? 40;
    if (!targetId) return;

    const target = [...opp.battleZone, ...opp.mainZone].find(
      (c) => c.instanceId === targetId,
    );
    if (!target) return;
    // Só acerta monstros Active (não exaustos)
    if (target.exhausted) return;

    target.currentHp -= damage;
  },
};

export function executeEffect(state: GameState, entry: StackEntry): void {
  const playersState = state.playerStates;

  playersState.forEach((ps) => {
    const cards = [
      ...ps.hand,
      ...ps.farm,
      ...ps.terrainsZone,
      ...ps.battleZone,
      ...ps.mainZone,
    ];
    const card = cards.find((c) => c.instanceId === entry.sourceInstanceId);

    if (!card) return;

    const template = getTemplateOrThrow(card.templateId);
    const effect = template.effects?.find((e) => e.trigger === entry.trigger);
    if (!effect) return;

    const handler = EFFECT_HANDLERS[effect.action];
    if (handler) handler(state, entry);
    return;
  });
}
