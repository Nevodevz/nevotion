"use client";

import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { api, apiKeys as apiKeysApi } from "@/lib/api";
import { AVATAR_COLORS, ApiKey, ApiKeyCreated } from "@/lib/types";
import { Button, Input, Card, ConfirmModal, PageHeader, FormField } from "@/components/ui";

const COLORS = Object.keys(AVATAR_COLORS);
const ACCEPTED_AVATAR_TYPES = "image/jpeg,image/png,image/webp";
const MAX_AVATAR_MB = 5;

function ApiKeysSection() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/mcp` : "https://nevocean.anti-flow.com/mcp";

  async function load() {
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newName.trim()) { toast("Введите название ключа", "error"); return; }
    setCreating(true);
    try {
      const created = await apiKeysApi.create(newName.trim());
      setCreatedKey(created);
      setNewName("");
      setShowCreate(false);
      await load();
    } catch (e: any) { toast(e.message, "error"); }
    finally { setCreating(false); }
  }

  async function handleRevoke(id: number) {
    try {
      await apiKeysApi.revoke(id);
      setKeys(keys.filter(k => k.id !== id));
      toast("Ключ отозван");
    } catch (e: any) { toast(e.message, "error"); }
  }

  function copyKey() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey.plain_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyUrl() {
    navigator.clipboard.writeText(mcpUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }

  return (
    <Card padding={28} style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--primary-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--primary)" }}>vpn_key</span>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>API-ключи (для Claude)</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Подключите Claude к NevoOcean через custom connector</div>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>+ Создать ключ</Button>
      </div>

      {createdKey && (
        <div style={{ background: "var(--green-bg)", border: "1px solid var(--green)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--green)" }}>check_circle</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>Ключ создан — скопируйте сейчас, больше не покажем!</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, fontSize: 12, background: "var(--bg2)", padding: "8px 12px", borderRadius: 8, wordBreak: "break-all", color: "var(--text)", border: "1px solid var(--border)" }}>
              {createdKey.plain_key}
            </code>
            <Button variant="ghost" size="sm" onClick={copyKey} style={{ flexShrink: 0 }}>
              {copied ? "Скопировано!" : "Копировать"}
            </Button>
          </div>
          <button onClick={() => setCreatedKey(null)} style={{ marginTop: 10, fontSize: 12, color: "var(--text3)", background: "none", border: "none", cursor: "pointer" }}>
            Закрыть
          </button>
        </div>
      )}

      {showCreate && !createdKey && (
        <div style={{ background: "var(--bg2)", borderRadius: 10, padding: 16, marginBottom: 20, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text2)", marginBottom: 8 }}>Название ключа</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Например: Мой Claude"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <Button variant="primary" onClick={handleCreate} loading={creating} disabled={creating} style={{ flexShrink: 0 }}>
              Создать
            </Button>
            <Button variant="ghost" onClick={() => { setShowCreate(false); setNewName(""); }} style={{ flexShrink: 0 }}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text3)", padding: "12px 0" }}>Загрузка…</div>
      ) : keys.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text3)", padding: "12px 0" }}>Нет активных ключей</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {keys.map(k => (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg2)", borderRadius: 8, border: "0.5px solid var(--border)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--text3)" }}>key</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{k.name}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                  {k.key_prefix}… · создан {new Date(k.created_at).toLocaleDateString("ru")}
                  {k.last_used_at && ` · использован ${new Date(k.last_used_at).toLocaleDateString("ru")}`}
                </div>
              </div>
              <Button variant="danger" size="sm" onClick={() => handleRevoke(k.id)}>
                Отозвать
              </Button>
            </div>
          ))}
        </div>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "20px 0 16px" }} />

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)", marginBottom: 8 }}>URL коннектора</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ flex: 1, fontSize: 12, background: "var(--bg2)", padding: "8px 12px", borderRadius: 8, wordBreak: "break-all", color: "var(--text)", border: "0.5px solid var(--border)" }}>
            {mcpUrl}
          </code>
          <Button variant="ghost" size="sm" onClick={copyUrl} style={{ flexShrink: 0 }}>
            {urlCopied ? "Скопировано!" : "Копировать"}
          </Button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Подключение к Claude:</div>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Создайте API-ключ выше и скопируйте его</li>
          <li>Откройте Claude → <b>Settings → Connectors → Add custom connector</b></li>
          <li>Вставьте URL коннектора (см. выше)</li>
          <li>В поле авторизации вставьте свой API-ключ</li>
          <li>Сохраните — Claude увидит ваши задачи и лиды</li>
        </ol>
        <div style={{ marginTop: 8 }}>
          Claude будет действовать <b>от вашего имени, в рамках ваших прав</b>: сможет смотреть и создавать задачи,
          назначать исполнителей, смотреть лиды — то же самое, что доступно вам в интерфейсе.
        </div>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", position: "", avatar_color: "indigo" });
  const [pwForm, setPwForm] = useState({ password: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    e.target.value = "";
    if (!file || !user) return;

    // Client-side pre-checks; the server validates the real content regardless.
    if (!ACCEPTED_AVATAR_TYPES.split(",").includes(file.type)) {
      toast("Поддерживаются только JPEG, PNG и WebP", "error");
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      toast(`Файл больше ${MAX_AVATAR_MB} МБ`, "error");
      return;
    }

    setAvatarBusy(true);
    try {
      await api.uploadAvatar(user.id, file);
      await refreshUser();
      toast("Аватар обновлён");
    } catch (err: unknown) {
      toast((err as Error).message || "Не удалось загрузить аватар", "error");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!user) return;
    setAvatarBusy(true);
    try {
      await api.deleteAvatar(user.id);
      await refreshUser();
      toast("Фото удалено — показываются инициалы");
    } catch (err: unknown) {
      toast((err as Error).message || "Не удалось удалить фото", "error");
    } finally {
      setAvatarBusy(false);
    }
  }

  useEffect(() => {
    if (user) setForm({ name: user.name, position: user.position, avatar_color: user.avatar_color });
  }, [user]);

  async function saveProfile() {
    setSaving(true);
    try {
      await api.updateUser(user!.id, { name: form.name, position: form.position, avatar_color: form.avatar_color });
      await refreshUser();
      toast("Профиль сохранён");
    } catch (e: any) { toast(e.message, "error"); }
    finally { setSaving(false); }
  }

  async function savePassword() {
    if (pwForm.password !== pwForm.confirm) { toast("Пароли не совпадают", "error"); return; }
    if (pwForm.password.length < 6) { toast("Минимум 6 символов", "error"); return; }
    setPwSaving(true);
    try {
      await api.updateUser(user!.id, { password: pwForm.password });
      setPwForm({ password: "", confirm: "" });
      toast("Пароль изменён");
    } catch (e: any) { toast(e.message, "error"); }
    finally { setPwSaving(false); }
  }

  if (!user) return null;

  return (
    <Shell title="Профиль">
      <div style={{ maxWidth: 900 }}>
        <PageHeader
          title="Мой профиль"
          subtitle="Управление персональными данными и настройками безопасности"
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

          {/* LEFT — profile info */}
          <Card padding={28} style={{ overflow: "visible" }}>
            <div style={{ position: "relative", width: 120, height: 120, marginBottom: 12 }}>
              {user.avatar_url ? (
                <Avatar name={form.name || user.name} color={form.avatar_color}
                  src={user.avatar_url} size={120} square />
              ) : (
                <div style={{
                  width: 120, height: 120, borderRadius: 16,
                  background: AVATAR_COLORS[form.avatar_color]?.fg ?? AVATAR_COLORS.indigo.fg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 42, fontWeight: 700, color: "white",
                }}>
                  {(form.name || user.name).slice(0, 1).toUpperCase()}
                </div>
              )}

              <input ref={fileRef} type="file" accept={ACCEPTED_AVATAR_TYPES}
                onChange={handleAvatarPick} style={{ display: "none" }} />

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                aria-label="Загрузить фото профиля"
                title="Загрузить фото"
                style={{
                  position: "absolute", bottom: -6, right: -6,
                  width: 34, height: 34, borderRadius: "50%",
                  background: "var(--bg2)", border: "2px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: avatarBusy ? "wait" : "pointer",
                  opacity: avatarBusy ? 0.5 : 1,
                  transition: "opacity 0.15s, border-color 0.15s",
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: "var(--text2)" }}>
                  {avatarBusy ? "hourglass_top" : "photo_camera"}
                </span>
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              <Button variant="ghost" size="sm" disabled={avatarBusy}
                onClick={() => fileRef.current?.click()}>
                {user.avatar_url ? "Заменить фото" : "Загрузить фото"}
              </Button>
              {user.avatar_url && (
                <Button variant="danger" size="sm" disabled={avatarBusy}
                  onClick={() => setConfirmRemoveAvatar(true)}>
                  Удалить
                </Button>
              )}
              <span style={{ fontSize: 11, color: "var(--text3)" }}>
                JPEG, PNG, WebP · до {MAX_AVATAR_MB} МБ
              </span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{user.name}</div>
              <div style={{ fontSize: 13, color: "var(--text3)", margin: "4px 0 10px" }}>{user.email}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {user.role === "admin" && (
                  <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: "var(--primary-dim)", color: "var(--primary)", fontWeight: 500 }}>
                    Администратор
                  </span>
                )}
                {user.is_founder && (
                  <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: "var(--orange-bg)", color: "var(--orange)", fontWeight: 500, border: "0.5px solid var(--orange)" }}>
                    Основатель
                  </span>
                )}
              </div>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0 0 20px" }} />

            <FormField label="Имя">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <FormField label="Должность">
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </FormField>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0 20px" }} />

            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text3)", marginBottom: 12 }}>
                Цвет аватара {user.avatar_url && "(используется без фото)"}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, avatar_color: c })} style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: AVATAR_COLORS[c].fg,
                    cursor: "pointer",
                    border: form.avatar_color === c ? "3px solid var(--text)" : "3px solid transparent",
                    outline: form.avatar_color === c ? "2px solid var(--primary)" : "none",
                    outlineOffset: 2,
                  }} />
                ))}
              </div>
            </div>

            <Button variant="primary" onClick={saveProfile} disabled={saving} loading={saving}
              style={{ marginTop: 24, width: "100%", justifyContent: "center" }}>
              Сохранить изменения
            </Button>
          </Card>

          {/* RIGHT — password */}
          <Card padding={28}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--primary-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--primary)" }}>lock</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Смена пароля</span>
            </div>

            <FormField label="Новый пароль">
              <div style={{ position: "relative" }}>
                <Input type={showPw ? "text" : "password"}
                  value={pwForm.password} onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })}
                  placeholder="Введите новый пароль" style={{ paddingRight: 44 }} />
                <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{showPw ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </FormField>

            <FormField label="Подтверждение пароля">
              <div style={{ position: "relative" }}>
                <Input type={showConfirm ? "text" : "password"}
                  value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                  placeholder="Повторите новый пароль" style={{ paddingRight: 44 }} />
                <button onClick={() => setShowConfirm(!showConfirm)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text3)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{showConfirm ? "visibility_off" : "visibility"}</span>
                </button>
              </div>
            </FormField>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0 20px" }} />

            <Button variant="primary" onClick={savePassword} disabled={pwSaving || !pwForm.password} loading={pwSaving}
              style={{ width: "100%", justifyContent: "center" }}>
              Сохранить пароль
            </Button>
          </Card>
        </div>

        <ApiKeysSection />

        <ConfirmModal
          open={confirmRemoveAvatar}
          title="Удалить фото профиля"
          message="Фото будет удалено. Вместо него везде появятся инициалы и выбранный цвет."
          confirmLabel="Удалить"
          variant="danger"
          onConfirm={async () => { setConfirmRemoveAvatar(false); await removeAvatar(); }}
          onCancel={() => setConfirmRemoveAvatar(false)}
        />

        <style jsx>{`
          @media (max-width: 700px) {
            div[style*="grid-template-columns: 1fr 1fr"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </Shell>
  );
}
