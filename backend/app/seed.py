"""Seed NevoDevs database. Run: python -m app.seed"""
import os
from datetime import date, timedelta, datetime, timezone

from app.core.database import SessionLocal, engine, Base
from app.core.security import hash_password
from app.models import (
    User, Project, Board, BoardColumn, Task, Department, ColumnDef,
    SalesRecord, MarketingRecord, Meeting, MeetingStatus,
    Role, ProjectStatus, Priority,
    LeadSource, Service, LeadStage, RejectReason, ExpenseCategory, Account,
    Lead, LeadStageHistory, LeadActivity, LeadStatus, Deal,
    PayrollRule, FinanceTransaction, AdExpense, MonthlyPlan, DevPayrollConfig,
    LabProject, LabProjectMember,
)

DEFAULT_COLS = [("To-do", "#767586", False), ("In progress", "#4648d4", False), ("Done", "#16a34a", True)]


def seed_lookups():
    """Fill CRM lookup tables. Safe to call multiple times (idempotent)."""
    db = SessionLocal()
    try:
        def _fill(model, rows, extra=None):
            for i, name in enumerate(rows):
                if not db.query(model).filter_by(name=name).first():
                    kwargs = {"name": name, "position": i}
                    if extra and name in extra:
                        kwargs.update(extra[name])
                    db.add(model(**kwargs))
            db.commit()

        _fill(LeadSource, [
            "Instagram", "Facebook", "WhatsApp",
            "Сарафан", "Повторный клиент", "Другое",
        ])

        _fill(Service, [
            "AI чат-бот", "Сайт", "Интернет-магазин",
            "CRM", "Автоматизация", "Другое",
        ])

        # NOTE: «Демо-тест» is intentionally absent — it was retired in migration 018.
        # Existing installs keep the row (archived) so history stays readable.
        stages = [
            ("Новый лид",        {}),
            ("Созвон",           {}),
            ("Встреча",          {}),
            ("Договор",          {}),
            ("Ожидание оплаты",  {}),
            ("Оплачено",         {"is_won": True,  "color": "#16a34a"}),
            ("Разработка",       {}),
            ("Минус",            {"is_lost": True, "color": "#e03b3b"}),
        ]
        for i, (name, extra) in enumerate(stages):
            if not db.query(LeadStage).filter_by(name=name).first():
                db.add(LeadStage(name=name, position=i, **extra))
        db.commit()

        _fill(RejectReason, [
            "Дорого", "Не сейчас", "Нет доверия", "Уже работают с кем-то",
            "Не ЛПР", "Не понял продукт", "Нет бюджета", "Не квал",
            "Нет времени", "Другое",
        ])

        _fill(ExpenseCategory, [
            "ФОТ", "Бонусы", "Таргет", "Постоянные расходы",
            "Прочие расходы", "Возвраты клиентам", "Погашение долгов",
            "Дивиденды основателей", "Разработка", "Офисные расходы",
        ])

        account_rows = [
            "Наличные", "Банк", "Карта", "MBank", "O!Bank", "Другое",
        ]
        for i, name in enumerate(account_rows):
            if not db.query(Account).filter_by(name=name).first():
                db.add(Account(name=name, currency="сом", position=i))
        db.commit()
    finally:
        db.close()

def _initial_user_password() -> str:
    password = os.getenv("INITIAL_USER_PASSWORD")
    if password:
        return password
    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        raise RuntimeError("INITIAL_USER_PASSWORD must be set in production")
    return "Nevo2026!"


