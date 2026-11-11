export type SessionKind = "work" | "entertainment";
export type BodyStatus = "workout" | "light_activity" | "no_activity";
export type ProjectStatus = "planning" | "active" | "completed";
export type ProjectRecurringFrequency = "daily" | "weekly" | "custom";
export type WishStatus = "active" | "fulfilled";

export type SessionItem = {
  id: number;
  kind: SessionKind;
  recordDate: string;
  startedAt: number;
  endedAt: number | null;
  note: string | null;
  source: "timer" | "manual";
  isManuallyEdited: boolean;
  durationSeconds: number;
};

export type TimelineItem = {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  display: string;
  progress: number | null;
};

export type DashboardData = {
  lifeDate: string;
  now: number;
  settings: {
    dailyWorkTargetMinutes: number;
    weeklyWorkoutTarget: number;
    lastBackupAt: number | null;
  };
  daily: {
    sleepMinutes: number | null;
    workTargetMinutes: number;
    weeklyWorkoutTarget: number;
    dailyStateCode: string | null;
    dailyStateCustom: string | null;
    daySummary: string | null;
    closedAt: number | null;
    workSeconds: number;
    entertainmentSeconds: number;
    bodyStatus: BodyStatus | null;
    bodyNote: string | null;
    weeklyWorkoutCount: number;
  };
  activeSession: SessionItem | null;
  workSessions: SessionItem[];
  entertainmentSessions: SessionItem[];
  projects: Array<{
    id: number;
    name: string;
    status: ProjectStatus;
    completedAt: number | null;
  }>;
  wishes: Array<{
    id: number;
    title: string;
    status: WishStatus;
    fulfilledAt: number | null;
  }>;
  timelines: TimelineItem[];
};

export type ProjectStageTask = {
  id: number;
  title: string;
  position: number;
  completedAt: number | null;
};

export type ProjectStageRecurringTask = {
  id: number;
  title: string;
  frequency: ProjectRecurringFrequency;
  frequencyLabel: string | null;
  position: number;
  completedToday: boolean;
};

export type ProjectStage = {
  id: number;
  projectId: number;
  title: string;
  position: number;
  completedAt: number | null;
  tasks: ProjectStageTask[];
  recurringTasks: ProjectStageRecurringTask[];
};

export type ProjectWorkspaceItem = {
  id: number;
  name: string;
  goal: string;
  completionCriteria: string;
  status: ProjectStatus;
  currentStageId: number | null;
  completedAt: number | null;
  archivedAt: number | null;
  stages: ProjectStage[];
  conversations: ProjectAiConversation[];
  pendingWeeklyCheck: boolean;
  pendingAiChange: ProjectAiChangeSummary | null;
  canUndoAiChange: boolean;
};

export type ProjectAiChangeSummary = {
  id: number;
  changeKind: "ordinary" | "major";
  title: string;
  reason: string | null;
  operations: unknown[];
  createdAt: number;
};

export type ProjectAiMessage = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  messageType: "chat" | "weekly_report";
  content: string;
  createdAt: number;
};

export type ProjectAiConversation = {
  id: number;
  projectId: number;
  title: string;
  summary: string | null;
  createdAt: number;
  updatedAt: number;
  messages: ProjectAiMessage[];
};

export type AiProviderSettings = {
  provider: "none" | "openai" | "openai-compatible";
  model: string;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
};

export type ProjectWorkspaceData = {
  projects: ProjectWorkspaceItem[];
  archivedProjects: ProjectWorkspaceItem[];
  lifeDate: string;
  aiSettings: AiProviderSettings;
};

export type HistoryDay = {
  recordDate: string;
  sleepMinutes: number | null;
  workSeconds: number;
  entertainmentSeconds: number;
  bodyStatus: BodyStatus | null;
  dailyStateCode: string | null;
  dailyStateCustom: string | null;
  daySummary: string | null;
  closedAt: number | null;
};
