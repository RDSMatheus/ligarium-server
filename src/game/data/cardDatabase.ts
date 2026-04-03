// server/data/cardDatabase.ts
// ─────────────────────────────────────────────────────────
// Usado pelo BACK-END apenas.
// Contém os mesmos tipos/templates do front + lógica de
// deck factory, shuffle e helpers do engine de jogo.
// ─────────────────────────────────────────────────────────

import { generateId } from "../../utils/ids";
import type { CardInstance, EffectTarget } from "../gameTypes";

// ══════════════════════════════════════════════════════════
//  TIPOS (espelhados do front — mantenha em sync)
// ══════════════════════════════════════════════════════════

export type CardType = "monster" | "spell" | "terrain";

export type CardTribe =
  | "Demon"
  | "Dragon"
  | "Beast"
  | "Aquan"
  | "Bird"
  | "Insect"
  | "Fish"
  | "Fairy"
  | "Plant"
  | "Machine"
  | "Ice"
  | "None";

export type EffectTrigger =
  | "taunt_while_exhausted"
  | "attacked"
  | "attacking"
  | "battling"
  | "blocking"
  | "played"
  | "evolving"
  | "end_of_turn"
  | "main_phase"
  | "either_turn"
  | "when_destroyed"
  | "when_returned"
  | "farm"
  | "continuous"
  | "blocker";

export type EffectAction =
  | "taunt_while_exhausted"
  | "destroy_opponent_farm_exhausted"
  | "exhaust_opponent_farm_card"
  | "return_exhausted_opponent_farm_to_hand"
  | "copy_highest_ap"
  | "lock_opponent_farm_card"
  | "reduce_damage_per_active_farm"
  | "ally_gain_ap"
  | "play_from_hand_as_blocker"
  | "draw_on_healed"
  | "cease_attack"
  | "lock_attacker_until_refresh"
  | "exhaust_draw"
  | "draw_on_monster_played_from_farm"
  | "reduce_play_cost"
  | "allied_monsters_gain_hp"
  | "deal_damage_to_all_battle_zone"
  | "unexhaust_allied_ice_monster" // Snowdrift Stand
  | "deal_damage_to_target_active_monster"; // Shadow Sneak

// ── Classificação de efeitos ────────────────────────────────────

/**
 * Velocidade do efeito:
 * - trigger → ativa automaticamente quando o evento ocorre
 * - fast    → o jogador ativa manualmente em janelas válidas
 */
export type EffectSpeed = "trigger" | "fast";

/**
 * Subtipo de efeitos fast:
 * - free     → janelas abertas, sem gatilho específico
 * - response → reação direta a ação/efeito do oponente
 * - timed    → só em situações específicas
 */
export type FastType = "free" | "response" | "timed";

/**
 * Janelas de timing para efeitos fast do tipo "timed".
 */
export type FastTimingWindow =
  | "on_monster_played"
  | "on_monster_destroyed"
  | "on_monster_returned"
  | "on_card_activated"
  | "on_attack_declared"
  | "on_block_declared";

// ── Tipos de alvo para o front-end (onde procurar alvos) ───
// export type TargetZone =
//   | "opponent_farm"
//   | "own_farm"
//   | "opponent_battle"
//   | "own_battle"
//   | "opponent_hand"
//   | "own_hand"
//   | "opponent_trash"
//   | "own_trash"
//   | "any";

export type TargetCondition = "exhausted" | "active" | "any";

type EffectCondition =
  | "always" // sem condição
  | "while_exhausted" // só enquanto esta carta está exausta
  | "while_active" // só enquanto esta carta NÃO está exausta
  | "if_farm_has_active" // só se o farm tiver cartas não exaustas
  | "if_opponent_farm_empty" // só se o farm do oponente estiver vazio
  | null;

export interface CardEffect {
  trigger: EffectTrigger[];
  action: EffectAction;

