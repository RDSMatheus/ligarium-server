export type ID = string;

export type RoomState = "waiting" | "in_game" | "finished";

export type CardType = "monster" | "spell" | "terrain" | "egg";

export type TurnPhase = "refresh" | "draw" | "farm" | "main" | "battle" | "end";

// ══════════════════════════════════════════════════════════
//  SISTEMA DE EFEITOS — Classificação
// ══════════════════════════════════════════════════════════

/**
 * Velocidade do efeito:
 * - trigger → ativa automaticamente quando o evento ocorre
 * - fast    → o jogador ativa manualmente em janelas válidas
 */
export type EffectSpeed = "trigger" | "fast";

/**
 * Subtipo de efeitos fast:
 * - free     → pode ser usado em janelas abertas, sem gatilho específico
 * - response → reação direta a uma ação/efeito do oponente
 * - timed    → só pode ser usado em situações específicas
 */
export type FastType = "free" | "response" | "timed";

/**
 * Janelas de timing para efeitos fast do tipo "timed".
 * Define em qual momento do jogo o efeito pode ser ativado.
 */
export type FastTimingWindow =
  | "on_monster_played" // quando um monstro é jogado
  | "on_monster_destroyed" // quando um monstro é destruído
  | "on_monster_returned" // quando um monstro é devolvido para a mão
  | "on_card_activated" // quando uma carta/efeito é ativado
  | "on_attack_declared" // quando um ataque é declarado
  | "on_block_declared"; // quando um bloqueio é declarado

/**
 * Representa a janela de efeito atualmente aberta no jogo.
 * Determina quais efeitos fast podem ser ativados.
 */
export interface EffectWindow {
  type: FastTimingWindow | "open"; // "open" = janela livre (free)
  triggerPlayerId: string; // quem causou o evento
  sourceInstanceId?: string; // qual carta causou
  context?: Record<string, any>; // dados extras do contexto
}

export interface PlayerConnection {
  socketId: string;
  playerId: ID;
  name: string;
  joinedAt: number;
  isReady: boolean;
}

/**
 * Estado mínimo do jogo — criado quando a partida inicia.
 *
 * 🔮 DIA 2: Expandir com:
 *   - deck: CardInstance[]           (50 cartas embaralhadas)
 *   - hand: CardInstance[]           (mão inicial de 5 cartas)
 *   - terrains: TerrainInstance[]    (4 terrenos por jogador)
 *   - farm: MonsterInstance[]
 *   - mainZone: MonsterInstance[]
 *   - battleZone: MonsterInstance[]
 *   - graveyard: CardInstance[]
 *   - currentPhase: TurnPhase
 */

export interface PlayerState {
  playerId: ID;
  hand: CardInstance[];
  deck: CardInstance[];
  terrainsDeck: CardInstance[];
  terrainsZone: CardInstance[];
  farm: CardInstance[];
  mainZone: CardInstance[];
  battleZone: CardInstance[];
  trash: CardInstance[];
  hasRevealedFirstTerrain: boolean;
}

export interface CardTemplate {
  id: string;
  name: string;
  type: CardType;
  description: string;

  subtype?: string;

  hp?: number;
  ap?: number;
  playCost?: number;

  evolvesFrom?: string;

  fast?: boolean;
  effects?: CardEffect[];
}

export interface StackEntry {
  id: string;
  sourceInstanceId: string; // qual carta gerou
  ownerId: string; // qual jogador ativou
  trigger: string; // "attacking", "played", etc.
  effectSpeed: EffectSpeed; // "trigger" ou "fast"
  interaction?: boolean; // se true, permite resposta ANTES da resolução
  params?: Record<string, any>; // dados extras (ex: targetId)
  resolved: boolean;
}

export interface ChainState {
  priority: string; // playerId de quem age agora
  lastPassedBy: string | null;
  stack: StackEntry[];
  currentWindow: EffectWindow | null; // janela aberta para fast effects
  awaitingInteraction: boolean; // aguardando resposta de interação
}

export interface BattleState {
  step: "declare" | "response" | "damage" | "cleanup";
  attackerPlayerId: string;
  attackerInstanceId: string;
  targetInstanceId: string | null; // null = ataque direto
  blockerInstanceId: string | null;
  damageModifiers: { targetInstanceId: string; value: number }[];
}

