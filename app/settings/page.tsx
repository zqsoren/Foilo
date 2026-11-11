import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { SettingsForm } from "@/components/settings-form";
import { getDatabaseDisplayPath } from "@/lib/backup";
import { getSettings } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { UserMenu } from "@/components/auth/user-menu";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const settings = getSettings(user.id);
  return (
    <main className="subpage-shell narrow-page">
      <header className="subpage-header"><div><Link className="back-link" href="/"><ArrowLeft size={17} />返回今天</Link><h1>设置</h1><p>只保留真正会影响日常使用的选项。</p></div><div className="subpage-user-actions"><UserMenu name={user.name} /><Settings size={32} /></div></header>
      <SettingsForm
        workTargetMinutes={settings.dailyWorkTargetMinutes}
        weeklyWorkoutTarget={settings.weeklyWorkoutTarget}
        lastBackupAt={settings.lastBackupAt}
        databasePath={getDatabaseDisplayPath()}
        aiProvider={settings.aiProvider}
        aiModel={settings.aiModel}
        aiBaseUrl={settings.aiBaseUrl}
        hasAiApiKey={settings.hasAiApiKey}
        aiApiKeyHint={settings.aiApiKeyHint}
        canManageSite={user.id === 1}
      />
    </main>
  );
}