  // ── Classificação do efeito ───────────────────
  speed: EffectSpeed; // "trigger" ou "fast"
  fastType?: FastType; // para fast: "free", "response" ou "timed"
  fastTiming?: FastTimingWindow[]; // para timed: em quais janelas funciona
  interaction?: boolean; // pode responder ANTES da resolução

  oncePerTurn?: boolean;
  value?: number;
  description: string;
  optional?: boolean;
  requiresTarget: boolean;
  condition?: EffectCondition;
  // Informações que o front-end usa para abrir a UI de seleção de alvo
  targetZones?: EffectTarget[]; // zonas onde procurar os alvos (ex.: opponent_farm)
  targetFilter?: TargetCondition; // filtra por exausto/ativo/qualquer
  maxTargets?: number; // máximo de alvos que o jogador pode escolher
}

export interface CardTemplate {
  id: string;
  name: string;
  type: CardType;
  subtype?: CardTribe;
  description: string;
  hp?: number;
  ap?: number;
  playCost?: number;
  evoCost?: number;
  image?: string;
  effects?: CardEffect[];
  evolvesFrom?: string;
  fast?: boolean;
}

// ══════════════════════════════════════════════════════════
//  TEMPLATES
// ══════════════════════════════════════════════════════════

const templates: CardTemplate[] = [
  // ── Terrenos base ────────────────────────────────────────
  {
    id: "terrain_forest",
    name: "Floresta Ancestral",
    type: "terrain",
    subtype: "None",
    description: "Uma floresta densa cheia de vida.",
  },
  {
    id: "terrain_volcano",
    name: "Vulcão Ardente",
    type: "terrain",
    subtype: "None",
    description: "Lava escorrendo pelas encostas.",
  },
  {
    id: "terrain_ocean",
    name: "Oceano Profundo",
    type: "terrain",
    subtype: "None",
    description: "Águas escuras e misteriosas.",
  },
  {
    id: "terrain_mountain",
    name: "Montanha Sagrada",
    type: "terrain",
    subtype: "None",
    description: "Picos gelados tocando as nuvens.",
  },

  // ── Terrenos especiais ───────────────────────────────────
  {
    id: "terrain_heavens_fountain",
    name: "Heaven's Fountain",
    type: "terrain",
    subtype: "None",
    description: "Allied monsters gain 10 HP.",
    effects: [
      {
        trigger: ["continuous"],
        action: "allied_monsters_gain_hp",
        speed: "trigger",
        requiresTarget: true,
        condition: "always",
        optional: false,
        value: 10,
        description: "[Continuous] Allied monsters gain 10 HP.",
      },
    ],
  },
  {
    id: "terrain_ironspine_plains",
    name: "Ironspine Plains",
    type: "terrain",
    subtype: "None",
    description:
      "When you play a monster from your Farm, you may Exhaust this card, then draw 1 card.",
    effects: [
      {
        trigger: ["main_phase"],
        action: "draw_on_monster_played_from_farm",
        speed: "trigger",
        requiresTarget: false,
        value: 1,
        optional: true,
        condition: "always",
        description:
          "[Main Phase] When you play a monster from your Farm, you may Exhaust this card, then draw 1 card.",
      },
    ],
  },

  // ── Monstros — Basic Pack ────────────────────────────────
  {
    id: "mon_kuropyro",
    name: "Kuropyro",
    type: "monster",
    subtype: "Demon",
    description: "Demônio imponente que força o oponente a atacá-lo.",
    hp: 30,
    ap: 40,
    playCost: 1,
    effects: [
      {
        trigger: ["taunt_while_exhausted"],
        action: "taunt_while_exhausted",
        speed: "trigger",
        requiresTarget: false,
        description:
          "[Taunt] (While Exhausted, this monster has priority as the target for your opponent's attacks.)",
      },
    ],
  },
  {
    id: "mon_yamigni",
    name: "Yamigni",
    type: "monster",
    subtype: "Demon",
    description: "Demônio imponente que força o oponente a atacá-lo.",
    hp: 50,
    ap: 70,
    playCost: 3,
    evoCost: 1,
    evolvesFrom: "mon_kuropyro",
    effects: [
      {
        trigger: ["taunt_while_exhausted"],
        action: "taunt_while_exhausted",
        speed: "trigger",
        requiresTarget: false,
        description:
          "[Taunt] (While Exhausted, this monster has priority as the target for your opponent's attacks.)",
      },
      {
        trigger: ["attacked"],
        action: "destroy_opponent_farm_exhausted",
        speed: "trigger",
        requiresTarget: true,
        description:
          "[Attacked] You may destroy 1 Exhausted card in your opponent's Farm.",
      },
    ],
  },
  {
    id: "mon_crossky",
    name: "Crossky",
    type: "monster",
    subtype: "Dragon",
    description: "Copia o poder do monstro inimigo mais forte.",
    hp: 40,
    ap: 10,
    playCost: 2,
    effects: [
      {
        trigger: ["played"],
        action: "copy_highest_ap",
        speed: "trigger",
        requiresTarget: false,
        description:
          "[Played] You may make this monster's AP become equal to the AP of 1 enemy monster with the highest AP.",
      },
    ],
  },
  {
    id: "mon_liwigon",
    name: "Liwigon",
    type: "monster",
    subtype: "Beast",
    description: "Tranca um terreno do oponente ao atacar.",
    hp: 40,
    ap: 50,
    playCost: 2,
    effects: [
      {
        trigger: ["attacking"],
        action: "lock_opponent_farm_card",
        speed: "trigger",
        requiresTarget: true,
        targetZones: ["opponent_farm"],
        targetFilter: "any",
        description:
          "[Attacking] You may make 1 card in your opponent's Farm unable to become Exhausted until the end of their turn.",
      },
    ],
  },
  {
    id: "mon_thundipole",
    name: "Thundipole",
    type: "monster",
    subtype: "Aquan",
    description: "Reduz o dano recebido baseado nos terrenos ativos.",
    hp: 40,
    ap: 30,
    playCost: 1,
    effects: [
      {
        trigger: ["battling"],
        action: "reduce_damage_per_active_farm",
        speed: "trigger",
        requiresTarget: false,
        value: 10,
        description:
          "[Battling] Reduce the damage this monster receives by this battle by 10 for each Active card in your Farm.",
      },
    ],
  },
  {
    id: "mon_winduck",
    name: "Winduck",
    type: "monster",
    subtype: "Bird",
    description: "Concede poder extra a um aliado quando entra em campo.",
    hp: 40,
    ap: 30,
    playCost: 1,
    effects: [
      {
        trigger: ["played"],
        action: "ally_gain_ap",
        requiresTarget: true,
        targetFilter: "any",
        condition: "always",
        optional: true,
        speed: "trigger",
        targetZones: ["own_battle", "own_main"],
        value: 20,
        description:
          "[Played] You may make 1 allied monster gain 20 AP during this turn.",
      },
    ],
  },
  {
    id: "mon_roachit",
    name: "Roachit",
    type: "monster",
    subtype: "Insect",
    description: "Pode ser jogado da mão como bloqueador ao custo normal.",
    hp: 30,
    ap: 30,
    playCost: 1,
    effects: [
      {
        trigger: ["blocker"],
        action: "play_from_hand_as_blocker",
        requiresTarget: false,
        speed: "fast",
        fastType: "timed",
        fastTiming: ["on_attack_declared"],
        description:
          "[Blocker] (When an enemy monster attacks, you may play this card from your hand into your Battle Zone by paying its cost, then it blocks that attack.)",
      },
    ],
  },
  {
    id: "mon_karpaura",
    name: "Karpaura",
    type: "monster",
    subtype: "Fish",
    description: "Compra uma carta sempre que for curado.",
    hp: 40,
    ap: 40,
    playCost: 1,
    effects: [
      {
        trigger: ["either_turn"],
        action: "draw_on_healed",
        speed: "trigger",
        requiresTarget: false,
        oncePerTurn: true,
        value: 1,
        description:
          "[Either turn] [Once per turn] When this monster is healed, you may draw 1 card.",
      },
    ],
  },
  {
    id: "mon_pearcock",
    name: "Pearcock",
    type: "monster",
    subtype: "Bird",
    hp: 30,
    description: "",
    ap: 40,
    playCost: 1,
    image:
      "https://drive.google.com/file/d/1BRUEDa_9B-CdMdMnRJcVmfRsInlPFjQ2/view?usp=sharing",
    effects: [
      {
        trigger: ["played"],
        action: "deal_damage_to_all_battle_zone",
        speed: "trigger",
        optional: true,
        targetFilter: "any",
        targetZones: ["opponent_battle"],
        requiresTarget: false,
        condition: "always",
        value: 10,
        description:
          "[Played] Causa 10 de danos à todos os monstros do oponente.",
      },
    ],
  },
  {
    id: "mon_feathance",
    name: "Feathance",
    type: "monster",
    subtype: "Bird",
    hp: 90,
    description: "",
    ap: 70,
    playCost: 4,
    evoCost: 1,
    evolvesFrom: "mon_pearcock",
    image:
      "https://drive.google.com/file/d/1BRUEDa_9B-CdMdMnRJcVmfRsInlPFjQ2/view?usp=sharing",
    effects: [
      {
        trigger: ["attacking"],
        action: "deal_damage_to_all_battle_zone",
        speed: "trigger",
        targetFilter: "any",
        targetZones: ["opponent_battle"],
        optional: true,
        requiresTarget: false,
        condition: "always",
        value: 10,
        description:
          "[Attacking] Causa 10 de danos à todos os monstros do oponente.",
      },
    ],
  },
  {
    id: "mon_cupetit",
    name: "Cupetit",
    type: "monster",
    subtype: "Fairy",
    description: "Pode cancelar um ataque recebido uma vez por turno.",
    hp: 30,
    ap: 20,
    playCost: 1,
    effects: [
      {
        trigger: ["attacked"],
        action: "cease_attack",
        speed: "fast",
        fastType: "response",
        requiresTarget: false,
        interaction: true,
        oncePerTurn: true,
        description: "[Attacked] [Once per turn] You may cease this attack.",
      },
    ],
  },
  {
    id: "mon_shinonion",
    name: "Shinonion",
    type: "monster",
    subtype: "Plant",
    description:
      "[Attacked] You may make the attacking monster unable to become Active until the end of your opponent's Refresh Phase.",
    hp: 30,
    ap: 30,
    playCost: 1,
    effects: [
      {
        trigger: ["attacked"],
        action: "lock_attacker_until_refresh",
        speed: "trigger",
        condition: "always",
        optional: true,
        description:
          "[Attacked] You may make the attacking monster unable to become Active until the end of your opponent's Refresh Phase.",
        requiresTarget: false,
        targetFilter: "any",
        targetZones: ["opponent_battle"],
        maxTargets: 1,
      },
    ],
  },
  {
    id: "mon_lilytle",
    name: "Lilytle",
    type: "monster",
    subtype: "Plant",
    description: "Exaure-se no fim do turno para comprar uma carta.",
    hp: 30,
    ap: 20,
    playCost: 1,
    effects: [
      {
        trigger: ["end_of_turn"],
        action: "exhaust_draw",
        speed: "trigger",
        requiresTarget: false,
        value: 1,
        description:
          "[End of your turn] You may Exhaust this monster, then draw 1 card.",
      },
    ],
  },
  {
    id: "mon_ninpola",
    name: "Ninpola",
    type: "monster",
    subtype: "Plant",
    description:
      "[Played] [Evolved] You may Exhaust 1 card in your opponent's Farm. [Attacking] You can return 1 Exhausted card in your opponent's Farm to their hand.",
    hp: 60,
    ap: 70,
    evolvesFrom: "mon_shinonion",
    playCost: 3,
    evoCost: 1,
    effects: [
      {
        trigger: ["evolving", "played"],
        action: "exhaust_opponent_farm_card",
        speed: "trigger",
        optional: true,
        description:
          "[Played] [Evolved] You may Exhaust 1 card in your opponent's Farm.",
        requiresTarget: true,
        targetZones: ["opponent_farm"],
        targetFilter: "active",
        maxTargets: 1,
      },
      {
        trigger: ["attacking"],
        action: "return_exhausted_opponent_farm_to_hand",
        speed: "trigger",
        optional: true,
        description:
          "[Attacking] You can return 1 Exhausted card in your opponent's Farm to their hand.",
        requiresTarget: true,
        targetZones: ["opponent_farm"],
        targetFilter: "exhausted",
        maxTargets: 1,
      },
    ],
  },
  {
    id: "mon_robille",
    name: "Robille",
    type: "monster",
    subtype: "Machine",
    description: "Terrenos reduzem o custo para jogar esta carta.",
    hp: 40,
    ap: 40,
    playCost: 2,
    effects: [
      {
        trigger: ["farm"],
        action: "reduce_play_cost",
        speed: "trigger",
        requiresTarget: false,
        value: 1,
        description: "[Farm] Reduce the cost to play this card by 1.",
      },
    ],
  },

  // ── Spells ───────────────────────────────────────────────
  {
    id: "spell_snowdrift_stand",
    name: "Snowdrift Stand",
    type: "spell",
    description:
      "[Fast] [Played] When an opponent's monster attacks, make 1 Exhausted allied Ice monster become Active.",
    playCost: 1,
    effects: [
      {
        trigger: ["played"],
        action: "unexhaust_allied_ice_monster",
        speed: "fast",
        fastType: "timed",
        fastTiming: ["on_attack_declared"],
        optional: false,
        requiresTarget: true,
        condition: "always",
        description:
          "[Fast] [Played] When an opponent's monster attacks, make 1 Exhausted allied Ice monster become Active.",
      },
    ],
  },
  {
    id: "spell_shadow_sneak",
    name: "Shadow Sneak",
    type: "spell",
    description: "[Played] Cause 40 damage to 1 Active enemy monster.",
    playCost: 1,
    effects: [
      {
        trigger: ["played"],
        action: "deal_damage_to_target_active_monster",
        speed: "trigger",
        optional: false,
        requiresTarget: true,
        condition: "always",
        value: 40,
        description: "[Played] Cause 40 damage to 1 Active enemy monster.",
      },
    ],
  },

  // ── Monstros legado ──────────────────────────────────────
  {
    id: "mon_wolf",
    name: "Lobo das Sombras",
    type: "monster",
    subtype: "Beast",
    description: "Predador ágil que caça em matilha.",
    hp: 3,
    ap: 2,
    playCost: 1,
  },
  {
    id: "mon_golem",
    name: "Golem de Pedra",
    type: "monster",
    subtype: "None",
    description: "Lento mas muito resistente.",
    hp: 6,
    ap: 2,
    playCost: 2,
  },
  {
    id: "mon_drake",
    name: "Drake Jovem",
    type: "monster",
    subtype: "Dragon",
    description: "Um dragão em treinamento.",
    hp: 4,
    ap: 4,
    playCost: 2,
  },
  {
    id: "mon_sprite",
    name: "Sprite da Floresta",
    type: "monster",
    subtype: "None",
    description: "Pequeno mas traiçoeiro.",
    hp: 2,
    ap: 1,
    playCost: 1,
  },
  {
    id: "mon_serpent",
    name: "Serpente de Lava",
    type: "monster",
    subtype: "None",
    description: "Ataque devastador vindo do magma.",
    hp: 5,
    ap: 5,
    playCost: 3,
  },
];