type EffectTrigger =
  // ── Batalha ──────────────────────────────
  | "attacking" // quando este monstro declara ataque
  | "attacked" // quando este monstro é atacado
  | "blocking" // quando este monstro bloqueia
  | "blocked" // quando este monstro é bloqueado
  | "battling" // quando este monstro entra em combate
  | "after_attacking" // após o combate, se este monstro atacou
  | "after_attacked" // após o combate, se este monstro foi atacado
  // ── Movimento / Estado ───────────────────
  | "when_exhausted" // quando este monstro exausta
  | "when_moved" // quando este monstro se move de zona
  | "when_played" // quando esta carta é jogada da mão
  | "when_destroyed" // quando esta carta é destruída
  | "when_returned" // quando esta carta volta para a mão
  // ── Keywords ─────────────────────────────
  | "rampage" // dano excedente vai para o jogador
  | "parry" // cancela o primeiro dano recebido
  | "barricade" // protege monstros atrás dele
  | "armor" // reduz dano recebido por valor fixo
  | "strike" // causa dano antes do oponente
  | "counter" // causa dano após o oponente
  | "push" // empurra monstro derrotado para a mão
  | "taunt" // força o oponente a atacar este monstro
  // ── Passivo ──────────────────────────────
  | "passive" // efeito contínuo, não vai para a stack
  | "continuous" // igual a passive
  | "farm"; // efeito ativo enquanto no farm

type EffectTarget =
  | "self" // a própria carta
  | "opponent_monster" // monstro do oponente (requer seleção)
  | "opponent_farm_card" // carta do farm do oponente (requer seleção)
  | "opponent_farm_exhausted" // carta exausta do farm do oponente (requer seleção)
  | "any_monster" // qualquer monstro em jogo (requer seleção)
  | "all_opponent_monsters" // todos os monstros do oponente (sem seleção)
  | "all_friendly_monsters" // todos os próprios monstros (sem seleção)
  | "none"; // sem alvo (efeito não precisa de alvo)

type EffectCondition =
  | "while_exhausted" // só ativo enquanto exausto
  | "while_active" // só ativo enquanto não exausto
  | "if_farm_has_active" // se o farm tiver cartas ativas
  | "if_opponent_farm_empty" // se o farm do oponente estiver vazio
  | "always" // sem condição
  | null;

interface CardEffect {
  trigger: EffectTrigger;

  // a função que executa — chave para o EFFECT_HANDLERS
  action: string;

  // ── Classificação do efeito ─────────────
  speed: EffectSpeed; // "trigger" ou "fast"
  fastType?: FastType; // para fast: "free", "response" ou "timed"
  fastTiming?: FastTimingWindow[]; // para timed: em quais janelas funciona
  interaction?: boolean; // pode responder ANTES da resolução

  // o jogador precisa escolher ativar?
  optional: boolean;

  // precisa escolher um alvo?
  requiresTarget: boolean;
  targetType: EffectTarget;

  // condição para o efeito estar ativo
  condition: EffectCondition;

  // parâmetros fixos do efeito (valor de dano, quantidade, etc)
  value?: number;
}

export interface CardInstance {
  instanceId: string;
  templateId: string;
  currentHp: number;
  exhausted: boolean;
  canAttack: boolean;
  revealed?: boolean;
  apModifier?: ApModifier[];
  hpModifier?: HpModifier[];
  lockedUntilEndOfTurn: boolean;
  attached?: CardInstance[];
  attachedTo?: string | null;
}

interface ApModifier {
  id: string;
  value: number;
  duration: "end_of_turn" | "permanent" | "until_leaves_field";
  sourceInstanceId: string;
}

interface HpModifier {
  id: string;
  value: number;
  duration: "end_of_turn" | "permanent" | "until_leaves_field";
  sourceInstanceId: string;
}

export interface PendingOptionalEffect {
  sourceInstanceId: string; // qual carta gerou o efeito
  ownerId: string; // qual jogador decide se ativa
  trigger: string; // "played", "attacked", "end_of_turn"...
  effectSpeed: EffectSpeed;
  action: string; // chave do EFFECT_HANDLERS
  requiresTarget: boolean; // precisa escolher alvo antes de ativar?
  params?: Record<string, any>; // dados extras (value, targetId...)
}

export interface GameState {
  id: ID;
  players: PlayerConnection[];
  playerStates: PlayerState[];
  currentPlayerId: ID | null;
  turnNumber: number;
  currentPhase: TurnPhase;
  winner: ID | null;
  chain: ChainState | null;
  battle: BattleState | null;
  pendingOptionalEffects: PendingOptionalEffect[] | null;
  effectWindow: EffectWindow | null; // janela de efeito aberta
}

export interface GameRoom {
  id: ID;
  roomName: string;
  state: RoomState;
  players: PlayerConnection[];
  gameState: GameState | null;
  createdAt: number;
}
