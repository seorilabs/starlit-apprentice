export const STAT_KEYS = [
  "intellect",
  "sensibility",
  "etiquette",
  "craft",
  "stamina",
  "reputation",
  "focus",
  "charm",
  "courage",
  "empathy",
  "business",
  "magic",
  "leadership",
  "creativity"
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export type Stats = Record<StatKey, number>;

export type ActionCategory = "lesson" | "work" | "rest" | "outing";

export type ActionId =
  | "letters"
  | "music"
  | "manners"
  | "crafts"
  | "star-lore"
  | "stamina-drill"
  | "library-help"
  | "tea-service"
  | "workshop-errand"
  | "garden-care"
  | "theater-crew"
  | "scribe-aide"
  | "home-rest"
  | "sleep-in"
  | "hot-spring"
  | "market"
  | "plaza"
  | "library"
  | "park";

export type EndingCode = string;

export interface ScheduleAction {
  id: ActionId;
  category: ActionCategory;
  label: string;
  shortLabel: string;
  place: string;
  description: string;
  statEffects: Partial<Stats>;
  goldDelta: number;
  energyDelta: number;
  stressDelta: number;
  flag: string;
}

export interface ScheduleResourceForecast {
  gold: number;
  energy: number;
  stress: number;
}

export interface SchedulePlanStatus {
  forecast: ScheduleResourceForecast;
  blockers: string[];
  isValid: boolean;
}

export interface EndingDefinition {
  code: EndingCode;
  title: string;
  summary: string;
  shareText: string;
  hint: string;
  priority?: number;
  requirements?: EndingRequirementDefinition[];
}

export type EndingRequirementDefinition =
  | {
      type: "stat";
      stat: StatKey;
      target: number;
      label?: string;
      direction?: "at-least";
    }
  | {
      type: "resource";
      resource: "gold" | "energy" | "stress";
      target: number;
      label?: string;
      direction?: "at-least" | "at-most";
    }
  | {
      type: "flag";
      flag: string;
      target: number;
      label: string;
      direction?: "at-least";
    }
  | {
      type: "flag-sum";
      flags: string[];
      target: number;
      label: string;
      direction?: "at-least";
    }
  | {
      type: "average";
      stats: StatKey[];
      target: number;
      label: string;
      direction?: "at-least";
    };

export interface EndingRequirementProgress {
  label: string;
  current: number;
  target: number;
  direction: "at-least" | "at-most";
  satisfied: boolean;
  progress: number;
}

export interface EndingProgress {
  ending: EndingDefinition;
  requirements: EndingRequirementProgress[];
  progress: number;
  completed: boolean;
}

export interface EndingActionRecommendation {
  action: ScheduleAction;
  reasons: string[];
  score: number;
}

export type MonthlyCoachingTone = "critical" | "warning" | "positive";

export interface MonthlyCoachingInsight {
  id: string;
  title: string;
  body: string;
  tone: MonthlyCoachingTone;
  actionCategory?: ActionCategory;
  actionIds?: ActionId[];
}

export type ApprenticeExpression = "calm" | "bright" | "focused" | "proud" | "tired" | "worried";
export type ApprenticePose = "standing" | "reading" | "working" | "relaxed" | "waving" | "confident";

export interface ApprenticeProfile {
  heightCm: number;
  growthStage: "seedling" | "growing" | "tall";
  expression: ApprenticeExpression;
  pose: ApprenticePose;
  expressionLabel: string;
  poseLabel: string;
}

export interface GameEvent {
  id: string;
  title: string;
  body: string;
  effects: {
    stats?: Partial<Stats>;
    goldDelta?: number;
    energyDelta?: number;
    stressDelta?: number;
    flags?: Record<string, number>;
  };
}

export type DailyOutcomeKind = "failure" | "normal" | "critical";

export interface DailyOutcome {
  day: number;
  kind: DailyOutcomeKind;
  label: string;
  statChanges: Partial<Stats>;
  goldDelta: number;
  energyDelta: number;
  stressDelta: number;
  note: string;
}

export interface HistoryEntry {
  month: number;
  slot: number;
  actionId: ActionId;
  actionLabel: string;
  category: ActionCategory;
  dailyOutcomes?: DailyOutcome[];
  statChanges: Partial<Stats>;
  goldDelta: number;
  energyDelta: number;
  stressDelta: number;
  note: string;
  event?: GameEvent;
}

export interface RunState {
  version: 1;
  month: number;
  slotIndex: number;
  gold: number;
  stats: Stats;
  stress: number;
  energy: number;
  flags: Record<string, number>;
  history: HistoryEntry[];
  unlockedEndings: EndingCode[];
  rngSeed: number;
  currentSchedule: ActionId[];
  targetEndingCode?: EndingCode;
  endingCode?: EndingCode;
}

export interface ResolutionResult {
  run: RunState;
  action: ScheduleAction;
  dailyOutcomes: DailyOutcome[];
  statChanges: Partial<Stats>;
  goldDelta: number;
  energyDelta: number;
  stressDelta: number;
  note: string;
  event?: GameEvent;
  monthComplete: boolean;
}