def make_board(db, name, kind, owner_id=None, department_id=None, cols=None):
    b = Board(name=name, kind=kind, owner_id=owner_id, department_id=department_id)
    db.add(b); db.flush()
    for i, (n, c, d) in enumerate(cols or DEFAULT_COLS):
        db.add(BoardColumn(board_id=b.id, name=n, color=c, position=i, is_done=d))
    db.flush()
    return b


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if db.query(User).first():
        print("База уже заполнена — пропускаю.")
        db.close(); return

    initial_password = _initial_user_password()

    # ===== Departments =====
    depts = {
        "about":    Department(name="О компании",       slug="about",    icon="business",        kind="about"),
        "sales":    Department(name="Отдел продаж",     slug="sales",    icon="payments",         kind="sales"),
        "marketing":Department(name="Отдел маркетинга", slug="marketing",icon="campaign",         kind="marketing"),
        "finance":  Department(name="Отдел финансов",   slug="finance",  icon="account_balance",  kind="finance"),
        "dev":      Department(name="Разработка",       slug="dev",      icon="code",             kind="dev"),
        "qcc":      Department(name="ОКК",              slug="qcc",      icon="fact_check",       kind="qcc"),
        "hidden":   Department(name="Скрытая часть",    slug="hidden",   icon="lock",             kind="hidden", admin_only=True),
    }
    for d in depts.values():
        db.add(d)
    db.flush()

    # ===== Users =====
    # Every seeded user receives the deployment-provided one-time password.
    # last_seen=None for everyone (nobody has logged in yet)
    def U(name, email, position, color, founder=False, admin=False):
        return User(
            name=name, email=email,
            password_hash=hash_password(initial_password),
            role=Role.admin if admin else Role.staff,
            position=position, is_founder=founder,
            avatar_color=color, is_active=True, last_seen=None,
        )

    # Founders (admin=True)
    beka    = U("Бека",     "beka@nevodevs.kg",     "Руководитель",        "indigo",  founder=True, admin=True)
    erbol   = U("Эрбол",    "erbol@nevodevs.kg",    "Тимлид",              "green",   founder=True, admin=True)
    arslan  = U("Арслан",   "arslan@nevodevs.kg",   "Клоузер",             "orange",  founder=True, admin=True)
    abylay  = U("Абылай",   "abylay@nevodevs.kg",   "Руководитель продаж", "yellow",  founder=True, admin=True)  # сеттер
    nazar   = U("Назар",    "nazar@nevodevs.kg",    "Маркетинг",           "red",     founder=True, admin=True)
    timur   = U("Тимур",    "timur@nevodevs.kg",    "Главный тех лид",     "indigo",  founder=True, admin=True)
    adahan  = U("Адахан",   "adahan@nevodevs.kg",   "Финансовый директор", "green",   founder=True, admin=True)
    # Prompters
    azamat  = U("Азамат",   "azamat@nevodevs.kg",   "Промпт-инженер",      "indigo")
    ariet   = U("Ариет",    "ariet@nevodevs.kg",    "Промпт-инженер",      "green")
    abdulla = U("Абдулла",  "abdulla@nevodevs.kg",  "Промпт-инженер",      "orange")
    turat   = U("Туратбек", "turat@nevodevs.kg",    "Промпт-инженер",      "yellow")
    emirlan = U("Эмирлан",  "emirlan@nevodevs.kg",  "Промпт-инженер",      "red")
    # Backenders
    talgat  = U("Талгат",   "talgat@nevodevs.kg",   "Бэкенд",              "indigo")
    bektur  = U("Бектур",   "bektur@nevodevs.kg",   "Бэкенд",              "green")
    miro    = U("Мирослав", "miroslav@nevodevs.kg", "Бэкенд",              "orange")
    # Sales
    rahima  = U("Рахима",   "rahima@nevodevs.kg",   "Сеттер",              "red")
    minai   = U("Минай",    "minai@nevodevs.kg",    "Сеттер",              "yellow")
    marlen  = U("Марлен",   "marlen@nevodevs.kg",   "Клоузер",             "indigo")
    # QCC
    ahmad   = U("Ахмад",    "ahmad@nevodevs.kg",    "Менеджер качества",   "indigo")

    all_users = [beka, erbol, arslan, abylay, nazar, timur, adahan,
                 azamat, ariet, abdulla, turat, emirlan,
                 talgat, bektur, miro, rahima, minai, marlen, ahmad]
    for u in all_users:
        db.add(u)
    db.flush()

    # ===== Department membership =====
    depts["dev"].members      = [beka, erbol, timur, azamat, ariet, abdulla, turat, emirlan, talgat, bektur, miro]
    depts["sales"].members    = [arslan, abylay, rahima, minai, marlen]
    depts["marketing"].members = [nazar]
    depts["finance"].members  = [adahan]
    depts["qcc"].members      = [ahmad]
    db.flush()

    # ===== Projects =====
    projects_data = [
        ("Эл Суши",        ProjectStatus.new,     date(2026,1,15),  azamat),
        ("ImaShop",        ProjectStatus.support, date(2026,2,3),   ariet),
        ("DAYAR-DOS",      ProjectStatus.new,     date(2026,2,20),  ariet),
        ("TOLKUN.KG",      ProjectStatus.support, date(2026,3,10),  turat),
        ("Usadba Orehovo", ProjectStatus.new,     date(2026,4,1),   abdulla),
        ("BuyStroy",       ProjectStatus.support, date(2026,4,14),  emirlan),
        ("PROFI Bishkek",  ProjectStatus.new,     date(2026,4,22),  azamat),
        ("Эл Суши 2",      ProjectStatus.new,     date(2026,5,5),   turat),
    ]
    for co, st, dt, owner in projects_data:
        db.add(Project(company=co, status=st, connected_at=dt, owner_id=owner.id))
    db.flush()

    # ===== Personal boards =====
    boards = {}
    for u in all_users:
        boards[u.id] = make_board(db, "Личный трекер", "personal", owner_id=u.id)

    backend_board = make_board(db, "Очередь бэкенда", "backend_queue", department_id=depts["dev"].id)
    qcc_board     = make_board(db, "Трекер ОКК",       "qcc",           department_id=depts["qcc"].id)
    db.flush()

    def first_col(board, idx=0):
        cols = sorted(board.columns, key=lambda c: c.position)
        return cols[min(idx, len(cols)-1)].id

    # ===== Sample personal tasks =====
    db.add(Task(title="Настроить промпт — ресторан", tag="Бот", tag_color="indigo", priority=Priority.low,
                due_date=date(2026,6,10), board_id=boards[azamat.id].id, column_id=first_col(boards[azamat.id]), owner_id=azamat.id))
    db.add(Task(title="Починить бота ImaShop", tag="Фикс", tag_color="red", priority=Priority.high,
                due_date=date(2026,6,5), board_id=boards[ariet.id].id, column_id=first_col(boards[ariet.id],1), owner_id=ariet.id))
    db.add(Task(title="TOLKUN.KG — добавить категорию", tag="Бот", tag_color="indigo", priority=Priority.med,
                due_date=date(2026,6,8), board_id=boards[turat.id].id, column_id=first_col(boards[turat.id],1), owner_id=turat.id))

    # ===== Backend queue tasks =====
    db.add(Task(title="Интеграция Poster API для PROFI", tag="Интеграция", tag_color="green", priority=Priority.high,
                board_id=backend_board.id, column_id=first_col(backend_board),
                requester_id=azamat.id, assignee_ids=[talgat.id, bektur.id], task_type="API"))
    db.add(Task(title="Развернуть вебхук для Эл Суши 2", tag="DevOps", tag_color="indigo", priority=Priority.med,
                board_id=backend_board.id, column_id=first_col(backend_board,1),
                requester_id=turat.id, assignee_ids=[miro.id], task_type="Деплой"))

    # ===== QCC task =====
    db.add(Task(title="Проверить диалоги DAYAR-DOS", tag="Проверка", tag_color="indigo", priority=Priority.med,
                board_id=qcc_board.id, column_id=first_col(qcc_board), owner_id=ahmad.id))

    # ===== Sample meetings =====
    from datetime import timedelta as td
    now = datetime.now(timezone.utc)
    db.add(Meeting(closer_id=arslan.id, setter_id=rahima.id,
        meeting_date=now + td(days=1), address="ул. Манаса 45, Бишкек",
        client_name="Алибек Джумалиев", client_phone="+996 700 123456",
        status=MeetingStatus.scheduled))
    db.add(Meeting(closer_id=marlen.id, setter_id=minai.id,
        meeting_date=now + td(days=2), address="пр. Чуй 101, Бишкек",
        client_name="Айгерим Токтосунова", client_phone="+996 555 789012",
        status=MeetingStatus.scheduled))
    db.add(Meeting(closer_id=arslan.id, setter_id=abylay.id,
        meeting_date=now - td(days=1), address="ул. Советская 12",
        client_name="Бакыт Малиев", client_phone="+996 777 345678",
        status=MeetingStatus.closed))
    db.add(Meeting(closer_id=marlen.id, setter_id=rahima.id,
        meeting_date=now - td(days=3), address="ТРЦ Бишкек Парк",
        client_name="Нурзат Асанова", client_phone="+996 500 901234",
        status=MeetingStatus.push))
    db.flush()

    # ===== Sales columns + sample records =====
    sales_cols = [
        ("Касания",         "касания"),
        ("Дозвоны",         "дозвоны"),
        ("Недозвоны",       "недозвоны"),
        ("Назначено встреч","назначено_встреч"),
        ("Проведено встреч","проведено_встреч"),
    ]
    for i, (label, key) in enumerate(sales_cols):
        db.add(ColumnDef(department_id=depts["sales"].id, key=key, label=label, kind="number", position=i))

    today = date(2026,6,2)
    for d_off in range(3):
        rd = today - timedelta(days=d_off)
        db.add(SalesRecord(user_id=rahima.id, record_date=rd,
                           metrics={"касания":60-d_off*5,"дозвоны":35-d_off*3,"недозвоны":25,"назначено_встреч":6-d_off,"проведено_встреч":4-d_off}))
        db.add(SalesRecord(user_id=minai.id, record_date=rd,
                           metrics={"касания":55-d_off*4,"дозвоны":30-d_off*2,"недозвоны":25,"назначено_встреч":5,"проведено_встреч":3}))

    # ===== Marketing columns + sample =====
    mk_cols = [("Идея (креатив)","идея"),("Сценарий","сценарий"),("Монтаж","монтаж"),("Планировка","планировка")]
    for i, (label, key) in enumerate(mk_cols):
        db.add(ColumnDef(department_id=depts["marketing"].id, key=key, label=label, kind="text", position=i))
    db.add(MarketingRecord(user_id=nazar.id, record_date=today,
                           fields={"идея":"Reels про кейс Эл Суши","сценарий":"Готов","монтаж":"В работе","планировка":"Неделя 23"}))

    depts["about"].content = "NevoDevs — команда по разработке AI-чатботов для бизнеса в Бишкеке.\n\nЗаполните этот раздел через редактирование (доступно руководителю)."

    db.commit()
    db.close()

    # ===== CRM Lookups (idempotent) =====
    seed_lookups()

    # ===== Demo Leads (idempotent) =====
    seed_leads()

    # ===== Payroll rules + finance demo (idempotent) =====
    seed_payroll_and_finance()
    print("✅ База заполнена.")
    print()
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("  АККАУНТЫ ДЛЯ КОМАНДЫ")
    print("  Стартовый пароль задан через INITIAL_USER_PASSWORD.")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    accounts = [
        ("Бека",     "beka@nevodevs.kg",     "Руководитель"),
        ("Эрбол",    "erbol@nevodevs.kg",    "Тимлид"),
        ("Арслан",   "arslan@nevodevs.kg",   "Руководитель продаж"),
        ("Абылай",   "abylay@nevodevs.kg",   "Руководитель продаж"),
        ("Назар",    "nazar@nevodevs.kg",    "Маркетинг"),
        ("Тимур",    "timur@nevodevs.kg",    "Главный тех лид"),
        ("Адахан",   "adahan@nevodevs.kg",   "Финансовый директор"),
        ("Азамат",   "azamat@nevodevs.kg",   "Промпт-инженер"),
        ("Ариет",    "ariet@nevodevs.kg",    "Промпт-инженер"),
        ("Абдулла",  "abdulla@nevodevs.kg",  "Промпт-инженер"),
        ("Туратбек", "turat@nevodevs.kg",    "Промпт-инженер"),
        ("Эмирлан",  "emirlan@nevodevs.kg",  "Промпт-инженер"),
        ("Талгат",   "talgat@nevodevs.kg",   "Бэкенд"),
        ("Бектур",   "bektur@nevodevs.kg",   "Бэкенд"),
        ("Мирослав", "miroslav@nevodevs.kg", "Бэкенд"),
        ("Рахима",   "rahima@nevodevs.kg",   "Сеттер"),
        ("Минай",    "minai@nevodevs.kg",    "Сеттер"),
        ("Марлен",   "marlen@nevodevs.kg",   "Клоузер"),
        ("Ахмад",    "ahmad@nevodevs.kg",    "Менеджер качества"),
    ]
    for name, email, pos in accounts:
        print(f"  {name:<12} {email:<28} {pos}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")


