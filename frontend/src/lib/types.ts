// ───────────────────── CRM Lookups ─────────────────────────────

export interface LeadSource {
  id: number;
  name: string;
  is_active: boolean;
  position: number;
}

export interface ServiceItem {
  id: number;
  name: string;
  is_active: boolean;
  position: number;
}

export interface LeadStage {
  id: number;
  name: string;
  position: number;
  norm_days: number | null;
  is_won: boolean;
  is_lost: boolean;
  color: string;
}

export interface RejectReason {
  id: number;
  name: string;
  is_active: boolean;
  position: number;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  is_active: boolean;
  position: number;
}

export interface Account {
  id: number;
  name: string;
  currency: string;
  is_active: boolean;
  position: number;
}

// ─────────────────────────────────────────────────────────────────

export type Role = "admin" | "staff";
export type ProjectStatus = "new" | "support";
/** @deprecated use ProjectStatus */
export type ServerStatus = ProjectStatus;
export type Priority = "low" | "med" | "high";

export interface User {
  id: number;
  name: string;
  email: string;
  position: string;
  avatar_color: string;
  role: Role;
  is_founder: boolean;
  is_active: boolean;
  last_seen: string | null;
  created_at: string;
}

export interface UserWithStats extends User {
  total_bots: number;
  new_bots: number;
  support_bots: number;
  department_ids: number[];
  is_online: boolean;       // computed: last_seen < 5min
  last_seen_label: string | null;  // "5 мин назад"
}

export interface Department {
  id: number;
  name: string;
  slug: string;
  icon: string;
  admin_only: boolean;
  kind: string;
  content: string;
  embed_url: string;
}

export type BotColor = "red" | "yellow" | "blue" | "green";

export const BOT_SUB_STATUSES = [
  "Сбор информации",
  "Разработка",
  "Тест",
  "Сдан",
] as const;

export const BOT_COLORS: Record<BotColor, { label: string; color: string; bg: string }> = {
  red:    { label: "Проблемный",      color: "#e03b3b", bg: "rgba(224,59,59,0.12)" },
  yellow: { label: "В разработке",    color: "#ca8a04", bg: "rgba(202,138,4,0.12)" },
  blue:   { label: "Заморожен",       color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  green:  { label: "Всё отлично",     color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
};

export interface Project {
  id: number;
  company: string;
  status: ProjectStatus;
  sub_status: string | null;
  price: number;
  color: BotColor;
  bot_comment: string;
  connected_at: string | null;
  delivered_at: string | null;
  notes: string;
  owner_id: number | null;
  lead_id: number | null;
  owner: User | null;
  created_at: string;
}
/** @deprecated use Project */
export type Server = Project;

export interface BoardColumn {
  id: number;
  name: string;
  color: string;
  position: number;
  is_done: boolean;
}

export interface Board {
  id: number;
  name: string;
  kind: string;
  owner_id: number | null;
  department_id: number | null;
  columns: BoardColumn[];
}

export interface Task {
  id: number;
  title: string;
  description: string;
  tag: string;
  tag_color: string;
  priority: Priority;
  due_date: string | null;
  completed_at: string | null;
  position: number;
  board_id: number;
  column_id: number | null;
  owner_id: number | null;
  owner: User | null;
  requester_id: number | null;
  requester: User | null;
  assignee_ids: number[];
  task_type: string;
  created_at: string;
}

export interface ColumnDef {
  id: number;
  key: string;
  label: string;
  kind: string;
  position: number;
}

export interface SalesRecord {
  id: number;
  user_id: number | null;
  record_date: string;
  metrics: Record<string, any>;
  user: User | null;
}

export interface MarketingRecord {
  id: number;
  user_id: number | null;
  record_date: string;
  fields: Record<string, any>;
  user: User | null;
}

export interface AdExpense {
  id: number;
  date: string;
  source_id: number | null;
  ad_account: string;
  campaign_name: string;
  amount: number;
  currency: string;
  responsible_id: number | null;
  comment: string;
  created_at: string;
  source: { id: number; name: string } | null;
  responsible: { id: number; name: string } | null;
}

export interface SourceMetric {
  source_id: number;
  source_name: string;
  spend: number;
  leads_count: number;
  paid_count: number;
  revenue: number;
  cpl: number;
  cac: number;
  romi: number | null;
  conversion_pct: number;
}

export interface MarketingTotals {
  spend_today: number;
  spend_month: number;
  spend_period: number;
  leads_total: number;
  paid_count: number;
  revenue: number;
  cpl: number;
  cac: number;
  romi: number | null;
}

export interface MarketingMetrics {
  by_source: SourceMetric[];
  totals: MarketingTotals;
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  new: "Новый проект",
  support: "Тех поддержка",
};

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "low", label: "Низкий" },
  { value: "med", label: "Средний" },
  { value: "high", label: "Высокий" },
];

