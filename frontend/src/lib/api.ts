import type {
  User, UserWithStats, Project, Task, Department, Board, BoardColumn,
  ProjectStatus, ColumnDef, SalesRecord, MarketingRecord,
} from "./types";

const TOKEN_KEY = "nevodevs_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка запроса" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  async login(email: string, password: string): Promise<string> {
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Ошибка входа" }));
      throw new Error(err.detail || "Неверный email или пароль");
    }
    const data = await res.json();
    setToken(data.access_token);
    return data.access_token;
  },
  me: () => request<User>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // users
  listUsers: (deptId?: number, includeArchived = false) => {
    const p = new URLSearchParams();
    if (deptId) p.set("department_id", String(deptId));
    if (includeArchived) p.set("include_archived", "true");
    const qs = p.toString();
    return request<UserWithStats[]>(`/users${qs ? "?" + qs : ""}`);
  },
  getUser: (id: number) => request<UserWithStats>(`/users/${id}`),
  createUser: (data: any) => request<User>("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: number, data: any) => request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteUser: (id: number) => request<any>(`/users/${id}/archive`, { method: "POST" }),
  archiveUser: (id: number) => request<any>(`/users/${id}/archive`, { method: "POST" }),
  restoreUser: (id: number) => request<any>(`/users/${id}/restore`, { method: "POST" }),
  reassignBots: (fromId: number, toId: number) => request<any>(`/users/${fromId}/reassign-bots?new_owner_id=${toId}`, { method: "POST" }),
  userBotsCount: (id: number) => request<{ count: number }>(`/users/${id}/bots-count`),

  // departments
  listDepartments: () => request<Department[]>("/departments"),
  getDepartment: (slug: string) => request<Department>(`/departments/${slug}`),
  updateDepartment: (id: number, data: any) => request<Department>(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  // projects
  listProjects: (filters?: { status?: ProjectStatus; owner_id?: number }) => {
    const p = new URLSearchParams();
    if (filters?.status) p.set("status", filters.status);
    if (filters?.owner_id) p.set("owner_id", String(filters.owner_id));
    const qs = p.toString();
    return request<Project[]>(`/projects${qs ? "?" + qs : ""}`);
  },
  createProject: (data: any) => request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: number, data: any) => request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  // legacy aliases kept for compatibility during transition
  listServers: (filters?: { status?: ProjectStatus; owner_id?: number }) => {
    const p = new URLSearchParams();
    if (filters?.status) p.set("status", filters.status);
    if (filters?.owner_id) p.set("owner_id", String(filters.owner_id));
    const qs = p.toString();
    return request<Project[]>(`/projects${qs ? "?" + qs : ""}`);
  },
  createServer: (data: any) => request<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  updateServer: (id: number, data: any) => request<Project>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteServer: (id: number) => request<void>(`/projects/${id}`, { method: "DELETE" }),

  // boards
  getPersonalBoard: (userId: number) => request<Board>(`/boards/personal/${userId}`),
  getBoard: (id: number) => request<Board>(`/boards/${id}`),
  boardsForDepartment: (deptId: number) => request<Board[]>(`/boards/by-department/${deptId}`),
  addColumn: (boardId: number, data: { name: string; color?: string; is_done?: boolean }) =>
    request<BoardColumn>(`/boards/${boardId}/columns`, { method: "POST", body: JSON.stringify(data) }),
  updateColumn: (colId: number, data: any) => request<BoardColumn>(`/boards/columns/${colId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteColumn: (colId: number) => request<void>(`/boards/columns/${colId}`, { method: "DELETE" }),

  // tasks
  listTasks: (boardId: number, assigneeId?: number) => {
    const qs = assigneeId ? `&assignee_id=${assigneeId}` : "";
    return request<Task[]>(`/tasks?board_id=${boardId}${qs}`);
  },
  createTask: (data: any) => request<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: number, data: any) => request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  moveTask: (id: number, column_id: number, position: number) =>
    request<Task>(`/tasks/${id}/move`, { method: "PATCH", body: JSON.stringify({ column_id, position }) }),
  completeTask: (id: number) => request<Task>(`/tasks/${id}/complete`, { method: "PATCH" }),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: "DELETE" }),

  // sales
  salesColumns: () => request<ColumnDef[]>("/sales/columns"),
  addSalesColumn: (data: { label: string; kind?: string }) => request<ColumnDef>("/sales/columns", { method: "POST", body: JSON.stringify(data) }),
  deleteSalesColumn: (id: number) => request<void>(`/sales/columns/${id}`, { method: "DELETE" }),
  salesRecords: (f?: { user_id?: number; date_from?: string; date_to?: string }) => {
    const p = new URLSearchParams();
    if (f?.user_id) p.set("user_id", String(f.user_id));
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    const qs = p.toString();
    return request<SalesRecord[]>(`/sales/records${qs ? "?" + qs : ""}`);
  },
  createSalesRecord: (data: any) => request<SalesRecord>("/sales/records", { method: "POST", body: JSON.stringify(data) }),
  updateSalesRecord: (id: number, data: any) => request<SalesRecord>(`/sales/records/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSalesRecord: (id: number) => request<void>(`/sales/records/${id}`, { method: "DELETE" }),

  // marketing
  marketingColumns: () => request<ColumnDef[]>("/marketing/columns"),
  addMarketingColumn: (data: { label: string; kind?: string }) => request<ColumnDef>("/marketing/columns", { method: "POST", body: JSON.stringify(data) }),
  deleteMarketingColumn: (id: number) => request<void>(`/marketing/columns/${id}`, { method: "DELETE" }),
  marketingRecords: (f?: { date_from?: string; date_to?: string }) => {
    const p = new URLSearchParams();
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    const qs = p.toString();
    return request<MarketingRecord[]>(`/marketing/records${qs ? "?" + qs : ""}`);
  },
  createMarketingRecord: (data: any) => request<MarketingRecord>("/marketing/records", { method: "POST", body: JSON.stringify(data) }),
  updateMarketingRecord: (id: number, data: any) => request<MarketingRecord>(`/marketing/records/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteMarketingRecord: (id: number) => request<void>(`/marketing/records/${id}`, { method: "DELETE" }),

  // ad expenses
  adExpenses: (f?: { source_id?: number; date_from?: string; date_to?: string; campaign?: string; skip?: number; limit?: number }) => {
    const p = new URLSearchParams();
    if (f?.source_id) p.set("source_id", String(f.source_id));
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    if (f?.campaign) p.set("campaign", f.campaign);
    if (f?.skip) p.set("skip", String(f.skip));
    if (f?.limit) p.set("limit", String(f.limit));
    const qs = p.toString();
    return request<{ items: import("./types").AdExpense[]; total: number }>(`/marketing/ad-expenses${qs ? "?" + qs : ""}`);
  },
  createAdExpense: (data: any) => request<import("./types").AdExpense>("/marketing/ad-expenses", { method: "POST", body: JSON.stringify(data) }),
  updateAdExpense: (id: number, data: any) => request<import("./types").AdExpense>(`/marketing/ad-expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAdExpense: (id: number) => request<void>(`/marketing/ad-expenses/${id}`, { method: "DELETE" }),
  marketingMetrics: (f?: { date_from?: string; date_to?: string }) => {
    const p = new URLSearchParams();
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    const qs = p.toString();
    return request<import("./types").MarketingMetrics>(`/marketing/metrics${qs ? "?" + qs : ""}`);
  },

  // sales column reorder
  reorderSalesColumn: (id: number, direction: "left" | "right") =>
    request<any>(`/sales/columns/${id}/position?direction=${direction}`, { method: "PATCH" }),

  // kanban column reorder
  reorderColumn: (colId: number, newPosition: number) =>
    request<BoardColumn>(`/boards/columns/${colId}/position?new_position=${newPosition}`, { method: "PATCH" }),
};

// search
export const searchApi = {
  search: (q: string) => request<{ users: any[]; projects: any[]; tasks: any[] }>(`/search?q=${encodeURIComponent(q)}`),
};

// notifications
export const notifApi = {
  get: () => request<{ count: number; items: any[] }>("/notifications"),
};

// bug reports
export const bugApi = {
  list: (status?: string) => {
    const qs = status ? `?status=${status}` : "";
    return request<import("./types").BugReport[]>(`/bugs${qs}`);
  },
  countNew: () => request<{ count: number }>("/bugs/count/new"),
  create: (data: { title: string; description?: string; priority?: string }) =>
    request<import("./types").BugReport>("/bugs", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    request<import("./types").BugReport>(`/bugs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/bugs/${id}`, { method: "DELETE" }),
};

// settings / CRM lookups
export const settingsApi = {
  // Sources
  listSources: () => request<import("./types").LeadSource[]>("/settings/sources"),
  createSource: (name: string) => request<import("./types").LeadSource>("/settings/sources", { method: "POST", body: JSON.stringify({ name }) }),
  updateSource: (id: number, data: any) => request<import("./types").LeadSource>(`/settings/sources/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reorderSource: (id: number, position: number) => request<import("./types").LeadSource[]>(`/settings/sources/${id}/reorder?new_position=${position}`, { method: "POST" }),

  // Services
  listServices: () => request<import("./types").ServiceItem[]>("/settings/services"),
  createService: (name: string) => request<import("./types").ServiceItem>("/settings/services", { method: "POST", body: JSON.stringify({ name }) }),
  updateService: (id: number, data: any) => request<import("./types").ServiceItem>(`/settings/services/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reorderService: (id: number, position: number) => request<import("./types").ServiceItem[]>(`/settings/services/${id}/reorder?new_position=${position}`, { method: "POST" }),

  // Stages
  listStages: () => request<import("./types").LeadStage[]>("/settings/stages"),
  createStage: (data: any) => request<import("./types").LeadStage>("/settings/stages", { method: "POST", body: JSON.stringify(data) }),
  updateStage: (id: number, data: any) => request<import("./types").LeadStage>(`/settings/stages/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reorderStage: (id: number, position: number) => request<import("./types").LeadStage[]>(`/settings/stages/${id}/reorder?new_position=${position}`, { method: "POST" }),

  // Reject reasons
  listRejectReasons: () => request<import("./types").RejectReason[]>("/settings/reject-reasons"),
  createRejectReason: (name: string) => request<import("./types").RejectReason>("/settings/reject-reasons", { method: "POST", body: JSON.stringify({ name }) }),
  updateRejectReason: (id: number, data: any) => request<import("./types").RejectReason>(`/settings/reject-reasons/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reorderRejectReason: (id: number, position: number) => request<import("./types").RejectReason[]>(`/settings/reject-reasons/${id}/reorder?new_position=${position}`, { method: "POST" }),

  // Expense categories
  listExpenseCategories: () => request<import("./types").ExpenseCategory[]>("/settings/expense-categories"),
  createExpenseCategory: (name: string) => request<import("./types").ExpenseCategory>("/settings/expense-categories", { method: "POST", body: JSON.stringify({ name }) }),
  updateExpenseCategory: (id: number, data: any) => request<import("./types").ExpenseCategory>(`/settings/expense-categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reorderExpenseCategory: (id: number, position: number) => request<import("./types").ExpenseCategory[]>(`/settings/expense-categories/${id}/reorder?new_position=${position}`, { method: "POST" }),

  // Accounts
  listAccounts: () => request<import("./types").Account[]>("/settings/accounts"),
  createAccount: (data: { name: string; currency?: string }) => request<import("./types").Account>("/settings/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: number, data: any) => request<import("./types").Account>(`/settings/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  reorderAccount: (id: number, position: number) => request<import("./types").Account[]>(`/settings/accounts/${id}/reorder?new_position=${position}`, { method: "POST" }),
};

// leads
export const leadApi = {
  stats: (f?: { date_from?: string; date_to?: string }) => {
    const p = new URLSearchParams();
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    const qs = p.toString();
    return request<import("./types").LeadStats>(`/leads/stats${qs ? "?" + qs : ""}`);
  },
  list: (f?: {
    source_id?: number; service_id?: number; setter_id?: number; closer_id?: number;
    stage_id?: number; status?: string; date_from?: string; date_to?: string;
    search?: string; limit?: number; offset?: number;
  }) => {
    const p = new URLSearchParams();
    if (f?.source_id)  p.set("source_id",  String(f.source_id));
    if (f?.service_id) p.set("service_id", String(f.service_id));
    if (f?.setter_id)  p.set("setter_id",  String(f.setter_id));
    if (f?.closer_id)  p.set("closer_id",  String(f.closer_id));
    if (f?.stage_id)   p.set("stage_id",   String(f.stage_id));
    if (f?.status)     p.set("status",     f.status);
    if (f?.date_from)  p.set("date_from",  f.date_from);
    if (f?.date_to)    p.set("date_to",    f.date_to);
    if (f?.search)     p.set("search",     f.search);
    if (f?.limit)      p.set("limit",      String(f.limit));
    if (f?.offset)     p.set("offset",     String(f.offset));
    const qs = p.toString();
    return request<import("./types").LeadListResponse>(`/leads${qs ? "?" + qs : ""}`);
  },
  get: (id: number) => request<import("./types").LeadDetail>(`/leads/${id}`),
  create: (data: any) => request<import("./types").Lead>("/leads", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: any) => request<import("./types").Lead>(`/leads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archive: (id: number) => request<import("./types").Lead>(`/leads/${id}/archive`, { method: "POST" }),
  changeStage: (id: number, to_stage_id: number, comment = "", extra_data: Record<string, any> = {}) =>
    request<import("./types").Lead>(`/leads/${id}/stage`, { method: "PATCH", body: JSON.stringify({ to_stage_id, comment, extra_data }) }),
  funnel: (f?: { date_from?: string; date_to?: string; source_id?: number; setter_id?: number; closer_id?: number }) => {
    const p = new URLSearchParams();
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    if (f?.source_id) p.set("source_id", String(f.source_id));
    if (f?.setter_id) p.set("setter_id", String(f.setter_id));
    if (f?.closer_id) p.set("closer_id", String(f.closer_id));
    const qs = p.toString();
    return request<import("./types").FunnelResponse>(`/leads/funnel${qs ? "?" + qs : ""}`);
  },
  funnelStats: (f?: { date_from?: string; date_to?: string; source_id?: number; setter_id?: number; closer_id?: number }) => {
    const p = new URLSearchParams();
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    if (f?.source_id) p.set("source_id", String(f.source_id));
    if (f?.setter_id) p.set("setter_id", String(f.setter_id));
    if (f?.closer_id) p.set("closer_id", String(f.closer_id));
    const qs = p.toString();
    return request<import("./types").FunnelStats>(`/leads/funnel-stats${qs ? "?" + qs : ""}`);
  },
  addActivity: (id: number, data: { activity_type: string; channel?: string; description?: string; responsible_id?: number }) =>
    request<import("./types").LeadActivity>(`/leads/${id}/activities`, { method: "POST", body: JSON.stringify(data) }),
  addFile: (id: number, data: { name: string; url: string; file_type?: string }) =>
    request<import("./types").LeadFile>(`/leads/${id}/files`, { method: "POST", body: JSON.stringify(data) }),
  deleteFile: (leadId: number, fileId: number) =>
    request<void>(`/leads/${leadId}/files/${fileId}`, { method: "DELETE" }),
};

// finance
export const financeApi = {
  transactions: (f?: { type?: string; category?: string; date_from?: string; date_to?: string; account_id?: number; skip?: number; limit?: number }) => {
    const p = new URLSearchParams();
    if (f?.type) p.set("type", f.type);
    if (f?.category) p.set("category", f.category);
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    if (f?.account_id) p.set("account_id", String(f.account_id));
    if (f?.skip) p.set("skip", String(f.skip));
    if (f?.limit) p.set("limit", String(f.limit));
    const qs = p.toString();
    return request<{ items: import("./types").FinanceTransaction[]; total: number }>(`/finance/transactions${qs ? "?" + qs : ""}`);
  },
  createTransaction: (data: any) => request<import("./types").FinanceTransaction>("/finance/transactions", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: number, data: any) => request<import("./types").FinanceTransaction>(`/finance/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTransaction: (id: number) => request<void>(`/finance/transactions/${id}`, { method: "DELETE" }),
  debts: () => request<import("./types").Debt[]>("/finance/debts"),
  createDebt: (data: any) => request<import("./types").Debt>("/finance/debts", { method: "POST", body: JSON.stringify(data) }),
  updateDebt: (id: number, data: any) => request<import("./types").Debt>(`/finance/debts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteDebt: (id: number) => request<void>(`/finance/debts/${id}`, { method: "DELETE" }),
  balances: () => request<import("./types").AccountBalance[]>("/finance/balances"),
  createBalance: (data: any) => request<import("./types").AccountBalance>("/finance/balances", { method: "POST", body: JSON.stringify(data) }),
  updateBalance: (id: number, data: any) => request<import("./types").AccountBalance>(`/finance/balances/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBalance: (id: number) => request<void>(`/finance/balances/${id}`, { method: "DELETE" }),
  summary: (f?: { date_from?: string; date_to?: string }) => {
    const p = new URLSearchParams();
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to) p.set("date_to", f.date_to);
    const qs = p.toString();
    return request<import("./types").FinanceSummary>(`/finance/summary${qs ? "?" + qs : ""}`);
  },
};

// payroll
export const payrollApi = {
  rules: (employee_id?: number) => {
    const qs = employee_id ? `?employee_id=${employee_id}` : "";
    return request<import("./types").PayrollRule[]>(`/payroll/rules${qs}`);
  },
  createRule: (data: any) => request<import("./types").PayrollRule>("/payroll/rules", { method: "POST", body: JSON.stringify(data) }),
  updateRule: (id: number, data: any) => request<import("./types").PayrollRule>(`/payroll/rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRule: (id: number) => request<void>(`/payroll/rules/${id}`, { method: "DELETE" }),
  calculate: (period_start: string, period_end: string, employee_id?: number) => {
    const p = new URLSearchParams({ period_start, period_end });
    if (employee_id) p.set("employee_id", String(employee_id));
    return request<import("./types").PayrollCalculation | import("./types").PayrollCalculation[]>(`/payroll/calculate?${p.toString()}`);
  },
  commit: (data: { employee_id: number; period_start: string; period_end: string }) =>
    request<import("./types").PayrollRecord>("/payroll/commit", { method: "POST", body: JSON.stringify(data) }),
  records: (employee_id?: number) => {
    const qs = employee_id ? `?employee_id=${employee_id}` : "";
    return request<import("./types").PayrollRecord[]>(`/payroll/records${qs}`);
  },
  updateRecordStatus: (id: number, status: string) =>
    request<import("./types").PayrollRecord>(`/payroll/records/${id}/status?status=${status}`, { method: "PUT" }),
};

// analytics
export const analyticsApi = {
  dashboard: (date_from?: string, date_to?: string) => {
    const p = new URLSearchParams();
    if (date_from) p.set("date_from", date_from);
    if (date_to) p.set("date_to", date_to);
    const qs = p.toString();
    return request<{ metrics: import("./types").DashboardMetrics; charts: import("./types").ChartsData; problems: import("./types").Problem[] }>(`/analytics/dashboard${qs ? "?" + qs : ""}`);
  },
  kpi: (year: number, month: number) =>
    request<import("./types").KpiPlanFact>(`/analytics/kpi?year=${year}&month=${month}`),
  listPlans: () => request<import("./types").MonthlyPlan[]>("/analytics/plans"),
  createPlan: (data: Omit<import("./types").MonthlyPlan, "id">) =>
    request<import("./types").MonthlyPlan>("/analytics/plans", { method: "POST", body: JSON.stringify(data) }),
  updatePlan: (id: number, data: Omit<import("./types").MonthlyPlan, "id">) =>
    request<import("./types").MonthlyPlan>(`/analytics/plans/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePlan: (id: number) => request<void>(`/analytics/plans/${id}`, { method: "DELETE" }),
  exportXlsx: async (type: "leads" | "finance" | "payroll", params?: Record<string, string>) => {
    const token = getToken();
    const p = new URLSearchParams(params);
    const res = await fetch(`/api/analytics/export/${type}.xlsx?${p.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Ошибка экспорта");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// dev payroll config
export const devPayrollConfigApi = {
  list: () => request<import("./types").DevPayrollConfig[]>("/payroll/dev-config"),
  update: (id: number, data: { new_bot_price: number; support_price: number; base_salary: number; free_bots_limit: number }) =>
    request<import("./types").DevPayrollConfig>(`/payroll/dev-config/${id}`, { method: "PUT", body: JSON.stringify(data) }),
};

// meetings
export const meetingApi = {
  list: (f?: { closer_id?: number; setter_id?: number; year?: number; month?: number; date_from?: string; date_to?: string; offset?: number; limit?: number; parent_only?: boolean }) => {
    const p = new URLSearchParams();
    if (f?.closer_id) p.set("closer_id", String(f.closer_id));
    if (f?.setter_id) p.set("setter_id", String(f.setter_id));
    if (f?.parent_only === false) p.set("parent_only", "false");
    if (f?.year)   p.set("year",   String(f.year));
    if (f?.month)  p.set("month",  String(f.month));
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to)   p.set("date_to",   f.date_to);
    if (f?.offset) p.set("offset", String(f.offset));
    if (f?.limit)  p.set("limit",  String(f.limit));
    const qs = p.toString();
    return request<import("./types").Meeting[]>(`/meetings${qs ? "?" + qs : ""}`);
  },
  get: (id: number) => request<import("./types").Meeting>(`/meetings/${id}`),
  create: (data: any) => request<import("./types").Meeting>("/meetings", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: any) => request<import("./types").Meeting>(`/meetings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  setStatus: (id: number, status: string) => request<import("./types").Meeting>(`/meetings/${id}/status?status=${status}`, { method: "PATCH" }),
  delete: (id: number) => request<void>(`/meetings/${id}`, { method: "DELETE" }),
  summary: (f?: { date_from?: string; date_to?: string }) => {
    const p = new URLSearchParams();
    if (f?.date_from) p.set("date_from", f.date_from);
    if (f?.date_to)   p.set("date_to",   f.date_to);
    const qs = p.toString();
    return request<import("./types").SalesSummary>(`/meetings/summary/all${qs ? "?" + qs : ""}`);
  },
};

// API key management
export const apiKeys = {
  list: () => request<import("./types").ApiKey[]>("/api-keys"),
  create: (name: string) => request<import("./types").ApiKeyCreated>("/api-keys", { method: "POST", body: JSON.stringify({ name }) }),
  revoke: (id: number) => request<void>(`/api-keys/${id}`, { method: "DELETE" }),
};

// NevoLabs lab projects
export const labProjectApi = {
  list: (include_archived = false) =>
    request<import("./types").LabProject[]>(`/lab-projects${include_archived ? "?include_archived=true" : ""}`),
  get: (id: number) => request<import("./types").LabProject>(`/lab-projects/${id}`),
  create: (data: { name: string; description?: string; status?: string; member_ids?: number[] }) =>
    request<import("./types").LabProject>("/lab-projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: { name?: string; description?: string; status?: string; member_ids?: number[] }) =>
    request<import("./types").LabProject>(`/lab-projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  archive: (id: number) =>
    request<import("./types").LabProject>(`/lab-projects/${id}/archive`, { method: "POST" }),
  addMember: (id: number, user_id: number) =>
    request<import("./types").LabProject>(`/lab-projects/${id}/members`, { method: "POST", body: JSON.stringify({ user_id }) }),
  removeMember: (id: number, user_id: number) =>
    request<import("./types").LabProject>(`/lab-projects/${id}/members/${user_id}`, { method: "DELETE" }),
};