def seed_leads():
    """Add demo leads. Idempotent — checks by phone."""
    db = SessionLocal()
    try:
        src  = {s.name: s.id for s in db.query(LeadSource).all()}
        svc  = {s.name: s.id for s in db.query(Service).all()}
        stg  = {s.name: s.id for s in db.query(LeadStage).order_by(LeadStage.position).all()}
        users = {u.email.split("@")[0]: u.id for u in db.query(User).all()}

        def add_lead(phone, client, company, source, service, stage, setter, closer=None, amount=0, comment=""):
            if db.query(Lead).filter_by(phone=phone).first():
                return
            setter_id = users.get(setter)
            closer_id = users.get(closer) if closer else None
            stage_id = stg.get(stage)
            lead = Lead(
                client_name=client, company_name=company, phone=phone,
                source_id=src.get(source), service_id=svc.get(service),
                stage_id=stage_id, setter_id=setter_id, closer_id=closer_id,
                potential_amount=amount, comment=comment,
                status=LeadStatus.active,
            )
            db.add(lead); db.flush()
            if stage_id:
                db.add(LeadStageHistory(lead_id=lead.id, from_stage_id=None,
                    to_stage_id=stage_id, changed_by=setter_id, comment="Лид создан"))
                db.add(LeadActivity(lead_id=lead.id, activity_type="created",
                    description="Лид создан", responsible_id=setter_id))
            # Deal.amount is the canonical deal amount — seed it alongside the lead
            # so demo data matches the production model.
            if amount:
                db.add(Deal(
                    lead_id=lead.id, amount=amount, paid_amount=0, status="pending",
                    setter_id=setter_id, closer_id=closer_id,
                ))
            db.flush()

        add_lead("+996 700 111111", "Алибек Джумалиев", "Sushi Pro KG",
                 "Instagram", "AI чат-бот", "Встреча", "rahima", "arslan", 150000, "Интерес к боту для доставки")
        add_lead("+996 555 222222", "Айгерим Токтосунова", "Beauty Studio",
                 "WhatsApp", "Автоматизация", "Созвон", "minai", None, 80000, "Хочет автоматизировать запись")
        add_lead("+996 777 333333", "Бакыт Малиев", "БакытСтрой",
                 "Сарафан", "Сайт", "Созвон", "rahima", None, 120000)
        add_lead("+996 500 444444", "Жибек Асанова", "",
                 "Facebook", "AI чат-бот", "Договор", "minai", "marlen", 200000, "Согласовали условия")
        add_lead("+996 770 555555", "Нурлан Исаков", "Naryn Trade",
                 "Повторный клиент", "Интернет-магазин", "Ожидание оплаты", "abylay", "arslan", 350000, "Ждём оплату")
        add_lead("+996 700 666666", "Канат Сейитов", "KG Market",
                 "Instagram", "CRM", "Новый лид", "rahima", None, 90000)
        add_lead("+996 555 777777", "Мира Токоева", "MiraShop",
                 "WhatsApp", "AI чат-бот", "Оплачено", "minai", "marlen", 180000, "Оплата прошла, начинаем разработку")
        add_lead("+996 777 888888", "Эрик Джунусов", "Юридическая фирма Джунусов",
                 "Сарафан", "Сайт", "Минус", "abylay", None, 0, "Не прошёл квалификацию")

        db.commit()
    finally:
        db.close()