export const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "new", label: "Новый проект" },
  { value: "support", label: "Тех поддержка" },
];

// Tag color presets for tasks
export const TAG_COLORS: { value: string; label: string; bg: string; fg: string }[] = [
  { value: "indigo", label: "Индиго", bg: "var(--primary-dim)", fg: "var(--primary)" },
  { value: "green", label: "Зелёный", bg: "var(--green-bg)", fg: "var(--green)" },
  { value: "orange", label: "Оранжевый", bg: "var(--orange-bg)", fg: "var(--orange)" },
  { value: "yellow", label: "Жёлтый", bg: "rgba(202,138,4,0.12)", fg: "var(--yellow)" },
  { value: "red", label: "Красный", bg: "var(--red-bg)", fg: "var(--red)" },
];

export const AVATAR_COLORS: Record<string, { bg: string; fg: string }> = {
  indigo: { bg: "rgba(70,72,212,0.16)", fg: "#4648d4" },
  green: { bg: "rgba(22,163,74,0.15)", fg: "#16a34a" },
  orange: { bg: "rgba(181,93,0,0.15)", fg: "#b55d00" },
  yellow: { bg: "rgba(202,138,4,0.15)", fg: "#ca8a04" },
  red: { bg: "rgba(186,26,26,0.12)", fg: "#ba1a1a" },
};

export function tagColorStyle(color: string) {
  return TAG_COLORS.find((c) => c.value === color) ?? TAG_COLORS[0];
}

// ===== Meetings =====
export type MeetingStatus = "scheduled" | "closed" | "minus" | "push" | "rescheduled";

export interface Meeting {
  id: number;
  closer_id: number | null;
  setter_id: number | null;
  meeting_date: string;
  address: string;
  client_name: string;
  client_phone: string;
  status: MeetingStatus;
  notes: string;
  parent_id: number | null;
  created_at: string;
  closer: User | null;
  setter: User | null;
  sub_meetings: Meeting[];
}

export const MEETING_STATUS: Record<MeetingStatus, { label: string; color: string; bg: string }> = {
  scheduled:  { label: "Запланирована", color: "var(--primary)",  bg: "var(--primary-dim)" },
  closed:     { label: "Закрыт",        color: "var(--green)",    bg: "var(--green-bg)" },
  minus:      { label: "Минус",         color: "var(--red)",      bg: "var(--red-bg)" },
  push:       { label: "Дожим",         color: "var(--yellow)",   bg: "rgba(202,138,4,0.12)" },
  rescheduled:{ label: "Перенёс",       color: "var(--text3)",    bg: "var(--bg3)" },
};

// ===== Bug Reports =====
export type BugStatus = "new" | "in_progress" | "resolved";
export type BugPriority = "low" | "medium" | "high" | "critical";

export interface BugReport {
  id: number;
  reporter_id: number | null;
  title: string;
  description: string;
  status: BugStatus;
  priority: BugPriority;
  created_at: string;
  reporter: User | null;
}

export const BUG_STATUS: Record<BugStatus, { label: string; color: string; bg: string }> = {
  new:         { label: "Новый",     color: "var(--primary)", bg: "var(--primary-dim)" },
  in_progress: { label: "В работе",  color: "var(--yellow)",  bg: "rgba(202,138,4,0.12)" },
  resolved:    { label: "Решён",     color: "var(--green)",   bg: "var(--green-bg)" },
};

export const BUG_PRIORITY: Record<BugPriority, { label: string; color: string }> = {
  low:      { label: "Низкий",    color: "var(--text3)" },
  medium:   { label: "Средний",   color: "var(--yellow)" },
  high:     { label: "Высокий",   color: "var(--orange, #e67e22)" },
  critical: { label: "Критичный", color: "var(--red)" },
};

// ===== Leads =====
export type LeadStatusType = "active" | "archived";

export interface Deal {
  id: number;
  lead_id: number;
  amount: number;
  paid_amount: number;
  payment_date: string | null;
  payment_method: string;
  status: "pending" | "paid";
  setter_id: number | null;
  closer_id: number | null;
  deal_type: string;
  contract_sent_at: string | null;
  expected_payment_date: string | null;
  responsible_id: number | null;
  setter_commission: number;
  closer_commission: number;
  created_at: string;
  updated_at: string;
}

// ===== Finance =====

