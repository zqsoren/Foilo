"use client";

import {
  Archive,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Ellipsis,
  History,
  MessageSquarePlus,
  Pencil,
  Plus,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveProjectAction,
  completeCurrentProjectStageAction,
  confirmProjectAiChangeSetAction,
  createProjectConversationAction,
  createProjectAction,
  createProjectStageAction,
  createProjectStageRecurringTaskAction,
  createProjectStageTaskAction,
  deleteProjectStageRecurringTaskAction,
  deleteProjectStageTaskAction,
  getProjectConversationMessagesAction,
  rejectProjectAiChangeSetAction,
  sendProjectAiMessageAction,
  setCurrentProjectStageAction,
  toggleProjectRecurringCheckinAction,
  toggleProjectStageTaskAction,
  updateProjectAction,
  updateProjectStatusAction,
  updateProjectStageAction,
  updateProjectTaskTitleAction,
  undoLatestProjectAiChangeAction,
} from "@/app/actions";
import { Modal } from "@/components/ui/modal";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";
import type {
  ProjectRecurringFrequency,
  ProjectAiMessage,
  ProjectStage,
  ProjectWorkspaceData,
  ProjectWorkspaceItem,
} from "@/lib/types";

type DialogState =
  | { kind: "none" }
  | { kind: "new-project" }
  | { kind: "edit-project" }
  | { kind: "new-stage" }
  | { kind: "edit-stage" }
  | { kind: "new-task" }
  | { kind: "new-recurring" }
  | { kind: "archive" };

function stageProgress(stage: ProjectStage | undefined): number {
  if (!stage) return 0;
  if (stage.completedAt) return 100;
  if (stage.tasks.length === 0) return 0;
  return Math.round(
    (stage.tasks.filter((task) => task.completedAt !== null).length / stage.tasks.length) * 100,
  );
}

function projectProgress(project: ProjectWorkspaceItem): number {
  if (project.stages.length === 0) return 0;
  const total = project.stages.reduce((sum, stage) => sum + stageProgress(stage), 0);
  return Math.round(total / project.stages.length);
}

function stageStateLabel(
  stage: ProjectStage,
  currentStageId: number | null,
): "已完成" | "当前阶段" | "尚未开始" {
  if (stage.id === currentStageId) return "当前阶段";
  if (stage.completedAt) return "已完成";
  return "尚未开始";
}

function ProjectFormModal({
  open,
  project,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  project?: ProjectWorkspaceItem;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; goal: string; completionCriteria: string }) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [goal, setGoal] = useState(project?.goal ?? "");
  const [completionCriteria, setCompletionCriteria] = useState(project?.completionCriteria ?? "");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "编辑项目" : "新建项目"}
      description={project ? "修改项目名称、目标和完成标准。" : "只需要一个名称。项目目标、阶段和任务都可以稍后填写。"}
      size="medium"
    >
      <div className="form-stack">
        <label className="field-label">
          <span>项目名称</span>
          <input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {project ? <>
          <label className="field-label">
            <span>项目目标</span>
            <textarea maxLength={500} value={goal} onChange={(event) => setGoal(event.target.value)} />
          </label>
          <label className="field-label">
            <span>完成标准</span>
            <textarea
              maxLength={500}
              value={completionCriteria}
              onChange={(event) => setCompletionCriteria(event.target.value)}
            />
          </label>
        </> : null}
      </div>
      <InlineFeedback error={error} />
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button
          className="primary-button"
          disabled={!name.trim() || pending}
          onClick={() => onSubmit({ name, goal: project ? goal : "", completionCriteria: project ? completionCriteria : "" })}
        >
          {project ? "保存" : "创建项目"}
        </button>
      </div>
    </Modal>
  );
}

