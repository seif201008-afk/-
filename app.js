(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const LOCALE = "ar-EG-u-nu-latn";

  // ---------- تخزين آمن على الجهاز (بيشتغل حتى لو المتصفح مانع التخزين) ----------
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

  // ---------- مصدر البيانات: Supabase أو وضع تجربة ----------
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const mode = !configured ? "demo" : window.supabase ? "live" : "broken";
  const db = mode === "live" ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const TABLE = cfg.TABLE || "team_problems";
  const DEMO_KEY = "team_problems_demo";

  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const demoSeed = () => [
    {
      id: 3, title: "البوت مش بيرد على طلبات الواتساب",
      details: "من الساعة 2 الضهر البوت بيستلم الرسايل ومبيردش خالص. جربت من رقمين مختلفين ونفس الحكاية.",
      note: "العملاء بدأوا يتصلوا بالتليفون بدل الواتساب.",
      author: "عاصم", status: "open", created_at: hoursAgo(2),
      solved_at: null, solved_by: null, solution: null,
    },
    {
      id: 2, title: "أسعار المنيو مش متحدثة في الداشبورد",
      details: "غيرنا أسعار 4 أصناف امبارح بس لسه القديمة هي اللي ظاهرة.",
      note: null, author: "مريم", status: "open", created_at: hoursAgo(26),
      solved_at: null, solved_by: null, solution: null,
    },
    {
      id: 1, title: "صفحة الدفع بتعلق على الآيفون",
      details: "لما العميل يدوس \"ادفع\" الصفحة بتفضل تحمّل ومش بتكمل.",
      note: null, author: "كريم", status: "solved", created_at: hoursAgo(80),
      solved_at: hoursAgo(70), solved_by: "يوسف",
      solution: "كان فيه كاش قديم على السيرفر، اتمسح والدفع رجع يشتغل.",
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
        const full = {
          id: Date.now(), status: "open", created_at: new Date().toISOString(),
          solved_at: null, solved_by: null, solution: null, ...row,
        };
        local.set(DEMO_KEY, JSON.stringify([full, ...all]));
        return;
      }
      const { error } = await db.from(TABLE).insert(row);
      if (error) throw error;
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
    subscribe(onChange) {
      if (!db) return;
      db.channel("team_problems_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
        .subscribe();
    },
  };

  // ---------- الحالة ----------
  let issues = [];
  let loaded = false;
  let tab = ["open", "solved", "all"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "open";
  const openIds = new Set();
  let listPending = false;

  // ---------- أدوات ----------
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fullDate = (iso) =>
    new Date(iso).toLocaleString(LOCALE, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const UNITS = [["minute", 60], ["hour", 3600], ["day", 86400], ["week", 604800], ["month", 2592000], ["year", 31536000]];
  function ago(iso) {
    const s = (new Date(iso) - Date.now()) / 1000;
    if (Math.abs(s) < 45) return "دلوقتي";
    let unit = "minute", sec = 60;
    for (const [u, n] of UNITS) if (Math.abs(s) >= n) { unit = u; sec = n; }
    return rtf.format(Math.round(s / sec), unit);
  }

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3000);
  }

  function banner(text, { error = false, action = null, onAction = null } = {}) {
    $("banner").hidden = !text;
    $("banner").classList.toggle("error", error);
    $("banner-text").textContent = text || "";
    const btn = $("banner-action");
    btn.hidden = !action;
    btn.textContent = action || "";
    btn.onclick = onAction;
  }

  const myName = () => (local.get(NAME_KEY) || "").trim();

  // ---------- العرض ----------
  const chevron = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function itemHtml(i) {
    const solved = i.status === "solved";
    const isOpen = openIds.has(String(i.id));
    const block = (label, text) =>
      `<div class="block"><h3>${label}</h3>${text ? `<p>${esc(text)}</p>` : `<p class="none">مفيش</p>`}</div>`;

    const timeline = `
      <ol class="timeline">
        <li>اتسجلت ${esc(fullDate(i.created_at))} بواسطة <b>${esc(i.author)}</b></li>
        ${solved ? `<li class="done">اتحلت ${esc(fullDate(i.solved_at))}${i.solved_by ? ` بواسطة <b>${esc(i.solved_by)}</b>` : ""}</li>` : ""}
      </ol>`;

    const action = solved
      ? `<div class="actions"><button type="button" class="btn btn-ghost btn-sm reopen" data-id="${i.id}">إعادة فتح المشكلة</button></div>`
      : `<form class="resolve" data-id="${i.id}" novalidate>
          <p class="resolve-title">المشكلة دي اتحلت؟</p>
          <div class="field">
            <label for="how-${i.id}">إزاي اتحلت؟ <span class="optional">اختياري</span></label>
            <textarea id="how-${i.id}" name="how" rows="2" placeholder="اكتب الحل عشان لو اتكررت نعرف نعمل إيه"></textarea>
          </div>
          <div class="resolve-row">
            <div class="field">
              <label for="by-${i.id}">مين اللي حلها؟</label>
              <input id="by-${i.id}" name="by" type="text" maxlength="60" list="names" value="${esc(myName())}" placeholder="اسمك" />
            </div>
            <button type="submit" class="btn btn-solve">اتحلت</button>
          </div>
        </form>`;

    return `
      <details class="item ${solved ? "is-solved" : ""}" data-id="${i.id}" ${isOpen ? "open" : ""}>
        <summary>
          <span class="dot ${solved ? "solved" : ""}" aria-hidden="true"></span>
          <span class="item-main">
            <span class="item-title">${esc(i.title)}</span>
            <span class="item-meta">${esc(i.author)} · ${esc(ago(i.created_at))}</span>
          </span>
          ${tab === "all" ? `<span class="pill ${solved ? "solved" : ""}">${solved ? "اتحلت" : "متحلتش"}</span>` : ""}
          ${chevron}
        </summary>
        <div class="item-body">
          ${timeline}
          ${block("وصف المشكلة", i.details)}
          ${i.note ? block("ملاحظة", i.note) : ""}
          ${solved && i.solution ? block("إزاي اتحلت", i.solution) : ""}
          ${action}
        </div>
      </details>`;
  }

  const EMPTY = {
    open: "مفيش مشاكل مفتوحة. كله تمام.",
    solved: "لسه مفيش مشاكل اتحلت.",
    all: "لسه محدش سجّل أي مشكلة.",
  };

  function visible() {
    const q = $("search").value.trim().toLowerCase();
    let rows = issues.filter((i) => tab === "all" || i.status === tab);
    if (q) {
      rows = rows.filter((i) =>
        [i.title, i.details, i.note, i.author, i.solved_by, i.solution].some((f) => (f || "").toLowerCase().includes(q))
      );
    }
    const by = tab === "solved" ? "solved_at" : "created_at";
    return rows.sort((a, b) => new Date(b[by]) - new Date(a[by]));
  }

  // لو حد بيكتب جوه القايمة، منعيدش رسمها عشان ما يضيعش اللي كتبه
  const typingInList = () => {
    const a = document.activeElement;
    return a && $("list").contains(a) && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
  };

  function renderList() {
    if (typingInList()) { listPending = true; return; }
    listPending = false;
    if (!loaded) return;
    const rows = visible();
    const q = $("search").value.trim();
    $("list").innerHTML = rows.length
      ? rows.map(itemHtml).join("")
      : `<p class="list-empty">${q ? `مفيش نتايج لـ "${esc(q)}".` : EMPTY[tab]}</p>`;
  }

  function renderCounts() {
    const open = issues.filter((i) => i.status === "open").length;
    const solved = issues.length - open;
    $("count-open").textContent = open;
    $("count-solved").textContent = solved;
    $("count-all").textContent = issues.length;
    $("summary").innerHTML = !loaded
      ? "بيحمّل…"
      : issues.length === 0
        ? "لسه مفيش مشاكل متسجلة."
        : `<b class="n-open">${open}</b> لسه متحلتش &nbsp;·&nbsp; <b class="n-solved">${solved}</b> اتحلت`;

    const names = new Set([myName(), ...issues.flatMap((i) => [i.author, i.solved_by])].filter(Boolean));
    $("names").innerHTML = [...names].map((n) => `<option value="${esc(n)}"></option>`).join("");
  }

  function renderTabs() {
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.status === tab)));
  }

  function render() {
    renderTabs();
    renderCounts();
    renderList();
  }

  let reloadTimer;
  function reload() {
    clearTimeout(reloadTimer);
    return new Promise((resolve) => {
      reloadTimer = setTimeout(async () => {
        try {
          issues = await store.list();
          loaded = true;
          render();
        } catch (e) {
          console.error(e);
          banner(friendlyError(e), { error: true });
          $("list").innerHTML = `<p class="list-empty">مقدرناش نحمّل المشاكل.</p>`;
        }
        resolve();
      }, 50);
    });
  }

  // ---------- الأحداث ----------
  function setError(input, errorEl, show) {
    input.setAttribute("aria-invalid", String(show));
    errorEl.hidden = !show;
  }

  function bindEvents() {
    $("issue-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = $("title").value.trim();
      const author = $("author").value.trim();
      setError($("title"), $("title-error"), !title);
      setError($("author"), $("author-error"), !author);
      if (!title) return $("title").focus();
      if (!author) return $("author").focus();

      const btn = $("submit-btn");
      btn.disabled = true;
      try {
        await store.add({
          title,
          author,
          details: $("details").value.trim() || null,
          note: $("note").value.trim() || null,
        });
        local.set(NAME_KEY, author);
        ["title", "details", "note"].forEach((id) => ($(id).value = ""));
        if (tab === "solved") { tab = "open"; history.replaceState(null, "", "#open"); }
        toast("اتسجلت المشكلة");
        await reload();
      } catch (err) {
        console.error(err);
        toast("مقدرتش أسجّل المشكلة: " + friendlyError(err));
      } finally {
        btn.disabled = false;
      }
    });

    $("title").addEventListener("input", () => $("title").value.trim() && setError($("title"), $("title-error"), false));
    $("author").addEventListener("input", () => $("author").value.trim() && setError($("author"), $("author-error"), false));

    // فتح وقفل المشكلة في القايمة
    $("list").addEventListener("toggle", (e) => {
      const d = e.target;
      if (!d.classList?.contains("item")) return;
      d.open ? openIds.add(d.dataset.id) : openIds.delete(d.dataset.id);
    }, true);

    // "اتحلت"
    $("list").addEventListener("submit", async (e) => {
      const form = e.target.closest(".resolve");
      if (!form) return;
      e.preventDefault();
      const by = form.elements.by.value.trim();
      if (!by) {
        form.elements.by.setAttribute("aria-invalid", "true");
        form.elements.by.focus();
        return toast("اكتب اسمك عشان نعرف مين اللي حلها");
      }
      const btn = form.querySelector("button");
      btn.disabled = true;
      try {
        await store.update(Number(form.dataset.id), {
          status: "solved",
          solved_at: new Date().toISOString(),
          solved_by: by,
          solution: form.elements.how.value.trim() || null,
        });
        local.set(NAME_KEY, by);
        document.activeElement?.blur();
        toast("تمام، المشكلة اتنقلت لقسم اللي اتحلت");
        await reload();
      } catch (err) {
        console.error(err);
        toast("مقدرتش أحدّث المشكلة: " + friendlyError(err));
        btn.disabled = false;
      }
    });

    // "إعادة فتح"
    $("list").addEventListener("click", async (e) => {
      const btn = e.target.closest(".reopen");
      if (!btn) return;
      btn.disabled = true;
      try {
        await store.update(Number(btn.dataset.id), { status: "open", solved_at: null, solved_by: null, solution: null });
        toast("المشكلة رجعت لقسم اللي متحلتش");
        await reload();
      } catch (err) {
        console.error(err);
        toast("مقدرتش أحدّث المشكلة: " + friendlyError(err));
        btn.disabled = false;
      }
    });

    $("list").addEventListener("focusout", () => setTimeout(() => listPending && renderList(), 0));

    $("tabs").addEventListener("click", (e) => {
      const t = e.target.closest(".tab");
      if (!t) return;
      tab = t.dataset.status;
      history.replaceState(null, "", "#" + tab);
      render();
    });

    $("search").addEventListener("input", renderList);

    // تحديث "من قد إيه" كل دقيقة
    setInterval(renderList, 60e3);
  }

  // ---------- التشغيل ----------
  function start() {
    $("app").hidden = false;
    $("author").value = myName();

    const badge = $("mode-badge");
    badge.textContent = mode === "live" ? "متصل" : "وضع تجربة";
    badge.classList.toggle("live", mode === "live");

    if (mode === "demo") {
      banner("وضع تجربة: المشاكل دي أمثلة ومتسجلة على جهازك بس. حط بيانات Supabase في config.js عشان الفريق كله يشوف نفس القايمة.", {
        action: "امسح الأمثلة",
        onAction: async () => {
          local.set(DEMO_KEY, "[]");
          openIds.clear();
          banner("وضع تجربة: المشاكل بتتسجل على جهازك بس. حط بيانات Supabase في config.js عشان الفريق كله يشوف نفس القايمة.");
          await reload();
          toast("اتمسحت الأمثلة");
        },
      });
    } else if (mode === "broken") {
      $("submit-btn").disabled = true;
    }

    renderTabs();
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
