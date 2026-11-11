"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { registerAction } from "@/app/auth-actions";
import { loginUrl } from "@/lib/login-routing";
import { productVersions } from "@/lib/product-versions";

type Step = "phone" | "password" | "register";
const sessionPath = "/api/auth/session";
const providers = [
  { label: "微信登录", icon: "wechat" },
  { label: "Apple 登录", icon: "apple" },
  { label: "邮箱登录", icon: "email" },
];

function LoginForm({ step, destination, phone, setPhone, advance }: {
  destination: string;
  step: Step;
  phone: string;
  setPhone: (value: string) => void;
  advance: (step: Step, phone?: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = step === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const number = phone.replace(/[\s-]/g, "");
    setError("");
    if (!/^1[3-9]\d{9}$/.test(number)) {
      setError("请输入正确的 11 位手机号");
      form.querySelector<HTMLInputElement>('input[type="tel"]')?.focus();
      return;
    }
    if (step === "phone") {
      advance("password", number);
      return;
    }
    const password = String(data.get("password") ?? "");
    setBusy(true);
    try {
      if (registering) {
        const result = await registerAction({ name: String(data.get("name") ?? ""), phone: number, password });
        if (!result.ok) { setError(result.message); return; }
      } else {
        const response = await fetch(sessionPath, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: number, password }),
        });
        if (!response.ok) {
          const result = await response.json();
          setError(result.error ?? "登录失败，请重试");
          return;
        }
      }
      const session = await fetch(sessionPath, { cache: "no-store", credentials: "same-origin" });
      if (!session.ok) {
        setError(session.status === 401
          ? "浏览器未保存登录状态，请允许本站使用 Cookie 后重试。"
          : "暂时无法确认登录状态，请重试。");
        return;
      }
      window.location.replace(destination);
    } catch {
      setError("连接失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="folio-form" onSubmit={submit} aria-busy={busy}>
      {registering && (
        <label className="folio-field">
          <span>姓名</span>
          <input name="name" autoComplete="name" maxLength={30} placeholder="请输入姓名" required />
        </label>
      )}
      {step !== "password" ? (
        <label className="folio-field">
          <span className={registering ? undefined : "folio-sr"}>手机号</span>
          <input type="tel" name="phone" autoComplete="username" inputMode="tel"
            maxLength={20} value={phone} onChange={event => setPhone(event.target.value)}
            placeholder="请输入手机号" required />
        </label>
      ) : (
        <input type="text" name="phone" autoComplete="username" value={phone} readOnly hidden />
      )}
      {step !== "phone" && (
        <label className="folio-field">
          <span className={registering ? undefined : "folio-sr"}>密码</span>
          <input type="password" name="password" autoComplete={registering ? "new-password" : "current-password"}
            autoFocus={step === "password"} minLength={registering ? 8 : 1} maxLength={128}
            placeholder={registering ? "设置密码（至少 8 个字符）" : "请输入密码"} required />
        </label>
      )}
      {error && <p className="folio-error" role="alert">{error}</p>}
      <button type="submit" className="folio-submit" disabled={busy}>
        {busy ? "请稍候…" : step === "phone" ? "下一步" : registering ? "注册并登录" : "登录"}
      </button>
      {step === "phone" ? (
        <>
          <div className="folio-other" role="group" aria-labelledby="folio-methods">
            <p id="folio-methods">其他登录方式</p>
            <div className="folio-providers">
              {providers.map(({ label, icon }) => (
                <button type="button" key={icon} disabled title="暂未开放">
                  <Image src={`/folio/login/${icon}.svg`} width={22} height={22} alt="" unoptimized />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <a className="folio-register" href={loginUrl(destination, "register")}
            onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              advance("register");
            }}>注册账号</a>
        </>
      ) : (
        <button type="button" className="folio-back" disabled={busy} onClick={() => advance("phone")}>
          {registering ? "返回登录" : "更换手机号"}
        </button>
      )}
    </form>
  );
}

export function AuthForm({ destination }: { destination: string }) {
  const query = useSearchParams();
  const [phone, setPhone] = useState("");
  const [confirmedPhone, setConfirmedPhone] = useState("");
  const requested = query.get("step");
  const step: Step = requested === "register" ? "register" :
    requested === "password" && confirmedPhone ? "password" : "phone";

  function advance(next: Step, number?: string) {
    if (number) {
      setPhone(number);
      setConfirmedPhone(number);
    }
    const url = loginUrl(destination, next);
    if (next === "phone" || next === requested) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  return (
    <main className="folio-login">
      <section className="folio-panel" aria-labelledby="folio-title" data-step={step}>
        <header>
          <Image className="folio-mark" src="/folio/login/mark.svg" width={60} height={50} alt="" unoptimized />
          <h1 id="folio-title">{step === "register" ? "注册你的 " : "登录你的 "}<strong>在侧</strong><span
            className="folio-title-gap" aria-hidden="true">{"  "}</span><b lang="en">Folio</b>{" 账号"}</h1>
          <p className="folio-subtitle">
            {step === "password"
              ? `正在登录 ${confirmedPhone.slice(0, 3)} **** ${confirmedPhone.slice(-4)}`
              : destination.startsWith("/gym") ? `登录后返回健身 · ${destination.endsWith("desktop") ? "桌面端" : "手机端"}`
              : "生活在侧，生活在册，生活在策。"}
          </p>
        </header>
        <LoginForm key={step} destination={destination} step={step} phone={step === "password" ? confirmedPhone : phone}
          setPhone={setPhone} advance={advance} />
      </section>
      <small className="folio-version">LOGIN | {productVersions.login}</small>
    </main>
  );
}
