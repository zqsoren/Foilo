"use client";

import { Bot, Database, HardDriveDownload, KeyRound, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { clearAiApiKeyAction, createBackupAction, saveAiSettingsAction, saveSettingsAction, testAiConnectionAction } from "@/app/actions";
import type { AiProviderSettings } from "@/lib/types";
import { InlineFeedback, useMutation } from "@/components/ui/use-mutation";

export function SettingsForm({
  workTargetMinutes,
  weeklyWorkoutTarget,
  lastBackupAt,
  databasePath,
  aiProvider,
  aiModel,
  aiBaseUrl,
  hasAiApiKey,
  aiApiKeyHint,
  canManageSite,
}: {
  workTargetMinutes: number;
  weeklyWorkoutTarget: number;
  lastBackupAt: number | null;
  databasePath: string;
  aiProvider: AiProviderSettings["provider"];
  aiModel: string;
  aiBaseUrl: string;
  hasAiApiKey: boolean;
  aiApiKeyHint: string | null;
  canManageSite: boolean;
}) {
  const [hours, setHours] = useState(Math.floor(workTargetMinutes / 60));
  const [minutes, setMinutes] = useState(workTargetMinutes % 60);
  const [workouts, setWorkouts] = useState(weeklyWorkoutTarget);
  const mutation = useMutation();
  const backupMutation = useMutation();
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [provider, setProvider] = useState(aiProvider);
  const [model, setModel] = useState(aiModel);
  const [baseUrl, setBaseUrl] = useState(aiBaseUrl);
  const [apiKey, setApiKey] = useState("");
  const aiMutation = useMutation();
  const connectionMutation = useMutation();

  return (
    <div className="settings-stack">
      <section className="settings-panel">
        <div className="settings-heading"><Save size={21} /><div><h2>目标</h2><p>首页直接使用这里的数值；过去的生活日保留当时的目标。</p></div></div>
        <div className="settings-form-grid">
          <div><label>每日工作目标</label><div className="duration-inputs"><label><span>小时</span><input type="number" min={0} max={23} value={hours} onChange={(e) => setHours(Math.max(0, Math.min(23, Number(e.target.value))))} /></label><label><span>分钟</span><input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(Math.max(0, Math.min(59, Number(e.target.value))))} /></label></div></div>
          <label className="field-label"><span>每周健身目标（次）</span><input type="number" min={0} max={7} value={workouts} onChange={(e) => setWorkouts(Math.max(0, Math.min(7, Number(e.target.value))))} /></label>
        </div>
        <InlineFeedback error={mutation.error} notice={mutation.notice} />
        <button className="primary-button" disabled={mutation.pending} onClick={() => mutation.run(() => saveSettingsAction(hours * 60 + minutes, workouts), "设置已保存")}>保存设置</button>
      </section>

      <section className="settings-panel">
        <div className="settings-heading"><Bot size={21} /><div><h2>项目 AI</h2><p>这是你所有项目共用的 AI 接口设置，不属于某一个项目。</p></div></div>
        <div className="form-stack ai-settings-form">
          <label className="field-label">
            <span>云端服务商</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value as AiProviderSettings["provider"])}>
              <option value="none">尚未选择</option>
              <option value="openai">OpenAI</option>
              <option value="openai-compatible">兼容 OpenAI API 的云服务</option>
            </select>
          </label>
          <div className="settings-form-grid">
            <label className="field-label"><span>模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="确定服务商后填写" /></label>
            <label className="field-label"><span>API 地址</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="确定服务商后填写" /></label>
          </div>
          <label className="field-label">
            <span>API Key</span>
            <div className="api-key-row">
              <div className="api-key-input"><KeyRound size={16} /><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasAiApiKey ? `已保存 ${aiApiKeyHint ?? ""}，留空则不修改` : "确定服务商后填写"} /></div>
              {hasAiApiKey ? <button className="secondary-button" disabled={aiMutation.pending} onClick={() => aiMutation.run(() => clearAiApiKeyAction(), "密钥已移除")}><Trash2 size={15} />移除</button> : null}
            </div>
          </label>
        </div>
        <p className="settings-security-note">项目对话和周检会通过这里配置的云端服务商处理。API Key 只在本机服务端读取，不会返回浏览器。</p>
        <InlineFeedback error={aiMutation.error} notice={aiMutation.notice} />
        <InlineFeedback error={connectionMutation.error} notice={connectionMutation.notice} />
        <div className="settings-ai-actions">
          <button className="primary-button" disabled={aiMutation.pending || connectionMutation.pending} onClick={async () => {
            const result = await aiMutation.run(() => saveAiSettingsAction({ provider, model, baseUrl, apiKey }), "AI 设置已保存");
            if (result.ok) setApiKey("");
          }}>保存 AI 设置</button>
          <button className="secondary-button" disabled={!hasAiApiKey || aiMutation.pending || connectionMutation.pending} onClick={() => connectionMutation.run(() => testAiConnectionAction(), "AI 连接成功")}>测试连接</button>
        </div>
      </section>

      {canManageSite ? (
        <section className="settings-panel">
          <div className="settings-heading"><Database size={21} /><div><h2>整站数据</h2><p>生活记录保存在部署服务器的独立数据库中，并按账号隔离。</p></div></div>
          <dl className="data-details"><div><dt>数据库位置</dt><dd>{databasePath}</dd></div><div><dt>最近备份</dt><dd>{lastBackupAt ? new Date(lastBackupAt).toLocaleString("zh-CN") : "尚未备份"}</dd></div></dl>
          {backupPath ? <p className="backup-success">备份已保存到：{backupPath}</p> : null}
          <InlineFeedback error={backupMutation.error} notice={backupMutation.notice} />
          <button className="secondary-button backup-button" disabled={backupMutation.pending} onClick={async () => { const result = await backupMutation.run(() => createBackupAction(), "备份完成"); if (result.ok) setBackupPath(result.path); }}><HardDriveDownload size={17} />立即备份</button>
        </section>
      ) : null}
    </div>
  );
}