def seed_payroll_and_finance():
    """Add PayrollRules and demo FinanceTransactions. Idempotent."""
    db = SessionLocal()
    try:
        users = {u.email.split("@")[0]: u for u in db.query(User).all()}
        today = date(2026, 1, 1)

        def _add_rule(user_name, base, pct, condition):
            u = users.get(user_name)
            if not u:
                return
            exists = db.query(PayrollRule).filter_by(
                employee_id=u.id, commission_condition=condition, active_from=today
            ).first()
            if not exists:
                db.add(PayrollRule(
                    employee_id=u.id,
                    base_salary=base,
                    commission_percent=pct,
                    commission_condition=condition,
                    active_from=today,
                    active_to=None,
                ))

        # Setters: 10 000 оклад + 10% с from_setter сделок
        for setter in ("rahima", "minai", "abylay"):
            _add_rule(setter, 10000, 10, "from_setter")

        # Closers: 10% if from_setter deal, 20% if closer_self deal
        for closer in ("arslan", "marlen"):
            _add_rule(closer, 0, 10, "from_setter")
            _add_rule(closer, 0, 20, "closer_self")

        # Nazar (маркетинг): оклад 25 000, без комиссий
        _add_rule("nazar", 25000, 0, "none")

        # Backenders: fixed salary, no commissions
        for backender in ("talgat", "bektur", "miro"):
            _add_rule(backender, 20000, 0, "none")

        # Erbol (Тимлид): fixed salary handled via DevPayrollConfig; add rule for fallback
        _add_rule("erbol", 15000, 0, "none")

        db.commit()

        # Demo finance transactions
        if not db.query(FinanceTransaction).first():
            today_tx = date(2026, 6, 1)
            db.add(FinanceTransaction(
                type="expense", category="Таргет", amount=15000,
                date=today_tx, comment="Реклама Instagram — июнь",
            ))
            db.add(FinanceTransaction(
                type="expense", category="Постоянные расходы", amount=8000,
                date=today_tx, comment="Офисная аренда",
            ))
            db.add(FinanceTransaction(
                type="expense", category="ФОТ", amount=95000,
                date=date(2026, 6, 5), comment="Зарплаты за май",
            ))
            db.add(FinanceTransaction(
                type="income", category=None, amount=180000,
                date=date(2026, 6, 3), comment="Оплата сделки MiraShop (демо)",
            ))
            db.commit()
    finally:
        db.close()