// ══════════════════════════════════════════════════════════
//  MAP — acesso O(1)
// ══════════════════════════════════════════════════════════

const TEMPLATE_MAP = new Map<string, CardTemplate>(
  templates.map((t) => [t.id, t]),
);

// ── Helpers de consulta ──────────────────────────────────

export function getTemplate(id: string): CardTemplate | undefined {
  return TEMPLATE_MAP.get(id);
}

export function getTemplateOrThrow(id: string): CardTemplate {
  const t = TEMPLATE_MAP.get(id);
  if (!t) throw new Error(`Template não encontrado: ${id}`);
  return t;
}

export function getAllTemplates(): CardTemplate[] {
  return templates;
}

export function getTemplatesByType(type: CardType): CardTemplate[] {
  return templates.filter((t) => t.type === type);
}

export function getTemplatesByTribe(subtype: CardTribe): CardTemplate[] {
  return templates.filter((t) => t.subtype === subtype);
}

// ══════════════════════════════════════════════════════════
//  DECK RECIPE
// ══════════════════════════════════════════════════════════

export interface DeckRecipe {
  cardId: string;
  quantity: number;
}

/** Basic Pack — 50 cartas balanceadas */
export const BASIC_PACK_DECK: DeckRecipe[] = [
  { cardId: "mon_pearcock", quantity: 8 },
  { cardId: "mon_shinonion", quantity: 7 },
  { cardId: "mon_ninpola", quantity: 6 },
  { cardId: "mon_feathance", quantity: 9 },
  { cardId: "mon_cupetit", quantity: 4 },
  { cardId: "mon_kuropyro", quantity: 6 },
  { cardId: "mon_yamigni", quantity: 6 },
  { cardId: "mon_liwigon", quantity: 4 },

  // Total: 8+7+6+6+4+4+4+4+4+3 = 50 ✅
];

