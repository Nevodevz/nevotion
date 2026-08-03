"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { refreshUser } = useApp();

  async function submit() {
    setError("");
    setBusy(true);
    try {
      await api.login(email, password);
      await refreshUser();
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message || "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        height: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: 360, background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 14, padding: 32, boxShadow: "var(--shadow)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div
            style={{
              width: 36, height: 36,
              background: "linear-gradient(135deg, var(--primary), #6063ee)",
              borderRadius: 9, display: "flex", alignItems: "center",
              justifyContent: "center", fontWeight: 700, fontSize: 16, color: "white",
            }}
          >
            N
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>NevOcean</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>Вход в рабочую область</div>
          </div>
        </div>

        <label style={{ fontSize: 11, color: "var(--text2)", display: "block", marginBottom: 4 }}>
          Email
        </label>
        <input
          className="login-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@nevodevs.kg"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <label style={{ fontSize: 11, color: "var(--text2)", display: "block", margin: "14px 0 4px" }}>
          Пароль
        </label>
        <input
          className="login-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        {error && (
          <div style={{ color: "var(--red)", fontSize: 12, marginTop: 12 }}>{error}</div>
        )}

        <button className="login-btn" onClick={submit} disabled={busy}>
          {busy ? "Вход…" : "Войти"}
        </button>

        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 16, textAlign: "center" }}>
          Данные для входа выдаёт администратор NevoOcean
        </div>
      </div>

      <style jsx>{`
        .login-input {
          width: 100%; padding: 10px 12px; border-radius: 8px;
          border: 1px solid var(--border); background: var(--bg);
          color: var(--text); font-family: var(--font); font-size: 13px;
          outline: none; transition: border-color 0.15s;
        }
        .login-input:focus { border-color: var(--primary); }
        .login-btn {
          width: 100%; margin-top: 20px; padding: 11px;
          background: var(--primary); color: white; border: none;
          border-radius: 8px; font-size: 13px; font-weight: 500;
          cursor: pointer; font-family: var(--font); transition: background 0.15s;
        }
        .login-btn:hover { background: var(--primary-hover); }
        .login-btn:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </div>
  );
}