def seed_dev_payroll():
    """Seed DevPayrollConfig and add Adakhan to sales department. Idempotent."""
    db = SessionLocal()
    try:
        # DevPayrollConfig
        if not db.query(DevPayrollConfig).filter_by(role_kind="prompter").first():
            db.add(DevPayrollConfig(
                role_kind="prompter",
                new_bot_price=5000,
                support_price=1000,
                base_salary=20000,
                free_bots_limit=4,
                updated_at=datetime.now(timezone.utc),
            ))
        if not db.query(DevPayrollConfig).filter_by(role_kind="teamlead").first():
            db.add(DevPayrollConfig(
                role_kind="teamlead",
                new_bot_price=1000,
                support_price=300,
                base_salary=15000,
                free_bots_limit=0,
                updated_at=datetime.now(timezone.utc),
            ))
        db.commit()

        # Adakhan → also in sales department so he appears in closer dropdowns
        adahan = db.query(User).filter_by(email="adahan@nevodevs.kg").first()
        sales_dept = db.query(Department).filter_by(slug="sales").first()
        if adahan and sales_dept and adahan not in sales_dept.members:
            sales_dept.members.append(adahan)
            db.commit()
    finally:
        db.close()


def seed_ad_expenses():
    """Add demo AdExpense rows. Idempotent — skips if already any exist."""
    db = SessionLocal()
    try:
        if db.query(AdExpense).first():
            return
        instagram_src = db.query(LeadSource).filter_by(name="Instagram").first()
        facebook_src = db.query(LeadSource).filter_by(name="Facebook").first()

        rows = [
            # Instagram — основной (~100 000 сом/мес)
            AdExpense(date=date(2026, 6, 1),  source_id=instagram_src.id if instagram_src else None,
                      ad_account="Instagram Ads", campaign_name="Лидген AI чат-бот", amount=35000, currency="сом"),
            AdExpense(date=date(2026, 6, 8),  source_id=instagram_src.id if instagram_src else None,
                      ad_account="Instagram Ads", campaign_name="Ретаргет сайт", amount=25000, currency="сом"),
            AdExpense(date=date(2026, 6, 15), source_id=instagram_src.id if instagram_src else None,
                      ad_account="Instagram Ads", campaign_name="Лидген AI чат-бот", amount=25000, currency="сом"),
            AdExpense(date=date(2026, 6, 22), source_id=instagram_src.id if instagram_src else None,
                      ad_account="Instagram Ads", campaign_name="Stories чат-бот", amount=20000, currency="сом"),
            # Facebook — меньше
            AdExpense(date=date(2026, 6, 5),  source_id=facebook_src.id if facebook_src else None,
                      ad_account="Facebook Ads", campaign_name="B2B автоматизация", amount=18000, currency="сом"),
            AdExpense(date=date(2026, 6, 18), source_id=facebook_src.id if facebook_src else None,
                      ad_account="Facebook Ads", campaign_name="Ретаргет FB", amount=12000, currency="сом"),
        ]
        for r in rows:
            db.add(r)
        db.commit()
    finally:
        db.close()