export const DEFAULT_DECK_RECIPE = BASIC_PACK_DECK;

// ══════════════════════════════════════════════════════════
//  DECK FACTORY
// ══════════════════════════════════════════════════════════

/**
 * Constrói um deck de CardInstance[] a partir de uma receita.
 * Valida que o total é 50 e que nenhum terreno entra no deck.
 */
export function buildDeck(
  recipe: DeckRecipe[] = DEFAULT_DECK_RECIPE,
): CardInstance[] {
  const deck: CardInstance[] = [];

  for (const entry of recipe) {
    const template = getTemplateOrThrow(entry.cardId);

    if (template.type === "terrain") {
      throw new Error(`Terrenos não vão no deck: ${entry.cardId}`);
    }

    for (let i = 0; i < entry.quantity; i++) {
      deck.push({
        instanceId: generateId("card_"),
        templateId: template.id,
        currentHp: template.hp ?? 0,
        exhausted: false,
        canAttack: false,
        lockedUntilEndOfTurn: false,
      });
    }
  }

  if (deck.length !== 50) {
    throw new Error(`Deck deve ter 50 cartas, mas tem ${deck.length}.`);
  }

  return deck;
}

// ══════════════════════════════════════════════════════════
//  TERRAIN FACTORY
// ══════════════════════════════════════════════════════════

export const DEFAULT_TERRAIN_IDS = [
  "terrain_forest",
  "terrain_volcano",
  "terrain_ocean",
  "terrain_mountain",
] as const;

export const ALL_TERRAIN_IDS = [
  ...DEFAULT_TERRAIN_IDS,
  "terrain_heavens_fountain",
  "terrain_ironspine_plains",
] as const;

/**
 * Constrói os terrenos iniciais de um jogador.
 * Por padrão usa os 4 terrenos base.
 */
export function buildTerrains(
  ids: readonly string[] = DEFAULT_TERRAIN_IDS,
): CardInstance[] {
  return ids.map((id) => ({
    instanceId: generateId("terrain_"),
    templateId: id,
    currentHp: 0,
    exhausted: false,
    canAttack: false,
    revealed: false,
    lockedUntilEndOfTurn: false,
  }));
}

// ══════════════════════════════════════════════════════════
//  UTILITÁRIOS
// ══════════════════════════════════════════════════════════

/** Fisher-Yates in-place */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