export interface FinanceTransaction {
  id: number;
  type: "income" | "expense";
  category: string | null;
  amount: number;
  date: string;
  related_lead_id: number | null;
  related_deal_id: number | null;
  account_id: number | null;
  responsible_id: number | null;
  payment_method: string;
  comment: string;
  created_at: string;
  responsible: { id: number; name: string } | null;
}

export interface Debt {
  id: number;
  counterparty: string;
  direction: "we_owe" | "owed_to_us";
  amount: number;
  created_date: string;
  due_date: string | null;
  status: "active" | "partial" | "paid" | "overdue";
  comment: string;
  created_at: string;
}

export interface AccountBalance {
  id: number;
  account_id: number;
  date: string;
  balance: number;
  comment: string;
  created_at: string;
  account: { id: number; name: string } | null;
}

export interface FinanceSummary {
  income: number;
  expenses: number;
  profit: number;
  fot: number;
  marketing_expenses: number;
  returns: number;
  we_owe: number;
  owed_to_us: number;
  total_on_accounts: number;
  plan_income_30d: number;
  account_balances: AccountBalance[];
  cashflow_forecast: {
    days_7: number;
    days_14: number;
    days_30: number;
    warning_7: boolean;
    warning_14: boolean;
    warning_30: boolean;
  };
}

// ===== Payroll =====

export interface PayrollRule {
  id: number;
  employee_id: number;
  base_salary: number;
  commission_percent: number;
  commission_condition: "none" | "from_setter" | "closer_self" | "any";
  active_from: string;
  active_to: string | null;
  created_at: string;
  employee: { id: number; name: string } | null;
}

export interface PayrollRecord {
  id: number;
  employee_id: number;
  period_start: string;
  period_end: string;
  base_salary: number;
  commission_amount: number;
  bonus_amount: number;
  penalty_amount: number;
  total_amount: number;
  status: "draft" | "paid";
  created_at: string;
  employee: { id: number; name: string } | null;
}

export interface DevBotLine {
  project_id: number;
  company: string;
  delivered_at: string | null;
  price: number;
  in_free_limit: boolean;
}

export interface DevBreakdown {
  kind: "prompter" | "teamlead" | "backender";
  bots?: DevBotLine[];
  support_count?: number;
  support_price?: number;
  support_total?: number;
  free_bots_limit?: number;
}

export interface PayrollCalculation {
  employee_id: number;
  period_start: string;
  period_end: string;
  base_salary: number;
  commission_amount: number;
  bonus_amount: number;
  penalty_amount: number;
  total_amount: number;
  deals: {
    deal_id: number;
    role: "setter" | "closer";
    deal_amount: number;
    commission: number;
    payment_date: string | null;
    deal_type: string;
  }[];
  dev_breakdown?: DevBreakdown;
}

export interface DevPayrollConfig {
  id: number;
  role_kind: "prompter" | "teamlead";
  new_bot_price: number;
  support_price: number;
  base_salary: number;
  free_bots_limit: number;
  updated_at: string;
}

export interface Lead {
  id: number;
  client_name: string;
  company_name: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  email: string;
  address: string;
  website: string;
  industry: string;
  employees_count: number | null;
  source_id: number | null;
  service_id: number | null;
  stage_id: number | null;
  setter_id: number | null;
  closer_id: number | null;
  potential_amount: number;
  actual_amount: number;
  status: LeadStatusType;
  next_action_type: string;
  next_action_at: string | null;
  comment: string;
  reject_reason_id: number | null;
  reject_comment: string;
  created_at: string;
  updated_at: string;
  source: LeadSource | null;
  service: ServiceItem | null;
  stage: LeadStage | null;
  setter: User | null;
  closer: User | null;
  active_deal: Deal | null;
}

export interface FunnelCard extends Lead {
  days_in_stage: number;
}

export interface FunnelStats {
  new_leads: number;
  meetings_stage: number;
  contracts_sent: number;
  waiting_payment: number;
  closed_won: number;
  conversion_pct: number;
  potential_sum: number;
}

export interface FunnelResponse {
  leads: FunnelCard[];
  stages: LeadStage[];
}

export interface LeadActivity {
  id: number;
  lead_id: number;
  activity_type: string;
  channel: string;
  description: string;
  responsible_id: number | null;
  responsible: User | null;
  created_at: string;
}

export interface LeadStageHistory {
  id: number;
  lead_id: number;
  from_stage_id: number | null;
  to_stage_id: number | null;
  changed_by: number | null;
  comment: string;
  created_at: string;
}

export interface LeadFile {
  id: number;
  lead_id: number;
  name: string;
  url: string;
  file_type: string;
  uploaded_by: number | null;
  uploader: User | null;
  created_at: string;
}

