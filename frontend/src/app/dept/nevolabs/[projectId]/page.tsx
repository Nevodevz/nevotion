"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { BoardView } from "@/components/BoardView";
import { Avatar } from "@/components/Avatar";
import { labProjectApi } from "@/lib/api";
import { LabProject, LabProjectStatus, LAB_PROJECT_STATUSES } from "@/lib/types";
import { useApp } from "@/context/AppContext";

function StatusBadge({ status }: { status: LabProjectStatus }) {
  const s = LAB_PROJECT_STATUSES.find((x) => x.value === status) ?? LAB_PROJECT_STATUSES[0];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px",
      borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

export default function LabProjectKanbanPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = Number(params.projectId);
  const { user: currentUser, isFounder, isAdmin } = useApp();

  const [project, setProject] = useState<LabProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    labProjectApi.get(projectId)
      .then(setProject)
      .catch((e) => {
        if (String(e.message).includes("403") || String(e.message).includes("доступ")) {
          setDenied(true);
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const canViewBoard = project
    ? (isFounder || isAdmin || project.members.some((m) => m.user_id === currentUser?.id))
    : false;

  function render() {
    if (loading) return <div style={{ color: "var(--text3)", padding: "60px 0", textAlign: "center" }}>Загрузка…</div>;
    if (denied) return (
      <Empty icon="lock" title="Нет доступа" desc="Доступ к этому проекту ограничен. Участники проекта, члены NevoLabs и основатели." />
    );
    if (error || !project) return (
      <Empty icon="error_outline" title="Проект не найден" desc={error ?? "Проект не существует или был удалён."} />
    );

    return (
      <div>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontSize: 13, color: "var(--text3)" }}>
          <Link href="/dept/nevolabs" style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}>
            NevoLabs
          </Link>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
          <span style={{ color: "var(--text)" }}>{project.name}</span>
        </div>

        {/* Project header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{project.name}</h1>
              <StatusBadge status={project.status as LabProjectStatus} />
            </div>
            {project.description && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--text2)", lineHeight: 1.6, maxWidth: 640 }}>
                {project.description}
              </p>
            )}
            {project.members.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: "var(--text3)", fontWeight: 500 }}>Участники:</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {project.members.map((m) => m.user && (
                    <div key={m.id} title={m.user.name}>
                      <Avatar name={m.user.name} color={m.user.avatar_color} src={m.user.avatar_url} size={28} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => router.push("/dept/nevolabs")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg3)",
              border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px",
              color: "var(--text2)", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
              flexShrink: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>arrow_back</span>
            Назад
          </button>
        </div>

        {/* Kanban board */}
        {project.board_id && canViewBoard ? (
          <BoardView boardId={project.board_id} canEdit={project.user_can_manage} />
        ) : !canViewBoard ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text3)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, marginBottom: 8, display: "block" }}>lock</span>
            <div style={{ fontSize: 14 }}>Доступ к доске ограничен</div>
          </div>
        ) : (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text3)" }}>
            <div style={{ fontSize: 14 }}>Доска не создана для этого проекта</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Shell title={project?.name ?? "NevoLabs"}>
      {render()}
    </Shell>
  );
}

function Empty({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 20px", textAlign: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 30, color: "var(--text3)" }}>{icon}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 6, maxWidth: 360 }}>{desc}</div>
    </div>
  );
}
