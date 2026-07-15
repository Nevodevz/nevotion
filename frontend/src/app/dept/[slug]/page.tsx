"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Department } from "@/lib/types";
import { DevDepartmentView } from "@/components/departments/DevDepartmentView";
import { SalesDepartmentView } from "@/components/departments/SalesDepartmentView";
import { NevoLabsDepartmentView } from "@/components/departments/NevoLabsDepartmentView";
import {
  MarketingDepartmentView, FinanceDepartmentView, AboutDepartmentView,
  QccDepartmentView, HiddenDepartmentView,
} from "@/components/departments/OtherDepartmentViews";

export default function DeptPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [dept, setDept] = useState<Department | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    setLoading(true); setDenied(false);
    api.getDepartment(slug)
      .then(setDept)
      .catch((e) => { if (String(e.message).includes("основателей") || String(e.message).includes("403")) setDenied(true); })
      .finally(() => setLoading(false));
    api.listDepartments().then(setDepartments).catch(() => {});
  }, [slug]);

  function render() {
    if (loading) return <div style={{ color: "var(--text3)" }}>Загрузка…</div>;
    if (denied) return <Empty title="Доступ ограничен" desc="Этот раздел доступен только основателям." icon="lock" />;
    if (!dept) return <Empty title="Раздел не найден" desc="Возможно, у вас нет доступа." icon="folder_off" />;
    switch (dept.kind) {
      case "dev": return <DevDepartmentView dept={dept} departments={departments} />;
      case "sales": return <SalesDepartmentView dept={dept} departments={departments} />;
      case "marketing": return <MarketingDepartmentView dept={dept} departments={departments} />;
      case "finance": return <FinanceDepartmentView dept={dept} departments={departments} />;
      case "about": return <AboutDepartmentView dept={dept} departments={departments} />;
      case "qcc": return <QccDepartmentView dept={dept} departments={departments} />;
      case "hidden": return <HiddenDepartmentView />;
      case "nevolabs": return <NevoLabsDepartmentView dept={dept} departments={departments} />;
      default: return <Empty title={dept.name} desc="Раздел в разработке." icon={dept.icon} />;
    }
  }

  return <Shell title={dept?.name ?? "Отдел"}>{render()}</Shell>;
}

function Empty({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", textAlign: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--bg3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 30, color: "var(--text3)" }}>{icon}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 6, maxWidth: 360 }}>{desc}</div>
    </div>
  );
}
