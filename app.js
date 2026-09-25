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
  const BUCKET = cfg.BUCKET || "problem-images";
  const MAX_IMAGES = 10;
  const MAX_BYTES = 5 * 1024 * 1024;

  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const demoSeed = () => [
    {
      id: 5, title: "البوت مش بيرد على طلبات الواتساب",
      details: "من الساعة 2 الضهر البوت بيستلم الرسايل ومبيردش خالص. جربت من رقمين مختلفين ونفس الحكاية.",
      note: "العملاء بدأوا يتصلوا بالتليفون بدل الواتساب.",
      author: "عاصم", status: "open", created_at: hoursAgo(2),
      solved_at: null, solved_by: null, solution: null, images: [],
    },
    {
      id: 4, title: "أسعار المنيو مش متحدثة في الداشبورد",
      details: "غيرنا أسعار 4 أصناف امبارح، بس لسه الأسعار القديمة هي اللي ظاهرة للعملاء.",
      note: null, author: "مريم", status: "open", created_at: hoursAgo(27),
      solved_at: null, solved_by: null, solution: null, images: [],
    },
    {
      id: 3, title: "صفحة الدفع بتعلق على الآيفون",
      details: "لما العميل يدوس \"ادفع\" الصفحة بتفضل تحمّل ومش بتكمل. على أندرويد شغالة عادي.",
      note: null, author: "كريم", status: "solved", created_at: hoursAgo(80),
      solved_at: hoursAgo(70), solved_by: "يوسف",
      solution: "كان فيه كاش قديم على السيرفر، اتمسح والدفع رجع يشتغل.", images: [],
    },
    {
      id: 2, title: "إشعارات الطلبات الجديدة بتوصل متأخر",
      details: "الإشعار بيوصل للمطعم بعد الطلب بحوالي 10 دقايق.",
      note: "حصلت في أكتر من فرع.", author: "مريم", status: "solved", created_at: hoursAgo(220),
      solved_at: hoursAgo(194), solved_by: "عاصم",
      solution: "المهمة اللي بتبعت الإشعارات كانت شغالة كل 10 دقايق، اتظبطت تشتغل كل دقيقة.", images: [],
    },
    {
      id: 1, title: "صور الأصناف مش بتظهر في الموقع",
      details: "كل الصور بتظهر مربع فاضي في صفحة المنيو.",
      note: null, author: "يوسف", status: "solved", created_at: hoursAgo(960),
      solved_at: hoursAgo(957), solved_by: "كريم",
      solution: "رابط التخزين اتغير، اتحدث في الإعدادات.", images: [],
    },
  ];

  const SETUP_IMAGES = "الصور لسه مش متفعّلة في Supabase. شغّل كود الصور مرة واحدة في SQL Editor.";

  const friendlyError = (e) => {
    const msg = String(e?.message || e || "");
    if (e?.kind === "not-image") return "الملف ده مش صورة.";
    if (e?.kind === "bad-image") return "مقدرتش أفتح الصورة دي. جرّب صورة JPG أو PNG.";
    if (e?.kind === "too-big" || /maximum allowed size|too large|payload/i.test(msg)) return "الصورة كبيرة زيادة. أقصى حجم 5 ميجا.";
    if (/mime type|not supported/i.test(msg)) return "نوع الصورة ده مش مدعوم. استخدم JPG أو PNG.";
    if (/'images' column|column "images"|images.*does not exist|bucket not found/i.test(msg)) return SETUP_IMAGES;
    if (e?.storage && /row-level security|unauthorized|permission|denied/i.test(msg)) return SETUP_IMAGES;
    if (e?.code === "42P01" || /relation .* does not exist/i.test(msg))
      return "الجدول مش موجود في Supabase. شغّل ملف supabase.sql الأول.";
    if (/fetch|network|Failed/i.test(msg)) return "مفيش اتصال بالسيرفر. اتأكد من النت وجرّب تاني.";
    if (/Invalid API key|JWT/i.test(msg)) return "مفتاح Supabase في config.js غلط.";
    return msg || "حصلت مشكلة غير متوقعة.";
  };

  const uid = () =>
    (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

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
          solved_at: null, solved_by: null, solution: null, images: [], ...row,
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
    // بترجع مرجع الصورة: مسارها في Supabase Storage، أو data URL في وضع التجربة
    async uploadImage({ blob, ext }) {
      if (mode === "demo") return blobToDataUrl(blob);
      const path = `${new Date().toISOString().slice(0, 7)}/${uid()}.${ext}`;
      const { error } = await db.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw Object.assign(new Error(error.message || "upload failed"), { storage: true });
      return path;
    },
    async removeImages(refs) {
      const paths = (refs || []).filter((r) => r && !/^(data:|blob:|https?:)/.test(r));
      if (!db || !paths.length) return;
      try {
        await db.storage.from(BUCKET).remove(paths);
      } catch (e) {
        console.warn(e);
      }
    },
    subscribe(onChange) {
      if (!db) return;
      db.channel("team_problems_changes")
        .on("postgres_changes", { event: "*", schema: "public", table: TABLE }, onChange)
        .subscribe();
    },
  };

  // ============ الصور ============
  const imagesOf = (i) => (Array.isArray(i?.images) ? i.images.filter(Boolean) : []);

  function imageUrl(ref) {
    if (!ref) return "";
    if (/^(data:|blob:|https?:)/.test(ref)) return ref;
    return db ? db.storage.from(BUCKET).getPublicUrl(ref).data.publicUrl : "";
  }

  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  const fail = (kind) => Object.assign(new Error(kind), { kind });

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(fail("bad-image")); };
      img.src = url;
    });
  }

  // بتصغّر الصورة قبل الرفع عشان تترفع بسرعة وما تاخدش مساحة
  async function prepareImage(file) {
    if (!file || !/^image\//.test(file.type)) throw fail("not-image");
    const maxSide = mode === "demo" ? 1280 : 1920;
    const keepLimit = mode === "demo" ? 300 * 1024 : 1.5 * 1024 * 1024;
    if (file.type === "image/gif") {
      if (file.size > (mode === "demo" ? keepLimit : MAX_BYTES)) throw fail("too-big");
      return { blob: file, ext: "gif" };
    }
    const img = await loadImage(file);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if (scale === 1 && file.size <= keepLimit && EXT[file.type]) return { blob: file, ext: EXT[file.type] };

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", mode === "demo" ? 0.8 : 0.86));
    if (!blob) throw fail("bad-image");
    if (blob.size > MAX_BYTES) throw fail("too-big");
    return { blob, ext: "jpg" };
  }

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
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
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
    image: ["صورة", "صورتين", "صور", "صورة"],
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
    toastTimer = setTimeout(() => (el.hidden = true), 3600);
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
  // images: صور المشكلة الجديدة قبل ما تترفع [{ key, blob, ext, url }]
  const draft = { title: "", details: "", note: "", author: "", images: [] };
  let viewPending = false;
  let uploadingIssue = null;
  let submitting = false;

  const findIssue = (id) => issues.find((i) => i.id === id);
  const typingIn = (el) => {
    const a = document.activeElement;
    return Boolean(a && el.contains(a) && ((a.tagName === "INPUT" && a.type !== "file") || a.tagName === "TEXTAREA"));
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
      const hasImages = imagesOf(i).length > 0;
      html += `
        <button type="button" class="sb-item${active ? " active" : ""}${solved ? " solved" : ""}" data-id="${i.id}"
          ${active ? 'aria-current="page"' : ""} title="${esc(`${i.title} — ${i.author}، ${ago(i.created_at)}`)}">
          <span class="dot${solved ? " solved" : ""}" aria-hidden="true"></span>
          <span class="sb-item-title">${esc(i.title)}</span>
          ${hasImages ? `<span class="sb-item-img" title="فيها صور">${icon("image")}</span>` : ""}
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

          <div class="field">
            <span class="label" id="images-label">صور <span class="optional">اختياري، لحد ${MAX_IMAGES} صور</span></span>
            <button type="button" id="dropzone" class="dropzone" data-action="pick-images" aria-labelledby="images-label" aria-describedby="images-hint">
              ${icon("image")}
              <span><b>اختار صور</b> أو اسحبها هنا</span>
              <span class="dz-hint" id="images-hint">وتقدر تلصق سكرين شوت على طول بـ Ctrl+V</span>
            </button>
            <div id="thumbs" class="thumbs" hidden></div>
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

  function renderDraftThumbs() {
    const el = $("thumbs");
    if (!el) return;
    el.hidden = !draft.images.length;
    el.innerHTML = draft.images
      .map((d, n) => `
        <div class="thumb">
          <img src="${d.url}" alt="صورة ${n + 1}" />
          <button type="button" class="thumb-x" data-action="unpick" data-key="${d.key}" aria-label="شيل الصورة ${n + 1}">${icon("x")}</button>
        </div>`)
      .join("");
  }

  function galleryHtml(i) {
    const imgs = imagesOf(i);
    const busy = uploadingIssue === i.id;
    const full = imgs.length >= MAX_IMAGES;
    const addBtn = `<button type="button" class="btn btn-ghost btn-sm" data-action="add-images" ${busy || full ? "disabled" : ""}>
        ${icon("image")} ${busy ? "بيرفع…" : "أضف صور"}</button>`;
    return `
      <section class="section gallery-zone">
        <div class="section-head">
          <h2>الصور${imgs.length ? ` · ${imgs.length}` : ""}</h2>
          ${addBtn}
        </div>
        ${imgs.length
          ? `<div class="gallery">${imgs
              .map((r, n) => `
                <button type="button" class="thumb" data-action="view-image" data-index="${n}" aria-label="افتح الصورة ${n + 1}">
                  <img src="${esc(imageUrl(r))}" alt="" loading="lazy" />
                </button>`)
              .join("")}</div>`
          : `<p class="none">مفيش صور. دوس "أضف صور"، أو اسحب صورة هنا، أو الصق سكرين شوت بـ Ctrl+V.</p>`}
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
            ${galleryHtml(i)}
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
      renderDraftThumbs();
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

  function clearDraftImages() {
    draft.images.forEach((d) => URL.revokeObjectURL(d.url));
    draft.images = [];
  }

  async function addDraftImages(files) {
    const list = [...files];
    const room = MAX_IMAGES - draft.images.length;
    if (room <= 0) return toast(`أقصى عدد ${MAX_IMAGES} صور للمشكلة.`);
    if (list.length > room) toast(`هتتضاف أول ${plural(room, WORDS.image)} بس. أقصى عدد ${MAX_IMAGES} صور للمشكلة.`);
    for (const file of list.slice(0, room)) {
      try {
        const prepared = await prepareImage(file);
        draft.images.push({ key: uid(), ...prepared, url: URL.createObjectURL(prepared.blob) });
      } catch (err) {
        toast(friendlyError(err));
      }
    }
    renderDraftThumbs();
  }

  function removeDraftImage(key) {
    const d = draft.images.find((x) => x.key === key);
    if (d) URL.revokeObjectURL(d.url);
    draft.images = draft.images.filter((x) => x.key !== key);
    renderDraftThumbs();
  }

  async function createIssue() {
    if (submitting) return;
    const title = $("title").value.trim();
    const author = $("author").value.trim();
    flagError("title", "title-error", !title);
    flagError("author", "author-error", !author);
    if (!title) return $("title").focus();
    if (!author) return $("author").focus();

    const btn = $("submit-btn");
    const label = btn.innerHTML;
    const setLabel = (text) => { if (btn.isConnected) btn.textContent = text; };
    submitting = true;
    btn.disabled = true;
    const uploaded = [];
    try {
      const pics = [...draft.images];
      for (const [n, pic] of pics.entries()) {
        setLabel(`بيرفع الصور (${n + 1} من ${pics.length})…`);
        uploaded.push(await store.uploadImage(pic));
      }
      setLabel("بيسجّل…");
      const row = {
        title,
        author,
        details: $("details").value.trim() || null,
        note: $("note").value.trim() || null,
      };
      if (uploaded.length) row.images = uploaded;
      const created = await store.add(row);
      saveName(author);
      clearDraftImages();
      Object.assign(draft, { title: "", details: "", note: "", author: "" });
      if (tab === "solved") { tab = "open"; local.set(TAB_KEY, tab); }
      await refresh();
      go({ view: "issue", id: created.id });
      toast(`اتسجلت المشكلة #${created.id}`);
    } catch (err) {
      console.error(err);
      store.removeImages(uploaded);
      toast("مقدرتش أسجّل المشكلة: " + friendlyError(err));
      if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    } finally {
      submitting = false;
    }
  }

  async function addImagesToIssue(files) {
    const id = route.id;
    const i = findIssue(id);
    if (!i || uploadingIssue) return;
    const list = [...files].filter((f) => /^image\//.test(f.type));
    if (!list.length) return toast("الملف ده مش صورة.");
    const room = MAX_IMAGES - imagesOf(i).length;
    if (room <= 0) return toast(`أقصى عدد ${MAX_IMAGES} صور للمشكلة.`);
    if (list.length > room) toast(`هتتضاف أول ${plural(room, WORDS.image)} بس. أقصى عدد ${MAX_IMAGES} صور للمشكلة.`);

    uploadingIssue = id;
    const btn = document.querySelector('[data-action="add-images"]');
    if (btn) { btn.disabled = true; btn.innerHTML = `${icon("image")} بيرفع…`; }
    const uploaded = [];
    try {
      for (const file of list.slice(0, room)) {
        uploaded.push(await store.uploadImage(await prepareImage(file)));
      }
      await refresh();
      const latest = imagesOf(findIssue(id));
      await store.update(id, { images: [...latest, ...uploaded].slice(0, MAX_IMAGES) });
      await refresh();
      toast(`اتضافت ${plural(uploaded.length, WORDS.image)}`);
    } catch (err) {
      console.error(err);
      store.removeImages(uploaded);
      toast("مقدرتش أضيف الصور: " + friendlyError(err));
    } finally {
      uploadingIssue = null;
      if (route.view === "issue" && route.id === id) renderView();
    }
  }

  function handleFiles(files) {
    const images = [...(files || [])].filter((f) => /^image\//.test(f.type));
    if (!images.length) return toast("الملف ده مش صورة.");
    if (route.view === "new") addDraftImages(images);
    else if (findIssue(route.id)) addImagesToIssue(images);
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
      const refs = imagesOf(i);
      await store.remove(i.id);
      store.removeImages(refs);
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
    const onFail = () => toast("مقدرتش أنسخ اللينك. اللينك: " + url);
    try {
      navigator.clipboard.writeText(url).then(() => toast("اتنسخ لينك المشكلة"), onFail);
    } catch {
      onFail();
    }
  }

  // ============ عارض الصور ============
  const lb = { refs: [], index: 0, issueId: null };

  function openLightbox(issueId, index) {
    const i = findIssue(issueId);
    if (!i) return;
    lb.refs = imagesOf(i);
    lb.index = index;
    lb.issueId = issueId;
    $("lightbox").hidden = false;
    document.body.classList.add("no-scroll");
    showLightbox();
    $("lb-close").focus();
  }

  function showLightbox() {
    const n = lb.refs.length;
    if (!n) return closeLightbox();
    lb.index = ((lb.index % n) + n) % n;
    const src = imageUrl(lb.refs[lb.index]);
    $("lb-img").src = src;
    $("lb-img").alt = `صورة ${lb.index + 1} من ${n}`;
    $("lb-count").textContent = `صورة ${lb.index + 1} من ${n}`;
    $("lb-open").hidden = src.startsWith("data:");
    $("lb-open").href = src;
    $("lb-prev").hidden = n < 2;
    $("lb-next").hidden = n < 2;
  }

  function closeLightbox() {
    if ($("lightbox").hidden) return;
    $("lightbox").hidden = true;
    $("lb-img").removeAttribute("src");
    document.body.classList.remove("no-scroll");
  }

  async function deleteImage() {
    const ref = lb.refs[lb.index];
    if (!ref || !confirm("تمسح الصورة دي؟")) return;
    const btn = $("lb-delete");
    btn.disabled = true;
    try {
      await refresh();
      const next = imagesOf(findIssue(lb.issueId)).filter((r) => r !== ref);
      await store.update(lb.issueId, { images: next });
      store.removeImages([ref]);
      await refresh();
      lb.refs = next;
      if (lb.index >= next.length) lb.index = next.length - 1;
      showLightbox();
      if (route.view === "issue") renderView();
      toast("اتمسحت الصورة");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أمسح الصورة: " + friendlyError(err));
    } finally {
      btn.disabled = false;
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
      if (id in draft && id !== "images") draft[id] = e.target.value;
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
      if (a === "pick-images" || a === "add-images") $("file-input").click();
      if (a === "unpick") removeDraftImage(btn.dataset.key);
      if (a === "view-image") openLightbox(route.id, Number(btn.dataset.index));
    };
    view.addEventListener("click", onAction);
    $("top-actions").addEventListener("click", onAction);

    $("file-input").addEventListener("change", (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      if (files.length) handleFiles(files);
    });

    // سحب وإفلات الصور على المحتوى
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
    let dragDepth = 0;
    view.addEventListener("dragenter", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      view.classList.add("dragging");
    });
    view.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    view.addEventListener("dragleave", () => {
      if (--dragDepth <= 0) { dragDepth = 0; view.classList.remove("dragging"); }
    });
    view.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      view.classList.remove("dragging");
      handleFiles(e.dataTransfer.files);
    });
    // عشان المتصفح ما يفتحش الصورة لو اتسابت برّه المكان المخصص
    window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener("drop", (e) => { if (hasFiles(e)) e.preventDefault(); });

    // لصق سكرين شوت
    document.addEventListener("paste", (e) => {
      if (!$("lightbox").hidden) return;
      const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      if (route.view === "issue" && !findIssue(route.id)) return;
      e.preventDefault();
      handleFiles(files);
    });

    // لو وصل تحديث وحد بيكتب، نستنى لحد ما يخلص
    view.addEventListener("focusout", () => setTimeout(() => viewPending && renderView(), 0));

    $("menu-btn").addEventListener("click", openSidebar);
    $("sb-close").addEventListener("click", closeSidebar);
    $("scrim").addEventListener("click", closeSidebar);

    // عارض الصور
    $("lb-close").addEventListener("click", closeLightbox);
    $("lb-prev").addEventListener("click", () => { lb.index--; showLightbox(); });
    $("lb-next").addEventListener("click", () => { lb.index++; showLightbox(); });
    $("lb-delete").addEventListener("click", deleteImage);
    $("lightbox").addEventListener("click", (e) => {
      if (e.target === $("lightbox") || e.target === $("lb-stage")) closeLightbox();
    });

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
      if (!$("lightbox").hidden) {
        if (e.key === "Escape") closeLightbox();
        // الاتجاه من اليمين للشمال: الشمال = اللي بعدها
        if (e.key === "ArrowLeft") { lb.index++; showLightbox(); }
        if (e.key === "ArrowRight") { lb.index--; showLightbox(); }
        return;
      }
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
      if (r.view !== route.view || r.id !== route.id) {
        closeLightbox();
        go(r);
      }
    });

    // الساعة في فورم "مشكلة جديدة" وتوقيت "من قد إيه"
    setInterval(() => {
      if ($("now")) $("now").textContent = dateTime(new Date().toISOString());
      if (route.view === "issue" && $("lightbox").hidden) renderView();
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