function TextEntryModal({
  open,
  title,
  label,
  initialValue = "",
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <Modal open={open} onClose={onClose} title={title} size="small">
      <label className="field-label">
        <span>{label}</span>
        <input autoFocus maxLength={120} value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <InlineFeedback error={error} />
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button
          className="primary-button"
          disabled={!value.trim() || pending}
          onClick={() => onSubmit(value)}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}

function RecurringTaskModal({
  open,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    frequency: ProjectRecurringFrequency;
    frequencyLabel: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<ProjectRecurringFrequency>("daily");
  const [frequencyLabel, setFrequencyLabel] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="添加阶段周期任务"
      description="它只属于当前阶段，阶段结束后自动停止。"
      size="small"
    >
      <div className="form-stack">
        <label className="field-label">
          <span>任务名称</span>
          <input autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field-label">
          <span>重复周期</span>
          <select value={frequency} onChange={(event) => setFrequency(event.target.value as ProjectRecurringFrequency)}>
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
            <option value="custom">自定义</option>
          </select>
        </label>
        {frequency === "custom" ? (
          <label className="field-label">
            <span>周期说明</span>
            <input maxLength={30} placeholder="例如：每两天" value={frequencyLabel} onChange={(event) => setFrequencyLabel(event.target.value)} />
          </label>
        ) : null}
      </div>
      <InlineFeedback error={error} />
      <div className="modal-actions">
        <button className="secondary-button" onClick={onClose}>取消</button>
        <button
          className="primary-button"
          disabled={!title.trim() || (frequency === "custom" && !frequencyLabel.trim()) || pending}
          onClick={() => onSubmit({ title, frequency, frequencyLabel: frequencyLabel || null })}
        >
          添加
        </button>
      </div>
    </Modal>
  );
}

function ProjectProgress({ project, currentStage }: { project: ProjectWorkspaceItem; currentStage?: ProjectStage }) {
  const overall = projectProgress(project);
  const current = stageProgress(currentStage);
  const completedStages = project.stages.filter((stage) => stage.completedAt !== null).length;
  return (
    <section className="project-progress-strip" aria-label="项目进度">
      <h2>项目进度</h2>
      <div className="project-progress-metric">
        <div><span>整个项目</span><strong>{overall}%</strong></div>
        <div className="project-linear-progress"><i style={{ width: `${overall}%` }} /></div>
      </div>
      <div className="project-progress-metric">
        <div>
          <span>当前阶段{currentStage ? ` · ${currentStage.title}` : ""}</span>
          <strong>{current}%</strong>
        </div>
        <div className="project-linear-progress"><i style={{ width: `${current}%` }} /></div>
      </div>
      <p>已完成阶段 {completedStages} / {project.stages.length}</p>
    </section>
  );
}

function ProjectAiPanel({ project, configured, model }: { project: ProjectWorkspaceItem; configured: boolean; model: string }) {
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState(project.conversations[0]?.id ?? null);
  const [messages, setMessages] = useState<ProjectAiMessage[]>(project.conversations[0]?.messages ?? []);
  const [historyOpen, setHistoryOpen] = useState(false);
  const mutation = useMutation();
  const router = useRouter();

  const selectConversation = async (id: number) => {
    setConversationId(id);
    setHistoryOpen(false);
    const cached = project.conversations.find((item) => item.id === id)?.messages ?? [];
    if (cached.length) {
      setMessages(cached);
      return;
    }
    const result = await getProjectConversationMessagesAction(project.id, id);
    if (result.ok) setMessages(result.messages);
  };

  const createConversation = async () => {
    const result = await mutation.run(() => createProjectConversationAction(project.id), "已新建一段对话");
    if (!result.ok) return;
    setConversationId(result.conversationId);
    setMessages([]);
    router.refresh();
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!configured || !conversationId || !content || mutation.pending) return;
    const result = await mutation.run(
      () => sendProjectAiMessageAction({ projectId: project.id, conversationId, content }),
    );
    if (!result.ok) return;
    setMessages((current) => [...current, ...result.messages]);
    setDraft("");
    router.refresh();
  };

  const ordinaryChanges = useMemo(() => {
    if (project.pendingAiChange?.changeKind !== "ordinary") return [];
    return project.pendingAiChange.operations.flatMap((raw) => {
      if (!raw || typeof raw !== "object" || !("type" in raw)) return [];
      const operation = raw as Record<string, unknown>;
      if (operation.type === "update_project_definition") {
        const rows: Array<{ label: string; before: string; after: string }> = [];
        if (typeof operation.goal === "string") rows.push({ label: "项目目标", before: project.goal || "未填写", after: operation.goal || "未填写" });
        if (typeof operation.completionCriteria === "string") rows.push({ label: "完成标准", before: project.completionCriteria || "未填写", after: operation.completionCriteria || "未填写" });
        return rows;
      }
      if (operation.type === "update_stage" && typeof operation.stageId === "number") {
        const stage = project.stages.find((item) => item.id === operation.stageId);
        return [{ label: "阶段名称", before: stage?.title ?? "未知阶段", after: String(operation.title ?? "") }];
      }
      if (operation.type === "create_task") return [{ label: "新增任务", before: "未添加", after: String(operation.title ?? "") }];
      if (operation.type === "delete_task") return [{ label: "删除任务", before: "现有任务", after: "删除" }];
      if (operation.type === "set_current_stage" && typeof operation.stageId === "number") {
        const before = project.stages.find((item) => item.id === project.currentStageId)?.title ?? "未设置";
        const after = project.stages.find((item) => item.id === operation.stageId)?.title ?? "未知阶段";
        return [{ label: "当前阶段", before, after }];
      }
      return [];
    });
  }, [project]);

  return (
    <aside className="project-ai-panel" aria-label="项目 AI 对话">
      <header className="project-ai-header">
        <span className="project-ai-mark"><Bot size={18} /></span>
        <div>
          <h2>项目 AI</h2>
          <span className={configured ? "project-ai-status connected" : "project-ai-status"}><i />{configured ? "已启用" : "尚未配置"}</span>
        </div>
        <div className="project-ai-header-actions">
          <div className="project-conversation-history">
            <button className="icon-button" aria-label="对话历史" title="对话历史" onClick={() => setHistoryOpen((open) => !open)}><History size={16} /></button>
            {historyOpen ? <div className="project-conversation-menu">
              {project.conversations.map((conversation) => (
                <button className={conversation.id === conversationId ? "active" : ""} key={conversation.id} onClick={() => void selectConversation(conversation.id)}>
                  <span>{conversation.title}</span><small>{new Date(conversation.createdAt).toLocaleDateString("zh-CN")}</small>
                </button>
              ))}
            </div> : null}
          </div>
          <button className="icon-button" aria-label="新建对话" title="新建对话" disabled={mutation.pending} onClick={() => void createConversation()}><MessageSquarePlus size={17} /></button>
          {project.canUndoAiChange ? <button className="icon-button" aria-label="撤销最近一次 AI 修改" title="撤销最近一次 AI 修改" disabled={mutation.pending} onClick={() => {
            if (window.confirm("撤销最近一次已经确认的 AI 修改？")) {
              void mutation.run(() => undoLatestProjectAiChangeAction(project.id), "最近一次 AI 修改已撤销").then(() => router.refresh());
            }
          }}><Undo2 size={16} /></button> : null}
        </div>
      </header>

      <div className="project-ai-conversation">
        {project.pendingWeeklyCheck ? <div className="project-weekly-check-note"><CalendarClock size={14} /><span>{configured ? "正在补做本周项目检查" : "本周项目检查将在 AI 接口启用后补做"}</span></div> : null}
        {messages.map((message) => (
          <div className={`project-ai-message ${message.role}`} key={message.id}>
            {message.role === "assistant" ? <span className="project-ai-message-mark"><Sparkles size={14} /></span> : null}
            <div><p>{message.content}</p></div>
          </div>
        ))}
        {project.pendingAiChange ? <section className={`project-ai-proposal ${project.pendingAiChange.changeKind}`}>
          <span>{project.pendingAiChange.changeKind === "major" ? "重大修改预览" : "待确认修改"}</span>
          <h3>{project.pendingAiChange.title}</h3>
          {project.pendingAiChange.changeKind === "major" ? <>
            <p>{project.pendingAiChange.reason}</p>
            <a href={`/projects/changes/${project.pendingAiChange.id}`}>查看完整预览</a>
          </> : <>
            <div className="project-ai-diff-list">
              {ordinaryChanges.map((change, index) => <div key={`${change.label}-${index}`}><strong>{change.label}</strong><del>{change.before}</del><span>→</span><ins>{change.after}</ins></div>)}
            </div>
            <div className="project-ai-proposal-actions">
              <button className="secondary-button" disabled={mutation.pending} onClick={() => void mutation.run(() => rejectProjectAiChangeSetAction(project.pendingAiChange!.id), "已拒绝这次修改").then(() => router.refresh())}>拒绝</button>
              <button className="primary-button" disabled={mutation.pending} onClick={() => void mutation.run(() => confirmProjectAiChangeSetAction(project.pendingAiChange!.id), "修改已执行").then(() => router.refresh())}>确认修改</button>
            </div>
          </>}
        </section> : null}
        {messages.length === 0 ? <div className="project-ai-empty" aria-label="这段对话还没有消息" /> : null}
      </div>

      <footer className="project-ai-composer">
        <div>
          <textarea
            aria-label="项目 AI 输入框"
            rows={3}
            placeholder="询问这个项目……"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button disabled={!configured || !conversationId || !draft.trim() || mutation.pending} aria-label="发送消息" title={configured ? "发送消息" : "请先配置 AI 服务商"} onClick={() => void sendMessage()}>
            <SendHorizontal size={17} />
          </button>
        </div>
        <small>{mutation.pending ? "AI 正在理解项目……" : configured ? `${model} · Enter 发送，Shift + Enter 换行` : "请先在全局设置中配置 AI 服务商"}</small>
        <a className="project-ai-settings-link" href="/settings">打开设置</a>
        <InlineFeedback error={mutation.error} notice={mutation.notice} />
      </footer>
    </aside>
  );
}