export interface LeadDetail extends Lead {
  stage_history: LeadStageHistory[];
  activities: LeadActivity[];
  meetings: {
    id: number;
    meeting_date: string;
    client_name: string;
    status: string;
    closer: User | null;
    setter: User | null;
  }[];
  tasks: {
    id: number;
    title: string;
    priority: string;
    due_date: string | null;
    completed_at: string | null;
    owner: User | null;
  }[];
  files: LeadFile[];
  timeline: {
    type: string;
    label: string;
    description: string;
    at: string | null;
    icon: string;
    by?: string;
  }[];
}

export interface LeadListResponse {
  items: Lead[];
  total: number;
}

export interface LeadStats {
  leads_today: number;
  leads_period: number;
  meetings_period: number;
  closed_won: number;
  conversion_pct: number;
  potential_sum: number;
  cpl: number | null;
}

export const ACTIVITY_TYPES = [
  "Звонок исходящий",
  "Звонок входящий",
  "WhatsApp",
  "Instagram",
  "Email",
  "Встреча",
  "Договор отправлен",
  "Оплата получена",
  "Комментарий",
] as const;

export const FILE_TYPES = ["КП", "Договор", "ТЗ", "Счёт", "Бриф", "Другое"] as const;

// ===== END Leads =====

export interface SalesSummary {
  setters: { user: User | null; totals: Record<string, number> }[];
  closers: { user: User | null; counts: Record<string, number>; total: number }[];
  col_defs: { key: string; label: string }[];
}

// ===== Analytics =====

export interface DashboardMetrics {
  leads_today: number;
  leads_yesterday: number;
  leads_month: number;
  meetings_scheduled: number;
  meetings_conducted: number;
  sales_yesterday: number;
  sales_month: number;
  revenue_month: number;
  plan_revenue_month: number;
  revenue_vs_plan_pct: number | null;
  cpl: number;
  cac: number;
  total_on_accounts: number;
  pending_amount: number;
  pending_count: number;
  waiting_leads_amount: number;
  expenses_month: number;
  fot_month: number;
  profit_month: number;
  avg_check: number;
  conv_lead_meeting_pct: number;
  conv_meeting_sale_pct: number;
  conv_lead_sale_pct: number;
  cashflow_7d: number;
  cashflow_30d: number;
  cashflow_warning: boolean;
}

export interface DailyPoint {
  date: string;
  leads: number;
  meetings: number;
  sales: number;
  revenue: number;
}

export interface FunnelPoint {
  stage_id: number;
  stage_name: string;
  count: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
}

export interface PiePoint {
  name: string;
  count?: number;
  pct?: number;
  amount?: number;
}

export interface ChartsData {
  daily: DailyPoint[];
  funnel: FunnelPoint[];
  sources_pie: PiePoint[];
  expense_categories: PiePoint[];
  revenue_by_service: { name: string; revenue: number; count: number }[];
}

export interface Problem {
  severity: "error" | "warning" | "critical";
  message: string;
  link: string | null;
}

export interface KpiMetric {
  key: string;
  label: string;
  unit: string;
  plan: number;
  fact: number;
  pct: number | null;
  higher_is_better: boolean;
}

export interface KpiPlanFact {
  year: number;
  month: number;
  plan_id: number | null;
  metrics: KpiMetric[];
}

export interface MonthlyPlan {
  id: number;
  year: number;
  month: number;
  plan_revenue: number;
  plan_leads: number;
  plan_meetings: number;
  plan_sales: number;
  plan_cpl: number;
  plan_cac: number;
  plan_expenses: number;
}


export interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  revoked: boolean;
}

export interface ApiKeyCreated extends ApiKey {
  plain_key: string;
}

// ─────────────────────────── NevoLabs ───────────────────────────

export type LabProjectStatus = "Идея" | "В разработке" | "Запущен" | "Заморожен";

export const LAB_PROJECT_STATUSES: { value: LabProjectStatus; label: string; color: string; bg: string }[] = [
  { value: "Идея",         label: "Идея",         color: "var(--text3)",   bg: "var(--bg3)" },
  { value: "В разработке", label: "В разработке", color: "var(--primary)", bg: "var(--primary-dim)" },
  { value: "Запущен",      label: "Запущен",      color: "var(--green)",   bg: "var(--green-bg)" },
  { value: "Заморожен",    label: "Заморожен",    color: "var(--orange)",  bg: "var(--orange-bg)" },
];

export interface LabProjectMember {
  id: number;
  lab_project_id: number;
  user_id: number;
  user: User | null;
}

export interface LabProject {
  id: number;
  name: string;
  description: string;
  status: LabProjectStatus;
  board_id: number | null;
  is_archived: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  members: LabProjectMember[];
  creator: User | null;
  user_can_manage: boolean;
}
