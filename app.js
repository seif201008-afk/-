(() => {
  const cfg = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  // ---------- التخزين: Supabase أو وضع تجربة محلي ----------
  const useSupabase = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const db = useSupabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const LOCAL_KEY = "team_issues_demo";

  const store = {
    async list() {
      if (!db) return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      const { data, error } = await db.from(cfg.TABLE).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async add(issue) {
      if (!db) {
        const all = await store.list();
        const row = { id: Date.now(), status: "open", created_at: new Date().toISOString(), solved_at: null, ...issue };
        localStorage.setItem(LOCAL_KEY, JSON.stringify([row, ...all]));
        return row;
      }
      const { data, error } = await db.from(cfg.TABLE).insert(issue).select().single();
      if (error) throw error;
      return data;
    },
    async setStatus(id, status) {
      const patch = { status, solved_at: status === "solved" ? new Date().toISOString() : null };
      if (!db) {
        const all = (await store.list()).map((r) => (r.id === id ? { ...r, ...patch } : r));
        localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
        return;
      }
      const { error } = await db.from(cfg.TABLE).update(patch).eq("id", id);
      if (error) throw error;
    },
    subscribe(onChange) {
      if (!db) return;
      db.channel("team_issues_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: cfg.TABLE }, onChange)
        .subscribe();
    },
  };

  // ---------- الحالة ----------
  let issues = [];
  let statusFilter = "open";

  // ---------- أدوات ----------
  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const fmtDate = (iso) =>
    new Date(iso).toLocaleString("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
    });

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 2500);
  }

  function fillSelect(el, items, placeholder) {
    el.innerHTML =
      (placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "") +
      items.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  }

  // ---------- العرض ----------
  function render() {
    const q = $("search").value.trim().toLowerCase();
    const cat = $("filter-category").value;

    $("count-open").textContent = issues.filter((i) => i.status === "open").length;
    $("count-solved").textContent = issues.filter((i) => i.status === "solved").length;
    $("count-all").textContent = issues.length;

    const shown = issues.filter(
      (i) =>
        (statusFilter === "all" || i.status === statusFilter) &&
        (!cat || i.category === cat) &&
        (!q || [i.problem, i.note, i.author].some((f) => (f || "").toLowerCase().includes(q)))
    );

    $("empty").classList.toggle("hidden", shown.length > 0);
    $("list").innerHTML = shown
      .map((i) => {
        const solved = i.status === "solved";
        return `
        <article class="issue ${solved ? "solved" : ""}">
          <div class="issue-head">
            <span class="chip status-${i.status}">${solved ? "✅ اتحلت" : "🟠 مفتوحة"}</span>
            <span class="chip">${escapeHtml(i.category)}</span>
          </div>
          <p class="problem">${escapeHtml(i.problem)}</p>
          ${i.note ? `<p class="note">📝 ${escapeHtml(i.note)}</p>` : ""}
          <div class="issue-foot">
            <span>👤 ${escapeHtml(i.author)} · 🕒 ${fmtDate(i.created_at)}</span>
            <button class="toggle" data-id="${i.id}" data-next="${solved ? "open" : "solved"}">
              ${solved ? "↩️ إعادة فتح" : "✔️ اتحلت"}
            </button>
          </div>
        </article>`;
      })
      .join("");
  }

  async function reload() {
    try {
      issues = await store.list();
      render();
    } catch (e) {
      console.error(e);
      toast("مشكلة في تحميل البيانات: " + e.message);
    }
  }

  // ---------- الأحداث ----------
  function bindEvents() {
    $("issue-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const issue = {
        problem: $("problem").value.trim(),
        note: $("note").value.trim() || null,
        author: $("author").value,
        category: $("category").value,
      };
      if (!issue.problem || !issue.author) return toast("اكتب المشكلة واختار اسمك");

      const btn = $("submit-btn");
      btn.disabled = true;
      try {
        await store.add(issue);
        localStorage.setItem("team_issues_author", issue.author);
        $("problem").value = "";
        $("note").value = "";
        toast("اتضافت المشكلة ✅");
        await reload();
      } catch (err) {
        console.error(err);
        toast("مقدرتش أضيف المشكلة: " + err.message);
      } finally {
        btn.disabled = false;
      }
    });

    $("list").addEventListener("click", async (e) => {
      const btn = e.target.closest(".toggle");
      if (!btn) return;
      btn.disabled = true;
      try {
        await store.setStatus(Number(btn.dataset.id), btn.dataset.next);
        await reload();
      } catch (err) {
        console.error(err);
        toast("مقدرتش أغيّر الحالة: " + err.message);
        btn.disabled = false;
      }
    });

    $("status-tabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      statusFilter = tab.dataset.status;
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      render();
    });

    $("search").addEventListener("input", render);
    $("filter-category").addEventListener("change", render);
  }

  // ---------- التشغيل ----------
  function start() {
    $("app").classList.remove("hidden");

    fillSelect($("author"), cfg.TEAM_NAMES, "— اختار اسمك —");
    fillSelect($("category"), cfg.CATEGORIES);
    fillSelect($("filter-category"), cfg.CATEGORIES, "كل التصنيفات");

    const lastAuthor = localStorage.getItem("team_issues_author");
    if (lastAuthor && cfg.TEAM_NAMES.includes(lastAuthor)) $("author").value = lastAuthor;

    const badge = $("mode-badge");
    badge.textContent = useSupabase ? "● متصل" : "وضع تجربة (محلي)";
    badge.classList.toggle("live", useSupabase);
    if (!useSupabase) badge.title = "حط بيانات Supabase في config.js عشان الفريق كله يشوف نفس اللستة";

    bindEvents();
    store.subscribe(reload);
    reload();
  }

  function gate() {
    const pass = cfg.TEAM_PASSWORD;
    if (!pass || sessionStorage.getItem("team_issues_unlocked") === pass) return start();

    $("lock").classList.remove("hidden");
    $("lock-input").focus();
    $("lock-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if ($("lock-input").value === pass) {
        sessionStorage.setItem("team_issues_unlocked", pass);
        $("lock").classList.add("hidden");
        start();
      } else {
        $("lock-error").classList.remove("hidden");
      }
    });
  }

  gate();
})();