function EditableTaskTitle({ id, title, kind, disabled }: {
  id: number;
  title: string;
  kind: "once" | "recurring";
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const mutation = useMutation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const label = kind === "once" ? "任务" : "周期任务";

  useEffect(() => {
    if (!editing || !inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
  }, [editing, draft]);

  const save = async () => {
    if (disabled || submitting.current) return;
    if (!draft.trim()) {
      mutation.setError("任务名称不能为空");
      inputRef.current?.focus();
      return;
    }
    if (draft.trim() === title) {
      setEditing(false);
      return;
    }
    submitting.current = true;
    try {
      const result = await mutation.run(() => updateProjectTaskTitleAction({ id, title: draft, kind }));
      if (result.ok) setEditing(false);
    } catch {
      mutation.setError("保存失败，请重试，你的修改仍保留在这里。");
    } finally {
      submitting.current = false;
    }
  };

  return (
    <>
      <div className="project-task-title">
        {editing ? <form className="project-task-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <textarea
            ref={inputRef}
            autoFocus
            aria-label={`编辑${label}名称`}
            value={draft}
            maxLength={120}
            rows={2}
            disabled={mutation.pending || disabled}
            onChange={(event) => { setDraft(event.target.value); mutation.setError(null); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void save();
              }
              if (event.key === "Escape" && !mutation.pending) {
                event.preventDefault();
                setEditing(false);
              }
            }}
          />
          <small>Enter 保存 · Shift + Enter 换行</small>
          <InlineFeedback error={mutation.error} />
          <div className="project-task-editor-actions">
            <button type="button" className="text-button muted" disabled={mutation.pending} onClick={() => setEditing(false)}>取消</button>
            <button type="submit" className="text-button" disabled={mutation.pending || disabled}>{mutation.pending ? "保存中…" : "保存"}</button>
          </div>
        </form> : <span>{title}</span>}
      </div>
      {!editing ? <button
        type="button"
        className="project-row-edit"
        aria-label={`编辑${label}`}
        title={`编辑${label}`}
        disabled={disabled}
        onClick={() => { setDraft(title); mutation.setError(null); setEditing(true); }}
      ><Pencil size={14} /></button> : null}
    </>
  );
}

function StageTaskColumns({
  project,
  stage,
  lifeDate,
  pending,
  onAddTask,
  onAddRecurring,
  onToggleTask,
  onDeleteTask,
  onToggleRecurring,
  onDeleteRecurring,
}: {
  project: ProjectWorkspaceItem;
  stage: ProjectStage;
  lifeDate: string;
  pending: boolean;
  onAddTask: () => void;
  onAddRecurring: () => void;
  onToggleTask: (id: number) => void;
  onDeleteTask: (id: number) => void;
  onToggleRecurring: (id: number, lifeDate: string) => void;
  onDeleteRecurring: (id: number) => void;
}) {
  const isCurrent = stage.id === project.currentStageId;
  return (
    <div className="project-task-columns">
      <section className="project-task-column">
        <h3>一次性任务</h3>
        <div className="project-task-list">
          {stage.tasks.length === 0 ? <p className="project-task-empty">还没有一次性任务</p> : null}
          {stage.tasks.map((task) => (
            <div className={task.completedAt ? "project-task-row completed" : "project-task-row"} key={task.id}>
              <button
                className="project-task-check"
                aria-label={task.completedAt ? "取消完成" : "完成任务"}
                disabled={pending}
                onClick={() => onToggleTask(task.id)}
              >
                {task.completedAt ? <Check size={13} /> : null}
              </button>
              <EditableTaskTitle id={task.id} title={task.title} kind="once" disabled={pending} />
              <button className="project-row-delete" aria-label="删除任务" onClick={() => onDeleteTask(task.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="project-add-row" onClick={onAddTask}><Plus size={17} />添加任务</button>
      </section>

      <section className="project-task-column">
        <h3>阶段周期任务</h3>
        <div className="project-task-list">
          {stage.recurringTasks.length === 0 ? <p className="project-task-empty">还没有阶段周期任务</p> : null}
          {stage.recurringTasks.map((task) => (
            <div className={task.completedToday ? "project-task-row completed" : "project-task-row"} key={task.id}>
              <button
                className="project-task-check"
                aria-label={task.completedToday ? "取消今日完成" : "标记今日完成"}
                title={isCurrent ? "记录今天的完成情况" : "只有当前阶段可以打卡"}
                disabled={!isCurrent || pending}
                onClick={() => onToggleRecurring(task.id, lifeDate)}
              >
                {task.completedToday ? <Check size={13} /> : null}
              </button>
              <EditableTaskTitle id={task.id} title={task.title} kind="recurring" disabled={pending} />
              <em>{task.frequency === "daily" ? "每天" : task.frequency === "weekly" ? "每周" : task.frequencyLabel}</em>
              <button className="project-row-delete" aria-label="删除周期任务" onClick={() => onDeleteRecurring(task.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button className="project-add-row" onClick={onAddRecurring}><Plus size={17} />添加周期任务</button>
      </section>
    </div>
  );
}

export function ProjectWorkspace({ data }: { data: ProjectWorkspaceData }) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(data.projects[0]?.id ?? null);
  const [selectedStageId, setSelectedStageId] = useState<number | null>(
    data.projects[0]?.currentStageId ?? data.projects[0]?.stages[0]?.id ?? null,
  );
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [menuOpen, setMenuOpen] = useState(false);
  const mutation = useMutation();
  const router = useRouter();
  const weeklyCheckStarted = useRef(false);
  const aiConfigured = data.aiSettings.provider !== "none" && data.aiSettings.hasApiKey && Boolean(data.aiSettings.model) && Boolean(data.aiSettings.baseUrl);

  useEffect(() => {
    if (!aiConfigured || weeklyCheckStarted.current || !data.projects.some((item) => item.pendingWeeklyCheck)) return;
    weeklyCheckStarted.current = true;
    void fetch("/api/ai/weekly-checks", { method: "POST", cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { completed?: number } | null) => {
        if (result?.completed) router.refresh();
      })
      .catch(() => undefined);
  }, [aiConfigured, data.projects, router]);

  const project = useMemo(
    () => data.projects.find((item) => item.id === selectedProjectId) ?? data.projects[0],
    [data.projects, selectedProjectId],
  );
  const selectedStage = project?.stages.find((stage) => stage.id === selectedStageId)
    ?? project?.stages.find((stage) => stage.id === project.currentStageId)
    ?? project?.stages[0];
  const currentStage = project?.stages.find((stage) => stage.id === project.currentStageId);

  const closeDialog = () => setDialog({ kind: "none" });
  const chooseProject = (nextProject: ProjectWorkspaceItem) => {
    setSelectedProjectId(nextProject.id);
    setSelectedStageId(nextProject.currentStageId ?? nextProject.stages[0]?.id ?? null);
    setMenuOpen(false);
  };

  return (
    <>
      <div className="project-management-layout">
        <aside className="project-list-panel">
          <div className="project-list-heading">
            <h1>我的项目</h1>
            <button className="project-new-button" onClick={() => setDialog({ kind: "new-project" })}>
              <Plus size={18} />新建项目
            </button>
          </div>
          <div className="project-list-items">
            {data.projects.map((item) => {
              const currentIndex = item.stages.findIndex((stage) => stage.id === item.currentStageId);
              return (
                <button
                  className={item.id === project?.id ? "project-list-item active" : "project-list-item"}
                  key={item.id}
                  onClick={() => chooseProject(item)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.status === "completed"
                        ? "已完成"
                        : item.status === "planning"
                          ? "规划中"
                        : item.stages.length
                          ? `当前阶段 ${Math.max(0, currentIndex) + 1} / ${item.stages.length}`
                          : "还没有阶段"}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              );
            })}
            {data.projects.length === 0 ? <p className="project-list-empty">还没有进行中的项目</p> : null}
          </div>
          <button className="project-archive-entry" onClick={() => setDialog({ kind: "archive" })}>
            <Archive size={15} />
            <span>已归档项目</span>
            <small>{data.archivedProjects.length}</small>
          </button>
        </aside>

        {project ? (
          <>
            <section className="project-main-panel">
              <header className="project-title-row">
                <div>
                  <h1>{project.name}</h1>
                  <label className={`project-status project-status-${project.status}`}>
                    <i />
                    <select
                      aria-label="项目状态"
                      value={project.status}
                      disabled={mutation.pending}
                      onChange={(event) => void mutation.run(
                        () => updateProjectStatusAction(project.id, event.target.value as ProjectWorkspaceItem["status"]),
                        "项目状态已更新",
                      )}
                    >
                      <option value="planning">规划中</option>
                      <option value="active">进行中</option>
                      <option value="completed">已完成</option>
                    </select>
                  </label>
                </div>
                <div className="project-title-actions">
                  <button className="secondary-button project-edit-button" onClick={() => setDialog({ kind: "edit-project" })}>
                    <Pencil size={16} />编辑项目
                  </button>
                  <div className="project-more-wrap">
                    <button className="icon-button project-more-button" aria-label="更多项目操作" onClick={() => setMenuOpen((open) => !open)}>
                      <Ellipsis size={19} />
                    </button>
                    {menuOpen ? (
                      <div className="project-more-menu">
                        <button
                          onClick={async () => {
                            await mutation.run(() => archiveProjectAction(project.id, true));
                            setMenuOpen(false);
                          }}
                        >
                          <Archive size={15} />归档项目
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </header>

              <section className="project-definition-card">
                <div><h2>项目目标</h2><p>{project.goal || "还没有填写项目目标。"}</p></div>
                <div><h2>完成标准</h2><p>{project.completionCriteria || "还没有填写完成标准。"}</p></div>
              </section>

              <ProjectProgress project={project} currentStage={currentStage} />

              <section className="project-stage-section">
                <h2>项目主线</h2>
                <div className="project-stage-track" role="tablist" aria-label="项目阶段">
                  {project.stages.map((stage, index) => {
                    const selected = stage.id === selectedStage?.id;
                    const current = stage.id === project.currentStageId;
                    return (
                      <button
                        role="tab"
                        aria-selected={selected}
                        className={`project-stage-node${selected ? " selected" : ""}${current ? " current" : ""}${stage.completedAt ? " completed" : ""}`}
                        key={stage.id}
                        onClick={() => setSelectedStageId(stage.id)}
                      >
                        <span>{stage.completedAt ? <Check size={19} /> : index + 1}</span>
                        <strong>{index + 1} {stage.title}</strong>
                        {current ? <em>当前阶段</em> : null}
                      </button>
                    );
                  })}
                  <button className="project-stage-node add" onClick={() => setDialog({ kind: "new-stage" })}>
                    <span><Plus size={19} /></span><strong>添加阶段</strong>
                  </button>
                </div>
                {currentStage && selectedStage?.id !== currentStage.id ? (
                  <p className="project-current-note">当前推进阶段：阶段 {currentStage.position + 1} · {currentStage.title}</p>
                ) : null}
              </section>

              {selectedStage ? (
                <section className="project-stage-detail">
                  <header>
                    <div>
                      <h2>阶段 {selectedStage.position + 1} · {selectedStage.title}</h2>
                      <span className={`stage-state stage-state-${stageStateLabel(selectedStage, project.currentStageId)}`}>
                        {stageStateLabel(selectedStage, project.currentStageId)}
                      </span>
                    </div>
                    <div className="project-stage-actions">
                      <button className="secondary-button" onClick={() => setDialog({ kind: "edit-stage" })}>
                        <Pencil size={15} />编辑阶段
                      </button>
                      {selectedStage.id === project.currentStageId ? (
                        <button
                          className="primary-button"
                          disabled={mutation.pending}
                          onClick={async () => {
                            const incomplete = selectedStage.tasks.some((task) => !task.completedAt);
                            if (incomplete && !window.confirm("当前阶段还有未完成任务，仍然完成这个阶段吗？")) return;
                            await mutation.run(
                              () => completeCurrentProjectStageAction(project.id, selectedStage.id),
                              "已进入下一阶段",
                            );
                          }}
                        >
                          <CheckCircle2 size={16} />完成当前阶段
                        </button>
                      ) : <button
                        className="secondary-button"
                        disabled={mutation.pending}
                        onClick={() => {
                          if (window.confirm(`把“${selectedStage.title}”设为当前阶段？`)) {
                            void mutation.run(() => setCurrentProjectStageAction(project.id, selectedStage.id), "当前阶段已更新");
                          }
                        }}
                      >设为当前阶段</button>}
                    </div>
                  </header>
                  <StageTaskColumns
                    project={project}
                    stage={selectedStage}
                    lifeDate={data.lifeDate}
                    pending={mutation.pending}
                    onAddTask={() => setDialog({ kind: "new-task" })}
                    onAddRecurring={() => setDialog({ kind: "new-recurring" })}
                    onToggleTask={(id) => void mutation.run(() => toggleProjectStageTaskAction(id))}
                    onDeleteTask={(id) => {
                      if (window.confirm("删除这个任务？")) void mutation.run(() => deleteProjectStageTaskAction(id));
                    }}
                    onToggleRecurring={(id, lifeDate) => void mutation.run(() => toggleProjectRecurringCheckinAction(id, lifeDate))}
                    onDeleteRecurring={(id) => {
                      if (window.confirm("删除这个阶段周期任务？")) void mutation.run(() => deleteProjectStageRecurringTaskAction(id));
                    }}
                  />
                  <InlineFeedback error={mutation.error} notice={mutation.notice} />
                </section>
              ) : (
                <section className="project-stage-empty">
                  <h2>阶段内容</h2>
                  <p>添加第一个阶段后，这里会出现一次性任务和阶段周期任务的完整框架。</p>
                </section>
              )}
            </section>

            <ProjectAiPanel key={project.id} project={project} configured={aiConfigured} model={data.aiSettings.model} />
          </>
        ) : (
          <section className="project-workspace-empty">
            <h1>建立你的第一个项目</h1>
            <p>为一件有明确终点、需要持续推进的事情建立主线。</p>
            <button className="primary-button" onClick={() => setDialog({ kind: "new-project" })}><Plus size={17} />新建项目</button>
          </section>
        )}
      </div>

      {dialog.kind === "new-project" || dialog.kind === "edit-project" ? <ProjectFormModal
        open
        project={dialog.kind === "edit-project" ? project : undefined}
        pending={mutation.pending}
        error={mutation.error}
        onClose={closeDialog}
        onSubmit={async (values) => {
          if (dialog.kind === "edit-project" && project) {
            const result = await mutation.run(() => updateProjectAction({ id: project.id, ...values }));
            if (result.ok) closeDialog();
            return;
          }
          const result = await mutation.run(() => createProjectAction(values));
          if (result.ok) {
            setSelectedProjectId(result.projectId);
            setSelectedStageId(null);
            closeDialog();
          }
        }}
      /> : null}
      {dialog.kind === "new-stage" || dialog.kind === "edit-stage" ? <TextEntryModal
        open
        title={dialog.kind === "edit-stage" ? "编辑阶段" : "添加阶段"}
        label="阶段名称"
        initialValue={dialog.kind === "edit-stage" ? selectedStage?.title : ""}
        pending={mutation.pending}
        error={mutation.error}
        onClose={closeDialog}
        onSubmit={async (value) => {
          if (!project) return;
          if (dialog.kind === "edit-stage" && selectedStage) {
            const result = await mutation.run(() => updateProjectStageAction(selectedStage.id, value));
            if (result.ok) closeDialog();
          } else {
            const result = await mutation.run(() => createProjectStageAction(project.id, value));
            if (result.ok) {
              setSelectedStageId(result.stageId);
              closeDialog();
            }
          }
        }}
      /> : null}
      {dialog.kind === "new-task" ? <TextEntryModal
        open
        title="添加一次性任务"
        label="任务名称"
        pending={mutation.pending}
        error={mutation.error}
        onClose={closeDialog}
        onSubmit={async (value) => {
          if (!selectedStage) return;
          const result = await mutation.run(() => createProjectStageTaskAction(selectedStage.id, value));
          if (result.ok) closeDialog();
        }}
      /> : null}
      {dialog.kind === "new-recurring" ? <RecurringTaskModal
        open
        pending={mutation.pending}
        error={mutation.error}
        onClose={closeDialog}
        onSubmit={async (values) => {
          if (!selectedStage) return;
          const result = await mutation.run(() => createProjectStageRecurringTaskAction({ stageId: selectedStage.id, ...values }));
          if (result.ok) closeDialog();
        }}
      /> : null}
      <Modal open={dialog.kind === "archive"} onClose={closeDialog} title="已归档项目" description="归档项目不会出现在左侧项目列表中。" size="medium">
        <div className="archived-project-list">
          {data.archivedProjects.length === 0 ? <p className="empty-line">还没有归档项目</p> : null}
          {data.archivedProjects.map((item) => (
            <div className="archived-project-row" key={item.id}>
              <div><strong>{item.name}</strong><span>归档于 {new Date(item.archivedAt ?? 0).toLocaleDateString("zh-CN")}</span></div>
              <button
                className="secondary-button"
                disabled={mutation.pending}
                onClick={async () => {
                  const result = await mutation.run(() => archiveProjectAction(item.id, false));
                  if (result.ok) {
                    setSelectedProjectId(item.id);
                    setSelectedStageId(item.currentStageId ?? item.stages[0]?.id ?? null);
                    closeDialog();
                  }
                }}
              >
                <RotateCcw size={15} />恢复
              </button>
            </div>
          ))}
        </div>
        <InlineFeedback error={mutation.error} />
      </Modal>
    </>
  );
}
