"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BoardView } from "@/components/BoardView";
import { UserModal } from "@/components/UserModal";
import { ProjectModal } from "@/components/ProjectModal";
import { useApp } from "@/context/AppContext";
import { useToast } from "@/context/ToastContext";
import { api, leadApi } from "@/lib/api";
import {
  Department, UserWithStats, Project, Board, Lead, STATUS_LABELS, ProjectStatus,
  BOT_COLORS, BOT_SUB_STATUSES, BotColor,
} from "@/lib/types";
import { Button, ConfirmModal } from "@/components/ui";

// Helper: compute total salary for a prompter from their projects
function calcSalary(projects: Project[], userId: number): number {
  return projects
    .filter((p) => p.owner_id === userId)
    .reduce((sum, p) => sum + (p.price || (p.status === "support" ? 1000 : 0)), 0);
}

export function DevDepartmentView({ dept, departments }: { dept: Department; departments: Department[] }) {
  const { isAdmin, user: currentUser } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [leadsMap, setLeadsMap] = useState<Record<number, Lead>>({});
  const [backendBoard, setBackendBoard] = useState<Board | null>(null);
  const [userModal, setUserModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [prompterFilter, setPrompterFilter] = useState<number | null>(null);
  const [projectPage, setProjectPage] = useState(1);
  const [deleteProjectId, setDeleteProjectId] = useState<number | null>(null);
  const PROJECT_PAGE_SIZE = 30;

  const load = useCallback(() => {
    api.listUsers(dept.id).then(setUsers).catch(() => {});
    api.listProjects().then((prjs) => {
      setProjects(prjs);
      const leadIds = [...new Set(prjs.filter(p => p.lead_id).map(p => p.lead_id as number))];
      if (leadIds.length > 0) {
        Promise.all(leadIds.map(id => leadApi.get(id).catch(() => null)))
          .then(leads => {
            const map: Record<number, Lead> = {};
            leads.forEach(l => { if (l) map[l.id] = l; });
            setLeadsMap(map);
          });
      }
    }).catch(() => {});
    api.boardsForDepartment(dept.id).then((bs) => setBackendBoard(bs.find((b) => b.kind === "backend_queue") ?? null)).catch(() => {});
  }, [dept.id]);

  useEffect(() => { load(); }, [load]);

  const backend = users.filter((u) => u.position === "Бэкенд" || u.position === "Главный тех лид");
  const prompters = users.filter((u) => u.position === "Промпт-инженер" || u.position === "Тимлид");

  const filteredProjects = prompterFilter ? projects.filter((p) => p.owner_id === prompterFilter) : projects;
  const visibleProjects = filteredProjects.slice(0, projectPage * PROJECT_PAGE_SIZE);
  const hasMoreProjects = filteredProjects.length > visibleProjects.length;

  const deleteProject = projects.find(p => p.id === deleteProjectId);

  function setFilter(id: number | null) {
    setPrompterFilter(id);
    setProjectPage(1);
  }

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
  };

  async function quickUpdateProject(id: number, patch: Partial<Project>) {
    try {
      await api.updateProject(id, patch);
      load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <div className="page-h1">Отдел разработки</div>
          <div className="page-desc">Команда, проекты и очередь задач</div>
        </div>
        {isAdmin && (
          <Button icon="person_add" onClick={() => setUserModal(true)}>Сотрудник</Button>
        )}
      </div>

      {/* Backend team */}
      <SectionLabel>Backend-команда</SectionLabel>
      <div className="backend-row">
        {backend.map((u) => (
          <div key={u.id} className="backend-card card" onClick={() => router.push(`/team/${u.id}`)}>
            <div style={{ position: "relative" }}>
              <Avatar name={u.name} color={u.avatar_color} src={u.avatar_url} size={42} />
              <span className="sdot" style={{ background: u.is_online ? "var(--green)" : "var(--text3)" }} />
            </div>
            <div>
              <div className="bc-name">{u.name}</div>
              <div className="bc-role">{u.position}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Prompt engineers */}
      <SectionLabel style={{ marginTop: 34 }}>Промпт-инженеры</SectionLabel>
      <div className="prompters-grid">
        {prompters.map((u) => {
          const salary = calcSalary(projects, u.id);
          return (
            <div key={u.id} className="prompter-card card" onClick={() => router.push(`/team/${u.id}`)}>
              <div className="pc-head">
                <Avatar name={u.name} color={u.avatar_color} src={u.avatar_url} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pc-name">{u.name}{u.position === "Тимлид" && <span className="pill">Тимлид</span>}</div>
                  <div className="pc-role">{u.position}</div>
                </div>
                <span className="sdot-inline" style={{ background: u.is_online ? "var(--green)" : "var(--text3)" }} />
              </div>

              {/* Salary badge */}
              {salary > 0 && (
                <div style={{
                  margin: "10px 0 0", padding: "8px 12px", background: "var(--bg2)",
                  borderRadius: 8, border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Зарплата</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--green)", fontFamily: "JetBrains Mono, monospace" }}>
                    {salary.toLocaleString("ru-RU")} сом
                  </span>
                </div>
              )}

              {(u.position === "Промпт-инженер" || u.position === "Тимлид") && (
                <>
                  <div className="pc-divider" />
                  <div className="pc-stats">
                    <Stat v={u.total_bots} l="Всего" />
                    <Stat v={u.new_bots} l="Новых" c="var(--primary)" />
                    <Stat v={u.support_bots} l="Тех" c="var(--orange)" />
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Projects List */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 34, marginBottom: 14 }}>
        <SectionLabel style={{ margin: 0 }}>Проекты</SectionLabel>
        <Button variant="ghost" icon="add" onClick={() => { setEditingProject(null); setProjectModal(true); }}>
          Добавить проект
        </Button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div className={`chip ${prompterFilter === null ? "active" : ""}`} onClick={() => setFilter(null)}>Все ({projects.length})</div>
        {prompters.map((u) => {
          const cnt = projects.filter((p) => p.owner_id === u.id).length;
          const sal = calcSalary(projects, u.id);
          return (
            <div key={u.id} className={`chip ${prompterFilter === u.id ? "active" : ""}`}
              onClick={() => setFilter(u.id === prompterFilter ? null : u.id)}>
              {u.name} ({cnt}){sal > 0 && <span style={{ marginLeft: 6, fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--green)" }}>{sal.toLocaleString("ru-RU")} с</span>}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 8 }}></th>
                <th>Проект</th>
                <th>Статус</th>
                <th>Подстатус</th>
                <th style={{ textAlign: "right" }}>Цена</th>
                <th>Из сделки</th>
                <th>Подключён</th>
                <th>Сдан</th>
                <th>Промптер</th>
                <th>Комментарий</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.map((p) => {
                const col = BOT_COLORS[p.color as BotColor] ?? BOT_COLORS.green;
                const lead = p.lead_id ? leadsMap[p.lead_id] : null;
                return (
                  <tr key={p.id}>
                    <td style={{ padding: "0 0 0 14px" }}>
                      <span title={col.label} style={{
                        display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                        background: col.color, flexShrink: 0,
                      }} />
                    </td>
                    <td style={{ color: "var(--text)", fontWeight: 500 }}>{p.company}</td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>
                      {p.status === "new" && p.sub_status ? (
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5,
                          background: "var(--bg3)", color: "var(--text2)", border: "1px solid var(--border)" }}>
                          {p.sub_status}
                        </span>
                      ) : <span style={{ color: "var(--text3)" }}>—</span>}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--green)", fontWeight: 600 }}>
                      {p.price > 0 ? `${p.price.toLocaleString("ru-RU")}` : "—"}
                    </td>
                    <td style={{ minWidth: 160 }}>
                      {lead ? (
                        <Link href={`/leads/${lead.id}`} style={{ textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 8px", borderRadius: 5,
                            background: "var(--primary-dim)", color: "var(--primary)",
                            fontSize: 11, fontWeight: 500, cursor: "pointer",
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>link</span>
                            {lead.company_name || lead.client_name}
                            {lead.actual_amount > 0 && (
                              <span style={{ opacity: 0.8 }}>· {lead.actual_amount.toLocaleString("ru-RU")} с</span>
                            )}
                          </span>
                        </Link>
                      ) : <span style={{ color: "var(--text3)" }}>—</span>}
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{fmtDate(p.connected_at)}</td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                      {p.delivered_at ? (
                        <span style={{ color: "var(--green)", fontWeight: 600 }}>{fmtDate(p.delivered_at)}</span>
                      ) : <span style={{ color: "var(--text3)" }}>—</span>}
                    </td>
                    <td>
                      {p.owner ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <Avatar name={p.owner.name} color={p.owner.avatar_color} src={p.owner.avatar_url} size={22} /> {p.owner.name}
                        </span>
                      ) : <span style={{ color: "var(--text3)" }}>—</span>}
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      <span style={{ fontSize: 12, color: "var(--text3)", display: "-webkit-box",
                        WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {p.bot_comment || "—"}
                      </span>
                    </td>
                    {(isAdmin || p.owner_id === currentUser?.id) && (
                      <td style={{ width: 70 }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="row-act" onClick={() => { setEditingProject(p); setProjectModal(true); }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>edit</span>
                          </button>
                          {isAdmin && (
                            <button className="row-act" onClick={() => setDeleteProjectId(p.id)}>
                              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMoreProjects && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
                onClick={() => setProjectPage(p => p + 1)}>
                Загрузить ещё ({filteredProjects.length - visibleProjects.length})
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Backend queue */}
      <div className="queue-head">
        <div className="queue-title">Очередь задач бэкенда</div>
        <div className="queue-subtitle">Промптеры ставят задачи бэкендерам · колонки и карточки редактируемы</div>
      </div>
      {backendBoard && <BoardView boardId={backendBoard.id} />}

      <UserModal open={userModal} onClose={() => setUserModal(false)} onSaved={load} user={null} departments={departments} defaultDeptId={dept.id} />
      <ProjectModal open={projectModal} onClose={() => setProjectModal(false)} onSaved={load} project={editingProject} users={users} />

      <ConfirmModal
        open={deleteProjectId !== null}
        title="Удалить проект?"
        message={deleteProject ? `Проект «${deleteProject.company}» будет удалён без возможности восстановления.` : ""}
        confirmLabel="Удалить"
        variant="danger"
        onConfirm={async () => {
          if (deleteProjectId !== null) {
            await api.deleteProject(deleteProjectId).catch(() => {});
            setDeleteProjectId(null);
            load();
          }
        }}
        onCancel={() => setDeleteProjectId(null)}
      />

      <style jsx global>{`
        .backend-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
        .backend-card { display: flex; align-items: center; gap: 14px; padding: 16px; cursor: pointer; }
        .backend-card:hover { border-color: var(--border2); box-shadow: var(--shadow); }
        .bc-name { font-size: 14px; font-weight: 600; color: var(--text); }
        .bc-role { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
        .sdot { position: absolute; bottom: 0; right: 0; width: 11px; height: 11px; border-radius: 50%; border: 2px solid var(--bg2); }
        .sdot-inline { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .prompters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .prompter-card { padding: 20px; cursor: pointer; }
        .prompter-card:hover { border-color: var(--primary); box-shadow: var(--shadow); }
        .pc-head { display: flex; align-items: center; gap: 12px; }
        .pc-name { font-size: 15px; font-weight: 600; color: var(--text); display: flex; align-items: center; }
        .pc-role { font-size: 12px; color: var(--text3); margin-top: 2px; }
        .pill { font-size: 9px; padding: 2px 7px; border-radius: 10px; background: var(--primary-dim); color: var(--primary); font-weight: 600; margin-left: 8px; }
        .pc-divider { height: 1px; background: var(--border); margin: 16px 0; }
        .pc-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .pc-val { font-size: 22px; font-weight: 700; font-family: "JetBrains Mono", monospace; color: var(--text); line-height: 1; }
        .pc-lbl { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 5px; }
        .chip { padding: 6px 13px; border-radius: 20px; font-size: 12px; cursor: pointer; border: 1px solid var(--border); background: var(--bg2); color: var(--text2); transition: all 0.13s; display: inline-flex; align-items: center; }
        .chip:hover { border-color: var(--primary); color: var(--primary); }
        .chip.active { background: var(--primary-dim); border-color: var(--primary); color: var(--primary); font-weight: 500; }
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table thead { background: var(--bg3); }
        .data-table th { padding: 11px 16px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text3); border-bottom: 1px solid var(--border); }
        .data-table td { padding: 13px 16px; font-size: 13px; border-bottom: 1px solid var(--border); color: var(--text2); }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tbody tr:hover td { background: var(--bg-hover); }
        .row-act { width: 28px; height: 28px; border: none; background: transparent; color: var(--text3); border-radius: 5px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .row-act:hover { background: var(--bg3); color: var(--text); }
        .section-label { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); margin-bottom: 14px; }
        .queue-head { margin-top: 32px; text-align: center; }
        .queue-title { font-size: 16px; font-weight: 500; color: var(--text); }
        .queue-subtitle { font-size: 13px; color: var(--text2); margin-top: 4px; margin-bottom: 20px; }
      `}</style>
    </div>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div className="section-label" style={style}>{children}</div>;
}
function Stat({ v, l, c }: { v: number; l: string; c?: string }) {
  return <div><div className="pc-val" style={{ color: c }}>{v}</div><div className="pc-lbl">{l}</div></div>;
}
function StatusBadge({ status }: { status: ProjectStatus }) {
  const isNew = status === "new";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600,
      background: isNew ? "var(--primary-dim)" : "var(--orange-bg)", color: isNew ? "var(--primary)" : "var(--orange)" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
      {STATUS_LABELS[status]}
    </span>
  );
}
