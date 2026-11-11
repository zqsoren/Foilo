import { LogOut, UserRound } from "lucide-react";
import { logoutAction } from "@/app/auth-actions";

export function UserMenu({ name }: { name: string }) {
  return (
    <div className="user-menu">
      <span><UserRound size={15} />{name}</span>
      <form action={logoutAction}>
        <button type="submit" aria-label="退出登录" title="退出登录"><LogOut size={15} /></button>
      </form>
    </div>
  );
}
