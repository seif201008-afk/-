(() => {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";

  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const LOCALE = "ar-EG-u-nu-latn";

  // ============ تخزين آمن على الجهاز (بيشتغل حتى لو المتصفح مانع التخزين) ============
  const memory = {};
  const local = {
    get(k) { try { return localStorage.getItem(k); } catch { return memory[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { memory[k] = v; } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return memory["s:" + k] ?? null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { memory["s:" + k] = v; } },
  };
  const NAME_KEY = "team_problems_author";
  const TAB_KEY = "team_problems_tab";
  const DEMO_KEY = "team_problems_demo_v2";

  // ============ مصدر البيانات: Supabase أو وضع تجربة ============
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const mode = !configured ? "demo" : window.supabase ? "live" : "broken";
  const db = mode === "live" ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const TABLE = cfg.TABLE || "team_problems";

  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const demoSeed = () => [
    {
      id: 5, title: "البوت مش بيرد على طلبات الواتساب",
      details: "من الساعة 2 الضهر البوت بيستلم الرسايل ومبيردش خالص. جربت من رقمين مختلفين ونفس الحكاية.",
      note: "العملاء بدأوا يتصلوا بالتليفون بدل الواتساب.",
      author: "عاصم", status: "open", created_at: hoursAgo(2),
      solved_at: null, solved_by: null, solution: null,
    },
    {
      id: 4, title: "أسعار المنيو مش متحدثة في الداشبورد",
      details: "غيرنا أسعار 4 أصناف امبارح، بس لسه الأسعار القديمة هي اللي ظاهرة للعملاء.",
      note: null, author: "مريم", status: "open", created_at: hoursAgo(27),
      solved_at: null, solved_by: null, solution: null,
    },
    {
      id: 3, title: "صفحة الدفع بتعلق على الآيفون",
      details: "لما العميل يدوس \"ادفع\" الصفحة بتفضل تحمّل ومش بتكمل. على أندرويد شغالة عادي.",
      note: null, author: "كريم", status: "solved", created_at: hoursAgo(80),
      solved_at: hoursAgo(70), solved_by: "يوسف",
      solution: "كان فيه كاش قديم على السيرفر، اتمسح والدفع رجع يشتغل.",
    },
    {
      id: 2, title: "إشعارات الطلبات الجديدة بتوصل متأخر",
      details: "الإشعار بيوصل للمطعم بعد الطلب بحوالي 10 دقايق.",
      note: "حصلت في أكتر من فرع.", author: "مريم", status: "solved", created_at: hoursAgo(220),
      solved_at: hoursAgo(194), solved_by: "عاصم",
      solution: "المهمة اللي بتبعت الإشعارات كانت شغالة كل 10 دقايق، اتظبطت تشتغل كل دقيقة.",
    },
    {
      id: 1, title: "صور الأصناف مش بتظهر في الموقع",
      details: "كل الصور بتظهر مربع فاضي في صفحة المنيو.",
      note: null, author: "يوسف", status: "solved", created_at: hoursAgo(960),
      solved_at: hoursAgo(957), solved_by: "كريم",
      solution: "رابط التخزين اتغير، اتحدث في الإعدادات.",
    },
  ];

  const friendlyError = (e) => {
    const msg = String(e?.message || e || "");
    if (e?.code === "42P01" || /does not exist|schema cache/i.test(msg))
      return "الجدول مش موجود في Supabase. شغّل ملف supabase.sql الأول.";
    if (/fetch|network|Failed/i.test(msg)) return "مفيش اتصال بالسيرفر. اتأكد من النت وجرّب تاني.";
    if (/Invalid API key|JWT/i.test(msg)) return "مفتاح Supabase في config.js غلط.";
    return msg || "حصلت مشكلة غير متوقعة.";
  };

  const store = {
    async list() {
      if (mode === "broken") throw new Error("مكتبة Supabase ما اتحملتش. اتأكد من النت واعمل ريفريش.");
      if (mode === "demo") {
        const raw = local.get(DEMO_KEY);
        if (raw === null) {
          const seed = demoSeed();
          local.set(DEMO_KEY, JSON.stringify(seed));
          return seed;
        }
        try { return JSON.parse(raw); } catch { return []; }
      }
      const { data, error } = await db.from(TABLE).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async add(row) {
      if (mode === "demo") {
        const all = await store.list();
        const id = all.reduce((m, r) => Math.max(m, r.id), 0) + 1;
        const full = {
          id, status: "open", created_at: new Date().toISOString(),
          solved_at: null, solved_by: null, solution: null, ...row,
        };
        local.set(DEMO_KEY, JSON.stringify([full, ...all]));
        return full;
      }
      const { data, error } = await db.from(TABLE).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      if (mode === "demo") {
        const all = (await store.list()).map((r) => (r.id === id ? { ...r, ...patch } : r));
        local.set(DEMO_KEY, JSON.stringify(all));
        return;
      }
      const { error } = await db.from(TABLE).update(patch).eq("id", id);
      if (error) throw error;
    },
    async remove(id) {
      if (mode === "demo") {
        const all = (await store.list()).filter((r) => r.id !== id);
        local.set(DEMO_KEY, JSON.stringify(all));
        return;
      }
      const { error } = await db.from(TABLE).delete().eq("id", id);
      if (error) throw error;
    },
    subscribe(onChange) {
      if (!db) return;
      db.channel("team_problems_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
        .subscribe();
    },
  };

  // ============ أدوات ============
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    reopen: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const fmt = (iso, opts) => new Date(iso).toLocaleString(LOCALE, opts);
  const dateLong = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeOnly = (iso) => fmt(iso, { hour: "numeric", minute: "2-digit" });
  const dateTime = (iso) => `${dateLong(iso)} · ${timeOnly(iso)}`;

  // العد بالعربي: مشكلة واحدة، مشكلتين، 3 مشاكل، 11 مشكلة
  const plural = (n, [one, two, few, many]) =>
    n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  const WORDS = {
    minute: ["دقيقة", "دقيقتين", "دقايق", "دقيقة"],
    hour: ["ساعة", "ساعتين", "ساعات", "ساعة"],
    day: ["يوم", "يومين", "أيام", "يوم"],
  };
  function duration(ms) {
    const m = Math.max(1, Math.round(ms / 60e3));
    if (m < 60) return plural(m, WORDS.minute);
    const h = Math.round(m / 60);
    if (h < 24) return plural(h, WORDS.hour);
    return plural(Math.round(h / 24), WORDS.day);
  }

  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const UNITS = [["minute", 60], ["hour", 3600], ["day", 86400], ["week", 604800], ["month", 2592000], ["year", 31536000]];
  function ago(iso) {
    const s = (new Date(iso) - Date.now()) / 1000;
    if (Math.abs(s) < 45) return "دلوقتي";
    let unit = "minute", sec = 60;
    for (const [u, n] of UNITS) if (Math.abs(s) >= n) { unit = u; sec = n; }
    return rtf.format(Math.round(s / sec), unit);
  }

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function groupOf(iso) {
    const d = new Date(iso);
    const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400e3);
    if (days <= 0) return "النهارده";
    if (days === 1) return "امبارح";
    if (days < 7) return "آخر 7 أيام";
    if (days < 30) return "آخر 30 يوم";
    return d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  }

  const HUES = [212, 158, 28, 268, 340, 190, 96, 8];
  function avatar(name, cls = "") {
    const n = String(name || "؟").trim() || "؟";
    let h = 0;
    for (const c of n) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `<span class="avatar ${cls}" style="--h:${HUES[h % HUES.length]}" aria-hidden="true">${esc([...n][0])}</span>`;
  }

  const myName = () => (local.get(NAME_KEY) || "").trim();
  function saveName(n) {
    if (!n) return;
    local.set(NAME_KEY, n);
    renderMe();
  }

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3200);
  }

  function notice(text, { error = false, action = null, onAction = null } = {}) {
    $("notice").hidden = !text;
    $("notice").classList.toggle("error", error);
    $("notice-text").textContent = text || "";
    $("notice-action").hidden = !action;
    $("notice-action").textContent = action || "";
    $("notice-action").onclick = onAction;
  }

  // ============ الحالة ============
  let issues = [];
  let loaded = false;
  let tab = ["open", "solved", "all"].includes(local.get(TAB_KEY)) ? local.get(TAB_KEY) : "open";
  const parseHash = (h) => {
    const m = /^#p(\d+)$/.exec(h || "");
    return m ? { view: "issue", id: Number(m[1]) } : { view: "new" };
  };
  let route = parseHash(location.hash);
  const draft = { title: "", details: "", note: "", author: "" };
  let viewPending = false;

  const findIssue = (id) => issues.find((i) => i.id === id);
  const typingIn = (el) => {
    const a = document.activeElement;
    return Boolean(a && el.contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA"));
  };

  // ============ القايمة الجانبية ============
  const EMPTY = {
    open: "مفيش مشاكل مفتوحة. كله تمام.",
    solved: "لسه مفيش مشاكل اتحلت.",
    all: "لسه محدش سجّل أي مشكلة.",
  };

  function renderTabs() {
    const open = issues.filter((i) => i.status === "open").length;
    $("count-open").textContent = open;
    $("count-solved").textContent = issues.length - open;
    $("count-all").textContent = issues.length;
    document.querySelectorAll("#tabs [role=tab]").forEach((t) =>
      t.setAttribute("aria-selected", String(t.dataset.status === tab))
    );

    const names = new Set([myName(), ...issues.flatMap((i) => [i.author, i.solved_by])].filter(Boolean));
    $("names").innerHTML = [...names].map((n) => `<option value="${esc(n)}"></option>`).join("");
  }

  function renderList() {
    const el = $("list");
    if (!loaded) {
      el.innerHTML = '<div class="sk"></div>'.repeat(6);
      return;
    }
    const q = $("search").value.trim().toLowerCase();
    const rows = issues
      .filter((i) => tab === "all" || i.status === tab)
      .filter((i) => !q || [i.title, i.details, i.note, i.author, i.solved_by, i.solution]
        .some((f) => (f || "").toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!rows.length) {
      el.innerHTML = `<p class="sb-empty">${q ? `مفيش نتايج لـ "${esc(q)}".` : EMPTY[tab]}</p>`;
      return;
    }

    let html = "";
    let lastGroup = null;
    for (const i of rows) {
      const g = groupOf(i.created_at);
      if (g !== lastGroup) {
        html += `<h3 class="sb-group">${esc(g)}</h3>`;
        lastGroup = g;
      }
      const active = route.view === "issue" && route.id === i.id;
      const solved = i.status === "solved";
      html += `
        <button type="button" class="sb-item${active ? " active" : ""}${solved ? " solved" : ""}" data-id="${i.id}"
          ${active ? 'aria-current="page"' : ""} title="${esc(`${i.title} — ${i.author}، ${ago(i.created_at)}`)}">
          <span class="dot${solved ? " solved" : ""}" aria-hidden="true"></span>
          <span class="sb-item-title">${esc(i.title)}</span>
        </button>`;
    }
    el.innerHTML = html;
  }

  function renderMe() {
    const n = myName();
    $("me-av").innerHTML = avatar(n || "؟");
    $("me-name").textContent = n || "اكتب اسمك";
    $("me-name").classList.toggle("empty", !n);
    const status = $("me-status");
    status.textContent = mode === "live" ? "متصل · تحديث لحظي" : mode === "demo" ? "وضع تجربة" : "مش متصل";
    status.className = "me-status " + (mode === "live" ? "live" : mode === "demo" ? "" : "off");
  }

  // ============ المحتوى ============
  function renderTop() {
    const actions = $("top-actions");
    if (route.view === "issue") {
      const i = findIssue(route.id);
      $("crumb").innerHTML = `<span>المشاكل</span><span class="sep">/</span><b>#${route.id}</b>`;
      actions.innerHTML = i
        ? `${mode === "live" ? `<button type="button" class="btn btn-ghost btn-sm" data-action="copy">${icon("link")} انسخ اللينك</button>` : ""}
           <button type="button" class="btn btn-ghost btn-sm danger" data-action="delete">${icon("trash")} امسح</button>`
        : "";
    } else {
      $("crumb").innerHTML = "<b>مشكلة جديدة</b>";
      actions.innerHTML = "";
    }
  }

  function composeHtml() {
    const author = draft.author || myName();
    return `
      <section class="compose">
        <header class="view-head">
          <h1>مشكلة جديدة</h1>
          <p>سجّل المشكلة، وهتظهر للفريق كله في القايمة على طول.</p>
        </header>
        <form id="issue-form" class="form" novalidate>
          <div class="field">
            <label for="title">اسم المشكلة <span class="req" aria-hidden="true">*</span></label>
            <input id="title" class="input input-lg" type="text" maxlength="120" autocomplete="off"
              placeholder="مثلًا: البوت مش بيرد على طلبات الواتساب" value="${esc(draft.title)}" />
            <p class="field-error" id="title-error" hidden>اكتب اسم للمشكلة عشان تظهر بيه في القايمة.</p>
          </div>

          <div class="field">
            <label for="details">وصف المشكلة <span class="optional">اختياري</span></label>
            <textarea id="details" class="input" rows="5" placeholder="حصلت إمتى؟ فين بالظبط؟ جربت إيه؟">${esc(draft.details)}</textarea>
          </div>

          <div class="field">
            <label for="note">ملاحظة <span class="optional">اختياري</span></label>
            <textarea id="note" class="input" rows="2" placeholder="أي حاجة زيادة حابب الفريق يعرفها">${esc(draft.note)}</textarea>
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="author">اسمك <span class="req" aria-hidden="true">*</span></label>
              <input id="author" class="input" type="text" maxlength="60" list="names" autocomplete="name"
                placeholder="اكتب اسمك" value="${esc(author)}" />
              <p class="field-error" id="author-error" hidden>اكتب اسمك عشان الفريق يعرف مين سجّل المشكلة.</p>
            </div>
            <div class="field">
              <span class="label" id="now-label">التاريخ والوقت</span>
              <div class="auto-date" role="group" aria-labelledby="now-label">
                ${icon("clock")}<span id="now">${esc(dateTime(new Date().toISOString()))}</span>
                <span class="tag">تلقائي</span>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button id="submit-btn" type="submit" class="btn btn-primary btn-lg">${icon("plus")} سجّل المشكلة</button>
          </div>
        </form>
      </section>`;
  }

  function detailHtml(i) {
    const solved = i.status === "solved";
    const badge = `<span class="badge${solved ? " solved" : ""}">${solved ? "اتحلت" : "متحلتش"}</span>`;
    const person = (n) => (n ? `${avatar(n, "sm")}<span>${esc(n)}</span>` : `<span class="sub">مش متسجل</span>`);
    const when = (iso) => `<span>${esc(dateLong(iso))}</span><span class="sub">${esc(timeOnly(iso))}</span>`;

    const props = [
      ["الحالة", badge],
      ["سجّلها", person(i.author)],
      ["اتسجلت", when(i.created_at)],
    ];
    if (solved) {
      props.push(
        ["حلّها", person(i.solved_by)],
        ["اتحلت", when(i.solved_at)],
        ["مدة الحل", `<span>${esc(duration(new Date(i.solved_at) - new Date(i.created_at)))}</span>`]
      );
    } else {
      props.push(["مفتوحة من", `<span>${esc(duration(Date.now() - new Date(i.created_at)))}</span>`]);
    }

    const section = (title, text, cls = "") =>
      `<section class="section ${cls}"><h2>${title}</h2>${text ? `<p>${esc(text)}</p>` : `<p class="none">مفيش.</p>`}</section>`;

    const action = solved
      ? `<div class="card solved-card">
          <div class="solved-text">${icon("check")}<span>المشكلة دي اتقفلت${i.solved_by ? ` على إيد <b>${esc(i.solved_by)}</b>` : ""}.</span></div>
          <button type="button" class="btn btn-secondary" data-action="reopen">${icon("reopen")} إعادة فتح</button>
        </div>`
      : `<form id="resolve-form" class="card resolve" novalidate>
          <div class="card-head">
            <h2>قفل المشكلة</h2>
            <p>لما تتحل، سجّل مين حلها وإزاي، عشان لو اتكررت نعرف نعمل إيه.</p>
          </div>
          <div class="field">
            <label for="how">إزاي اتحلت؟ <span class="optional">اختياري</span></label>
            <textarea id="how" class="input" rows="3" placeholder="اكتب الحل باختصار"></textarea>
          </div>
          <div class="row-end">
            <div class="field">
              <label for="by">مين اللي حلها؟ <span class="req" aria-hidden="true">*</span></label>
              <input id="by" class="input" type="text" maxlength="60" list="names" autocomplete="name"
                placeholder="اسمك" value="${esc(myName())}" />
            </div>
            <button type="submit" class="btn btn-success btn-lg">${icon("check")} اتحلت</button>
          </div>
          <p class="field-error" id="by-error" hidden>اكتب اسمك عشان نعرف مين اللي حلها.</p>
        </form>`;

    return `
      <article class="detail">
        <header class="detail-head">
          <div class="kicker">${badge}<span class="ref">#${i.id}</span></div>
          <h1 class="detail-title">${esc(i.title)}</h1>
          <p class="byline">${avatar(i.author, "sm")}<span><b>${esc(i.author)}</b> سجّلها ${esc(ago(i.created_at))}</span></p>
        </header>
        <div class="detail-grid">
          <div class="detail-main">
            ${section("وصف المشكلة", i.details)}
            ${i.note ? section("ملاحظة", i.note) : ""}
            ${solved && i.solution ? section("إزاي اتحلت", i.solution, "solution") : ""}
            ${action}
          </div>
          <aside class="props" aria-label="بيانات المشكلة">
            <dl>${props.map(([k, v]) => `<div class="prop"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
          </aside>
        </div>
      </article>`;
  }

  const notFoundHtml = () => `
    <div class="state">
      <h1>المشكلة دي مش موجودة</h1>
      <p>ممكن يكون اللينك غلط. اختار مشكلة من القايمة أو سجّل مشكلة جديدة.</p>
      <button type="button" class="btn btn-primary" data-action="new">${icon("plus")} مشكلة جديدة</button>
    </div>`;

  function renderView(force = false) {
    const view = $("view");
    if (!force && typingIn(view)) { viewPending = true; return; }
    viewPending = false;
    renderTop();
    if (route.view === "new") {
      view.innerHTML = composeHtml();
    } else if (!loaded) {
      view.innerHTML = `<div class="view-loading">${'<div class="sk"></div>'.repeat(4)}</div>`;
    } else {
      const i = findIssue(route.id);
      view.innerHTML = i ? detailHtml(i) : notFoundHtml();
    }
  }

  // ============ التنقل ============
  function go(r) {
    route = r;
    try { history.replaceState(null, "", r.view === "issue" ? "#p" + r.id : "#new"); } catch {}
    renderList();
    renderView(true);
    $("main").scrollTop = 0;
    closeSidebar();
  }

  function openSidebar() {
    $("sidebar").classList.add("open");
    $("scrim").hidden = false;
  }
  function closeSidebar() {
    $("sidebar").classList.remove("open");
    $("scrim").hidden = true;
  }

  // ============ البيانات ============
  async function refresh() {
    issues = await store.list();
    loaded = true;
    renderTabs();
    renderList();
  }

  let reloadTimer;
  function reload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      try {
        await refresh();
        if (route.view === "issue") renderView();
      } catch (e) {
        console.error(e);
        notice(friendlyError(e), { error: true });
        $("list").innerHTML = '<p class="sb-empty">مقدرناش نحمّل المشاكل.</p>';
      }
    }, 60);
  }

  // ============ الأفعال ============
  function flagError(inputId, errorId, show) {
    $(inputId).setAttribute("aria-invalid", String(show));
    $(errorId).hidden = !show;
  }

  async function createIssue() {
    const title = $("title").value.trim();
    const author = $("author").value.trim();
    flagError("title", "title-error", !title);
    flagError("author", "author-error", !author);
    if (!title) return $("title").focus();
    if (!author) return $("author").focus();

    const btn = $("submit-btn");
    btn.disabled = true;
    try {
      const row = await store.add({
        title,
        author,
        details: $("details").value.trim() || null,
        note: $("note").value.trim() || null,
      });
      saveName(author);
      Object.assign(draft, { title: "", details: "", note: "", author: "" });
      if (tab === "solved") { tab = "open"; local.set(TAB_KEY, tab); }
      await refresh();
      go({ view: "issue", id: row.id });
      toast(`اتسجلت المشكلة #${row.id}`);
    } catch (err) {
      console.error(err);
      toast("مقدرتش أسجّل المشكلة: " + friendlyError(err));
      btn.disabled = false;
    }
  }

  async function resolveIssue(form) {
    const by = $("by").value.trim();
    flagError("by", "by-error", !by);
    if (!by) return $("by").focus();

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await store.update(route.id, {
        status: "solved",
        solved_at: new Date().toISOString(),
        solved_by: by,
        solution: $("how").value.trim() || null,
      });
      saveName(by);
      document.activeElement?.blur();
      await refresh();
      renderView(true);
      toast("اتقفلت المشكلة واتنقلت لقسم «اتحلت»");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أحدّث المشكلة: " + friendlyError(err));
      btn.disabled = false;
    }
  }

  async function reopenIssue(btn) {
    btn.disabled = true;
    try {
      await store.update(route.id, { status: "open", solved_at: null, solved_by: null, solution: null });
      await refresh();
      renderView(true);
      toast("المشكلة اتفتحت تاني");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أحدّث المشكلة: " + friendlyError(err));
      btn.disabled = false;
    }
  }

  async function deleteIssue(btn) {
    const i = findIssue(route.id);
    if (!i) return;
    const ok = confirm(`تمسح المشكلة "${i.title}" نهائيًا؟ مفيش رجوع بعد كده.`);
    if (!ok) return;

    btn.disabled = true;
    try {
      await store.remove(route.id);
      await refresh();
      const next = issues.find((r) => r.status === "open") || issues[0];
      go(next ? { view: "issue", id: next.id } : { view: "new" });
      toast("اتمسحت المشكلة");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أمسح المشكلة: " + friendlyError(err));
      btn.disabled = false;
    }
  }

  function copyLink() {
    const url = location.href.split("#")[0] + "#p" + route.id;
    const fail = () => toast("مقدرتش أنسخ اللينك. اللينك: " + url);
    try {
      navigator.clipboard.writeText(url).then(() => toast("اتنسخ لينك المشكلة"), fail);
    } catch {
      fail();
    }
  }

  // ============ الأحداث ============
  function bindEvents() {
    $("new-btn").addEventListener("click", () => {
      go({ view: "new" });
      $("title")?.focus();
    });

    $("list").addEventListener("click", (e) => {
      const item = e.target.closest(".sb-item");
      if (item) go({ view: "issue", id: Number(item.dataset.id) });
    });

    $("tabs").addEventListener("click", (e) => {
      const t = e.target.closest("[role=tab]");
      if (!t) return;
      tab = t.dataset.status;
      local.set(TAB_KEY, tab);
      renderTabs();
      renderList();
    });

    $("search").addEventListener("input", renderList);

    const view = $("view");
    view.addEventListener("input", (e) => {
      const id = e.target.id;
      if (id in draft) draft[id] = e.target.value;
      if (id === "title" && e.target.value.trim()) flagError("title", "title-error", false);
      if (id === "author" && e.target.value.trim()) flagError("author", "author-error", false);
      if (id === "by" && e.target.value.trim()) flagError("by", "by-error", false);
    });

    view.addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.target.id === "issue-form") createIssue();
      if (e.target.id === "resolve-form") resolveIssue(e.target);
    });

    const onAction = (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === "reopen") reopenIssue(btn);
      if (a === "copy") copyLink();
      if (a === "delete") deleteIssue(btn);
      if (a === "new") go({ view: "new" });
    };
    view.addEventListener("click", onAction);
    $("top-actions").addEventListener("click", onAction);

    // لو وصل تحديث وحد بيكتب، نستنى لحد ما يخلص
    view.addEventListener("focusout", () => setTimeout(() => viewPending && renderView(), 0));

    $("menu-btn").addEventListener("click", openSidebar);
    $("sb-close").addEventListener("click", closeSidebar);
    $("scrim").addEventListener("click", closeSidebar);

    const dialog = $("name-dialog");
    $("me-btn").addEventListener("click", () => {
      $("name-input").value = myName();
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      $("name-input").focus();
    });
    dialog.addEventListener("close", () => {
      if (dialog.returnValue !== "save") return;
      const n = $("name-input").value.trim();
      if (!n) return;
      saveName(n);
      renderTabs();
      if ($("author") && !draft.author) $("author").value = n;
      if ($("by")) $("by").value = n;
      toast("اتحفظ اسمك");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSidebar();
      const a = document.activeElement;
      const typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openSidebar();
        $("search").focus();
      }
    });

    window.addEventListener("hashchange", () => {
      const r = parseHash(location.hash);
      if (r.view !== route.view || r.id !== route.id) go(r);
    });

    // الساعة في فورم "مشكلة جديدة" وتوقيت "من قد إيه"
    setInterval(() => {
      if ($("now")) $("now").textContent = dateTime(new Date().toISOString());
      if (route.view === "issue") renderView();
    }, 30e3);
  }

  // ============ التشغيل ============
  function showModeNotice() {
    if (mode === "demo") {
      const hasSeed = (local.get(DEMO_KEY) ?? "null") !== "[]";
      notice("وضع تجربة: المشاكل بتتسجل على جهازك بس. حط بيانات Supabase في config.js عشان الفريق كله يشوف نفس القايمة.", hasSeed ? {
        action: "امسح الأمثلة",
        onAction: async () => {
          local.set(DEMO_KEY, "[]");
          await refresh();
          showModeNotice();
          go({ view: "new" });
          toast("اتمسحت الأمثلة");
        },
      } : {});
    } else if (mode === "broken") {
      notice("مكتبة Supabase ما اتحملتش. اتأكد من النت واعمل ريفريش.", { error: true });
    }
  }

  function start() {
    $("app").hidden = false;
    renderMe();
    renderTabs();
    renderList();
    renderView(true);
    showModeNotice();
    bindEvents();
    store.subscribe(reload);
    reload();
  }

  function gate() {
    const pass = cfg.TEAM_PASSWORD;
    if (!pass || session.get("team_problems_unlocked") === pass) return start();

    $("lock").hidden = false;
    $("lock-input").focus();
    $("lock-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if ($("lock-input").value === pass) {
        session.set("team_problems_unlocked", pass);
        $("lock").hidden = true;
        start();
      } else {
        $("lock-error").hidden = false;
        $("lock-input").select();
      }
    });
  }

  gate();
})();