def seed_monthly_plan():
    """Seed MonthlyPlan for current month. Idempotent."""
    db = SessionLocal()
    try:
        today = date.today()
        existing = db.query(MonthlyPlan).filter_by(year=today.year, month=today.month).first()
        if existing:
            return
        db.add(MonthlyPlan(
            year=today.year,
            month=today.month,
            plan_revenue=720000,
            plan_leads=80,
            plan_meetings=30,
            plan_sales=15,
            plan_cpl=2500,
            plan_cac=8000,
            plan_expenses=300000,
        ))
        db.commit()
    finally:
        db.close()


def seed_nevolabs():
    """Create NevoLabs department, add Erbol (Руководитель) and Atif (Легенда). Idempotent."""
    db = SessionLocal()
    try:
        # Create department if absent
        dept = db.query(Department).filter_by(slug="nevolabs").first()
        if not dept:
            dept = Department(
                name="NevoLabs",
                slug="nevolabs",
                icon="science",
                kind="nevolabs",
                admin_only=False,
                content="",
                embed_url="",
            )
            db.add(dept)
            db.flush()
            print("✅ NevoLabs department created")
        else:
            print("ℹ️  NevoLabs department already exists")

        # Erbol: add to nevolabs, change position, remove from dev
        erbol = db.query(User).filter_by(email="erbol@nevodevs.kg").first()
        if erbol:
            dev_dept = db.query(Department).filter_by(slug="dev").first()
            if dev_dept and erbol in dev_dept.members:
                dev_dept.members.remove(erbol)
                print("✅ Erbol removed from dev department")
            erbol.position = "Руководитель"
            if erbol not in dept.members:
                dept.members.append(erbol)
                print("✅ Erbol added to NevoLabs as Руководитель")
            else:
                print("ℹ️  Erbol already in NevoLabs")
        else:
            print("⚠️  Erbol (erbol@nevodevs.kg) not found")

        # Atif: create if absent, add to nevolabs
        atif = db.query(User).filter_by(email="abdulatif.works@gmail.com").first()
        if not atif:
            from app.core.security import hash_password
            atif = User(
                name="Атиф",
                email="abdulatif.works@gmail.com",
                password_hash=hash_password(STAFF_PW),
                role=Role.staff,
                position="Легенда",
                is_founder=False,
                avatar_color="indigo",
                is_active=True,
            )
            db.add(atif)
            db.flush()
            # Personal board for Atif
            board = Board(name="Личный трекер", kind="personal", owner_id=atif.id)
            db.add(board)
            db.flush()
            for i, (n, c, d) in enumerate(DEFAULT_COLS):
                db.add(BoardColumn(board_id=board.id, name=n, color=c, position=i, is_done=d))
            db.flush()
            print("✅ Atif created with personal board")
        else:
            print("ℹ️  Atif already exists")

        if atif and atif not in dept.members:
            dept.members.append(atif)
            print("✅ Atif added to NevoLabs")

        db.commit()
        print("✅ seed_nevolabs complete")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    seed_ad_expenses()
    seed_monthly_plan()
    seed_dev_payroll()
    seed_nevolabs()
