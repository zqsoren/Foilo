import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { WebAppRegistration } from "@/components/todo/web-app-registration";
import { getCurrentUser } from "@/lib/auth";
import { isMobileTodoDestination, loginDestination } from "@/lib/login-routing";
import { todoWebAppMetadata } from "@/lib/todo/web-app";
import "./login.css";

export const dynamic = "force-dynamic";
type LoginProps = { searchParams: Promise<{ next?: string | string[] }> };

export async function generateMetadata({ searchParams }: LoginProps): Promise<Metadata> {
  const destination = loginDestination((await searchParams).next);
  const mobile = isMobileTodoDestination(destination);
  return {
    ...(mobile && todoWebAppMetadata),
    title: "在侧 Folio · 登录",
    icons: { ...(mobile && todoWebAppMetadata.icons), icon: "/folio/icon.svg" },
  };
}

export default async function LoginPage({ searchParams }: LoginProps) {
  const destination = loginDestination((await searchParams).next);
  if (await getCurrentUser()) redirect(destination);
  return <>
    {isMobileTodoDestination(destination) && <WebAppRegistration />}
    <AuthForm destination={destination} />
  </>;
}
