"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Avatar } from "@/components/Avatar";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";
import type { UserWithStats, Project, Department } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useApp();
  const router = useRouter();
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [servers, setServers] = useState<Project[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);

  useEffect(() => {
    if (!user) return;
    api.listUsers().then(setUsers).catch(() => {});
    api.listProjects().then(setServers).catch(() => {});
    api.listDepartments().then(setDepts).catch(() => {});
  }, [user]);

  const supBots = servers.filter((s) => s.status === "support").length;
  const newBots = servers.filter((s) => s.status === "new").length;
  const online = users.filter((u) => u.is_online).length;

  // dev team for the side panel
  const devDept = depts.find((d) => d.kind === "dev");
  const [devTeam, setDevTeam] = useState<UserWithStats[]>([]);
  useEffect(() => {
    if (devDept) api.listUsers(devDept.id).then(setDevTeam).catch(() => {});
  }, [devDept]);

  return (
    <Shell>
      <div className="page-head">
        <div className="page-h1">Привет, {user?.name} 👋</div>
        <div className="page-desc">Обзор инфраструктуры NevOcean на сегодня</div>
      </div>

      <div className="stat-row">
        <StatCard label="Активных ботов" value={servers.length} icon="smart_toy" trend="боты в работе" />
        <StatCard label="Тех поддержка" value={supBots} icon="build" sub="Требуют внимания" subColor="var(--orange)" />
        <StatCard label="Команда онлайн" value={`${online}/${users.length}`} icon="bolt" trend="Активны сейчас" />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Отделы</span>
          </div>
          <div className="dept-list">
            {depts.filter((d) => !d.admin_only).map((d) => (
              <div key={d.id} className="dept-row" onClick={() => router.push(`/dept/${d.slug}`)}>
                <span className="dept-ico"><span className="material-symbols-outlined" style={{ fontSize: 19 }}>{d.icon}</span></span>
                <span style={{ flex: 1, fontWeight: 500, color: "var(--text)" }}>{d.name}</span>
                <span className="material-symbols-outlined" style={{ color: "var(--text3)", fontSize: 18 }}>chevron_right</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-head"><span className="card-title">Статусы ботов</span></div>
            <div className="side-list">
              <div className="side-row"><span><Dot c="var(--green)" /> Новый бот</span><span className="side-num">{newBots}</span></div>
              <div className="side-row"><span><Dot c="var(--orange)" /> Тех поддержка</span><span className="side-num">{supBots}</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Разработка</span>
              {devDept && <span className="card-link" onClick={() => router.push(`/dept/${devDept.slug}`)}>Открыть →</span>}
            </div>
            <div className="side-list">
              {devTeam.slice(0, 8).map((u) => (
                <div key={u.id} className="side-row clickable" onClick={() => router.push(`/team/${u.id}`)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={u.name} color={u.avatar_color} src={u.avatar_url} size={24} /> {u.name}
                  </span>
                  <Dot c={u.is_online ? "var(--green)" : "var(--text3)"} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { padding: 20px; }
        .stat-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .stat-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
        .stat-ico { width: 34px; height: 34px; border-radius: 8px; background: var(--primary-dim); color: var(--primary); display: flex; align-items: center; justify-content: center; }
        .stat-value { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); line-height: 1; }
        .stat-foot { font-size: 12px; margin-top: 8px; }
        .dash-grid { display: grid; grid-template-columns: 1fr 340px; gap: 16px; }
        .card-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border); }
        .card-title { font-size: 14px; font-weight: 600; color: var(--text); }
        .card-link { font-size: 12px; color: var(--primary); cursor: pointer; font-weight: 500; }
        .card-link:hover { opacity: 0.8; }
        .dept-list { padding: 8px; }
        .dept-row { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 8px; cursor: pointer; transition: background 0.13s; }
        .dept-row:hover { background: var(--bg-hover); }
        .dept-ico { width: 34px; height: 34px; border-radius: 8px; background: var(--bg3); color: var(--text2); display: flex; align-items: center; justify-content: center; }
        .side-list { padding: 10px; }
        .side-row { display: flex; align-items: center; justify-content: space-between; padding: 8px; border-radius: 6px; font-size: 13px; }
        .side-row span:first-child { display: flex; align-items: center; gap: 8px; color: var(--text); font-weight: 500; }
        .side-row.clickable { cursor: pointer; }
        .side-row.clickable:hover { background: var(--bg-hover); }
        .side-num { font-family: "JetBrains Mono", monospace; font-size: 12px; color: var(--text3); }
      `}</style>
    </Shell>
  );
}

function Dot({ c }: { c: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />;
}
function StatCard({ label, value, icon, trend, sub, subColor }: any) {
  return (
    <div className="stat-card card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className="stat-ico"><span className="material-symbols-outlined" style={{ fontSize: 19 }}>{icon}</span></span>
      </div>
      <div className="stat-value">{value}</div>
      {trend && <div className="stat-foot" style={{ color: "var(--green)" }}>● {trend}</div>}
      {sub && <div className="stat-foot" style={{ color: subColor || "var(--text3)" }}>{sub}</div>}
    </div>
  );
}
