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
  const DEMO_COMMENTS_KEY = "team_problems_demo_comments";
  const DEMO_MEMBERS_KEY = "team_problems_demo_members";

  // ============ مصدر البيانات: Supabase أو وضع تجربة ============
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const mode = !configured ? "demo" : window.supabase ? "live" : "broken";
  const db = mode === "live" ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const TABLE = cfg.TABLE || "team_problems";
  const BUCKET = cfg.BUCKET || "problem-images";
  const MAX_IMAGES = 10;
  const MAX_BYTES = 5 * 1024 * 1024;
  const LATE_HOURS = 48;

  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const base = { solved_at: null, solved_by: null, solution: null, images: [], assignee: null, priority: "normal", edited_at: null };
  const demoSeed = () => [
    {
      ...base, id: 5, title: "البوت مش بيرد على طلبات الواتساب",
      details: "من الساعة 2 الضهر البوت بيستلم الرسايل ومبيردش خالص. جربت من رقمين مختلفين ونفس الحكاية.",
      note: "العملاء بدأوا يتصلوا بالتليفون بدل الواتساب.",
      author: "عاصم", status: "open", created_at: hoursAgo(2), priority: "urgent", assignee: "كريم",
    },
    {
      ...base, id: 4, title: "أسعار المنيو مش متحدثة في الداشبورد",
      details: "غيرنا أسعار 4 أصناف امبارح، بس لسه الأسعار القديمة هي اللي ظاهرة للعملاء.",
      note: null, author: "مريم", status: "open", created_at: hoursAgo(55), assignee: "مريم",
    },
    {
      ...base, id: 3, title: "صفحة الدفع بتعلق على الآيفون",
      details: "لما العميل يدوس \"ادفع\" الصفحة بتفضل تحمّل ومش بتكمل. على أندرويد شغالة عادي.",
      note: null, author: "كريم", status: "solved", created_at: hoursAgo(80),
      solved_at: hoursAgo(70), solved_by: "يوسف", assignee: "يوسف",
      solution: "كان فيه كاش قديم على السيرفر، اتمسح والدفع رجع يشتغل.",
    },
    {
      ...base, id: 2, title: "إشعارات الطلبات الجديدة بتوصل متأخر",
      details: "الإشعار بيوصل للمطعم بعد الطلب بحوالي 10 دقايق.",
      note: "حصلت في أكتر من فرع.", author: "مريم", status: "solved", created_at: hoursAgo(220),
      solved_at: hoursAgo(194), solved_by: "عاصم",
      solution: "المهمة اللي بتبعت الإشعارات كانت شغالة كل 10 دقايق، اتظبطت تشتغل كل دقيقة.",
    },
    {
      ...base, id: 1, title: "صور الأصناف مش بتظهر في الموقع",
      details: "كل الصور بتظهر مربع فاضي في صفحة المنيو.",
      note: null, author: "يوسف", status: "solved", created_at: hoursAgo(960),
      solved_at: hoursAgo(957), solved_by: "كريم",
      solution: "رابط التخزين اتغير، اتحدث في الإعدادات.",
    },
  ];
  const demoComments = () => [
    { id: 1, problem_id: 5, author: "كريم", body: "بشوفها دلوقتي. شكل الـ webhook بتاع واتساب وقع.", created_at: hoursAgo(1.6) },
    { id: 2, problem_id: 5, author: "عاصم", body: "تمام، قولّي لو محتاج مني حاجة.", created_at: hoursAgo(1.5) },
    { id: 3, problem_id: 5, author: "كريم", body: "هحتاج الباسورد بتاع حساب ميتا بيزنس.", created_at: hoursAgo(1.45) },
  ];
  const demoMembers = () => [
    { name: "عاصم", created_at: hoursAgo(990), last_seen: hoursAgo(1.4) },
    { name: "مريم", created_at: hoursAgo(990), last_seen: hoursAgo(20) },
    { name: "كريم", created_at: hoursAgo(990), last_seen: hoursAgo(1.4) },
    { name: "يوسف", created_at: hoursAgo(990), last_seen: hoursAgo(70) },
  ];

  const SETUP_IMAGES = "الصور لسه مش متفعّلة في Supabase. شغّل كود الصور مرة واحدة في SQL Editor.";
  const SETUP_NEW = "الخاصية دي محتاجة تشغّل ملف supabase.sql الجديد مرة واحدة في Supabase.";

  const friendlyError = (e) => {
    const msg = String(e?.message || e || "");
    if (e?.kind === "not-image") return "الملف ده مش صورة.";
    if (e?.kind === "bad-image") return "مقدرتش أفتح الصورة دي. جرّب صورة JPG أو PNG.";
    if (e?.kind === "too-big" || /maximum allowed size|too large|payload/i.test(msg)) return "الصورة كبيرة زيادة. أقصى حجم 5 ميجا.";
    if (/mime type|not supported/i.test(msg)) return "نوع الصورة ده مش مدعوم. استخدم JPG أو PNG.";
    if (/'images' column|column "images"|images.*does not exist|bucket not found/i.test(msg)) return SETUP_IMAGES;
    if (e?.storage && /row-level security|unauthorized|permission|denied/i.test(msg)) return SETUP_IMAGES;
    if (/'(assignee|priority|edited_at)' column|problem_comments|team_members|touch_member|save_push_subscription|could not find the function/i.test(msg))
      return SETUP_NEW;
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

  const readDemo = (key, seed) => {
    const raw = local.get(key);
    if (raw === null) {
      const rows = seed();
      local.set(key, JSON.stringify(rows));
      return rows;
    }
    try { return JSON.parse(raw); } catch { return []; }
  };

  const store = {
    async list() {
      if (mode === "broken") throw new Error("مكتبة Supabase ما اتحملتش. اتأكد من النت واعمل ريفريش.");
      if (mode === "demo") return readDemo(DEMO_KEY, demoSeed);
      const { data, error } = await db.from(TABLE).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    async add(row) {
      if (mode === "demo") {
        const all = await store.list();
        const id = all.reduce((m, r) => Math.max(m, r.id), 0) + 1;
        const full = { ...base, id, status: "open", created_at: new Date().toISOString(), ...row };
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
        const cs = readDemo(DEMO_COMMENTS_KEY, demoComments).filter((c) => c.problem_id !== id);
        local.set(DEMO_COMMENTS_KEY, JSON.stringify(cs));
        return;
      }
      const { error } = await db.from(TABLE).delete().eq("id", id);
      if (error) throw error;
    },
    async listComments() {
      if (mode === "demo") return readDemo(DEMO_COMMENTS_KEY, demoComments);
      if (!db) return [];
      const { data, error } = await db.from("problem_comments").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    async addComment(row) {
      if (mode === "demo") {
        const all = readDemo(DEMO_COMMENTS_KEY, demoComments);
        const full = { id: all.reduce((m, r) => Math.max(m, r.id), 0) + 1, created_at: new Date().toISOString(), ...row };
        local.set(DEMO_COMMENTS_KEY, JSON.stringify([...all, full]));
        return;
      }
      const { error } = await db.from("problem_comments").insert(row);
      if (error) throw error;
    },
    async listMembers() {
      if (mode === "demo") return readDemo(DEMO_MEMBERS_KEY, demoMembers);
      if (!db) return [];
      const { data, error } = await db.from("team_members").select("*");
      if (error) throw error;
      return data;
    },
    async touchMember(name) {
      if (!name) return;
      if (mode === "demo") {
        const all = readDemo(DEMO_MEMBERS_KEY, demoMembers);
        const now = new Date().toISOString();
        const hit = all.find((m) => same(m.name, name));
        if (hit) hit.last_seen = now;
        else all.push({ name, created_at: now, last_seen: now });
        local.set(DEMO_MEMBERS_KEY, JSON.stringify(all));
        return;
      }
      if (!db) return;
      const { error } = await db.rpc("touch_member", { p_name: name });
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
    // كل جدول في قناة لوحده، عشان لو جدول لسه متعملش ما يوقفش التحديث اللحظي للباقي
    subscribe(handlers) {
      if (!db) return;
      for (const [table, fn] of Object.entries(handlers)) {
        db.channel(`changes-${table}`)
          .on("postgres_changes", { event: "*", schema: "public", table }, fn)
          .subscribe();
      }
    },
  };

  // ============ أدوات ============
  const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

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
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/>',
    send: '<path d="m3 11 18-8-8 18-2-8-8-2Z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 20h16"/>',
    flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5Z"/>',
  };
  const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const fmt = (iso, opts) => new Date(iso).toLocaleString(LOCALE, opts);
  const dateLong = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeOnly = (iso) => fmt(iso, { hour: "numeric", minute: "2-digit" });
  const dateTime = (iso) => `${dateLong(iso)} · ${timeOnly(iso)}`;
  const dayShort = (d) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "numeric" });

  // العد بالعربي: مشكلة واحدة، مشكلتين، 3 مشاكل، 11 مشكلة
  const plural = (n, [one, two, few, many]) =>
    n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  const WORDS = {
    minute: ["دقيقة", "دقيقتين", "دقايق", "دقيقة"],
    hour: ["ساعة", "ساعتين", "ساعات", "ساعة"],
    day: ["يوم", "يومين", "أيام", "يوم"],
    image: ["صورة", "صورتين", "صور", "صورة"],
    member: ["عضو واحد", "عضوين", "أعضاء", "عضو"],
    problem: ["مشكلة واحدة", "مشكلتين", "مشاكل", "مشكلة"],
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
  const daysAgo = (iso) => Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400e3);
  function groupOf(iso) {
    const days = daysAgo(iso);
    if (days <= 0) return "النهارده";
    if (days === 1) return "امبارح";
    if (days < 7) return "آخر 7 أيام";
    if (days < 30) return "آخر 30 يوم";
    return new Date(iso).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  }
  function dayLabel(iso) {
    const days = daysAgo(iso);
    if (days <= 0) return "النهارده";
    if (days === 1) return "امبارح";
    return fmt(iso, { weekday: "long", day: "numeric", month: "long" });
  }

  const HUES = [212, 158, 28, 268, 340, 190, 96, 8];
  function avatar(name, cls = "") {
    const n = String(name || "؟").trim() || "؟";
    let h = 0;
    for (const c of n) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `<span class="avatar ${cls}" style="--h:${HUES[h % HUES.length]}" aria-hidden="true">${esc([...n][0])}</span>`;
  }

  const myName = () => (local.get(NAME_KEY) || "").trim();

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

  // ============ الحالة ============
  let issues = [];
  let comments = [];
  let members = [];
  let online = []; // [{ name, viewing: [ids] }]
  let loaded = false;
  const features = { comments: true, members: true };
  let tab = ["open", "solved", "all"].includes(local.get(TAB_KEY)) ? local.get(TAB_KEY) : "open";
  let assigneeFilter = null;
  const parseHash = (h) => {
    const m = /^#p(\d+)$/.exec(h || "");
    if (m) return { view: "issue", id: Number(m[1]) };
    if (h === "#team") return { view: "team" };
    if (h === "#stats") return { view: "stats" };
    return { view: "new" };
  };
  const hashOf = (r) => (r.view === "issue" ? "#p" + r.id : "#" + r.view);
  let route = parseHash(location.hash);
  // images: صور المشكلة الجديدة قبل ما تترفع [{ key, blob, ext, url }]
  const draft = { title: "", details: "", note: "", author: "", images: [], urgent: false, assignee: "" };
  const chatDrafts = {};
  let viewPending = false;
  let uploadingIssue = null;
  let submitting = false;
  let editingId = null;

  const findIssue = (id) => issues.find((i) => i.id === id);
  const priorityOf = (i) => (i?.priority === "urgent" ? "urgent" : "normal");
  const isUrgent = (i) => priorityOf(i) === "urgent";
  const ageHours = (i) => (Date.now() - new Date(i.created_at)) / 3600e3;
  const isLate = (i) => i.status === "open" && ageHours(i) > LATE_HOURS;
  const commentsFor = (id) => comments.filter((c) => c.problem_id === id);
  const typingIn = (el) => {
    const a = document.activeElement;
    return Boolean(a && el.contains(a) && ((a.tagName === "INPUT" && a.type !== "file") || a.tagName === "TEXTAREA"));
  };

  function memberNames() {
    const seen = new Map();
    const add = (n) => { if (n && n.trim() && !seen.has(n.trim().toLowerCase())) seen.set(n.trim().toLowerCase(), n.trim()); };
    add(myName());
    members.forEach((m) => add(m.name));
    online.forEach((o) => add(o.name));
    issues.forEach((i) => { add(i.author); add(i.solved_by); add(i.assignee); });
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "ar"));
  }

  // ============ مين فاتح دلوقتي ============
  const clientId = uid();
  let presenceCh = null;
  const isOnline = (name) => online.some((o) => same(o.name, name));

  function startPresence() {
    if (!db) return setLocalPresence();
    presenceCh = db.channel("team-presence", { config: { presence: { key: clientId } } });
    presenceCh
      .on("presence", { event: "sync" }, () => {
        const map = new Map();
        Object.values(presenceCh.presenceState()).flat().forEach((p) => {
          if (!p?.name) return;
          const k = p.name.trim().toLowerCase();
          const cur = map.get(k) || { name: p.name.trim(), viewing: [] };
          if (p.viewing) cur.viewing.push(p.viewing);
          map.set(k, cur);
        });
        online = [...map.values()];
        renderPresence();
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") trackPresence(); });
  }

  function setLocalPresence() {
    online = myName() ? [{ name: myName(), viewing: route.view === "issue" ? [route.id] : [] }] : [];
    renderPresence();
  }

  function trackPresence() {
    if (!db) return setLocalPresence();
    if (!presenceCh || !myName()) return;
    Promise.resolve(presenceCh.track({ name: myName(), viewing: route.view === "issue" ? route.id : null })).catch(() => {});
  }

  function renderPresence() {
    const list = [...online].sort((a, b) => (same(a.name, myName()) ? -1 : same(b.name, myName()) ? 1 : 0));
    $("presence-text").textContent = list.length ? `فاتحين دلوقتي · ${list.length}` : "محدش فاتح دلوقتي";
    const shown = list.slice(0, 5);
    $("presence-avatars").innerHTML =
      shown.map((o) => `<span class="stack-item" title="${esc(o.name)}">${avatar(o.name, "sm")}</span>`).join("") +
      (list.length > shown.length ? `<span class="stack-more">+${list.length - shown.length}</span>` : "");
    renderViewers();
    if (route.view === "team") renderView();
    renderTeamCounts();
  }

  function renderViewers() {
    const el = $("viewers");
    if (!el || route.view !== "issue") return;
    const others = online.filter((o) => !same(o.name, myName()) && o.viewing.includes(route.id));
    el.hidden = !others.length;
    el.innerHTML = others.length
      ? `<span class="live-dot" aria-hidden="true"></span>
         <span class="avatar-stack">${others.map((o) => avatar(o.name, "sm")).join("")}</span>
         <span>${others.map((o) => `<b>${esc(o.name)}</b>`).join("، ")} ${others.length === 1 ? "بيبص" : "بيبصوا"} على المشكلة دي دلوقتي</span>`
      : "";
  }

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

    const mine = issues.filter((i) => i.status === "open" && same(i.assignee, myName())).length;
    $("count-mine").textContent = mine;
    $("count-mine").classList.toggle("hot", mine > 0);
    const mineOn = !!assigneeFilter && same(assigneeFilter, myName());
    $("mine-btn").setAttribute("aria-pressed", String(mineOn));
    $("mine-btn").classList.toggle("active", mineOn);
    const other = !!assigneeFilter && !mineOn;
    $("filter-chip").hidden = !other;
    if (other) $("filter-chip-text").textContent = `مسؤوليات ${assigneeFilter}`;

    $("names").innerHTML = memberNames().map((n) => `<option value="${esc(n)}"></option>`).join("");
    document.querySelectorAll(".sb-nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === route.view));
  }

  function renderTeamCounts() {
    const n = online.length;
    $("nav-team").dataset.count = n ? String(n) : "";
  }

  function listItem(i) {
    const active = route.view === "issue" && route.id === i.id;
    const solved = i.status === "solved";
    const urgent = isUrgent(i) && !solved;
    const late = isLate(i);
    const nComments = features.comments ? commentsFor(i.id).length : 0;
    const meta = [
      late ? `<span class="sb-late" title="مفتوحة من ${esc(duration(Date.now() - new Date(i.created_at)))}">${icon("clock")}</span>` : "",
      imagesOf(i).length ? `<span class="sb-meta-i" title="فيها صور">${icon("image")}</span>` : "",
      nComments ? `<span class="sb-meta-i sb-count" title="${nComments} رسالة في النقاش">${icon("chat")}${nComments}</span>` : "",
    ].join("");
    return `
      <button type="button" class="sb-item${active ? " active" : ""}${solved ? " solved" : ""}" data-id="${i.id}"
        ${active ? 'aria-current="page"' : ""} title="${esc(`${i.title} — ${i.author}، ${ago(i.created_at)}${i.assignee ? ` · المسؤول: ${i.assignee}` : ""}`)}">
        <span class="dot${solved ? " solved" : urgent ? " urgent" : ""}" aria-hidden="true"></span>
        <span class="sb-item-title">${esc(i.title)}</span>
        ${meta ? `<span class="sb-meta">${meta}</span>` : ""}
      </button>`;
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
      .filter((i) => !assigneeFilter || same(i.assignee, assigneeFilter))
      .filter((i) => !q || [i.title, i.details, i.note, i.author, i.solved_by, i.solution, i.assignee]
        .some((f) => (f || "").toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!rows.length) {
      const why = q ? `مفيش نتايج لـ "${esc(q)}".`
        : assigneeFilter ? (same(assigneeFilter, myName()) ? "مفيش مشاكل إنت مسؤول عنها هنا." : `مفيش مشاكل ${esc(assigneeFilter)} مسؤول عنها هنا.`)
        : EMPTY[tab];
      el.innerHTML = `<p class="sb-empty">${why}</p>`;
      return;
    }

    let html = "";
    const urgent = rows.filter((i) => i.status === "open" && isUrgent(i));
    if (urgent.length) {
      html += `<h3 class="sb-group urgent">${icon("flame")} عاجلة</h3>` + urgent.map(listItem).join("");
    }
    let lastGroup = null;
    for (const i of rows) {
      if (i.status === "open" && isUrgent(i)) continue;
      const g = groupOf(i.created_at);
      if (g !== lastGroup) {
        html += `<h3 class="sb-group">${esc(g)}</h3>`;
        lastGroup = g;
      }
      html += listItem(i);
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
      const canEdit = i && same(i.author, myName()) && editingId !== i.id;
      actions.innerHTML = i
        ? `${mode === "live" ? `<button type="button" class="btn btn-ghost btn-sm" data-action="copy">${icon("link")} <span class="hide-sm">انسخ اللينك</span></button>` : ""}
           ${canEdit ? `<button type="button" class="btn btn-ghost btn-sm" data-action="edit">${icon("edit")} عدّل</button>` : ""}
           <button type="button" class="btn btn-ghost btn-sm danger" data-action="delete">${icon("trash")} امسح</button>`
        : "";
    } else if (route.view === "team") {
      $("crumb").innerHTML = "<b>الفريق</b>";
      actions.innerHTML = "";
    } else if (route.view === "stats") {
      $("crumb").innerHTML = "<b>الإحصائيات</b>";
      actions.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-action="export">${icon("download")} نزّل Excel</button>`;
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
              <label for="assignee">المسؤول عنها <span class="optional">اختياري</span></label>
              <input id="assignee" class="input" type="text" maxlength="60" list="names" autocomplete="off"
                placeholder="اكتب اسم المسؤول" value="${esc(draft.assignee)}" />
            </div>
            <div class="field">
              <span class="label" id="urgent-label">الأهمية</span>
              <label class="switch" for="urgent">
                <input id="urgent" type="checkbox" ${draft.urgent ? "checked" : ""} aria-labelledby="urgent-label" />
                <span class="switch-track" aria-hidden="true"></span>
                <span class="switch-text">مشكلة عاجلة</span>
              </label>
            </div>
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

  // ---------- النقاش ----------
  function chatMessagesHtml(id) {
    if (!features.comments) return `<p class="chat-empty">${SETUP_NEW}</p>`;
    const list = commentsFor(id);
    if (!list.length) return `<p class="chat-empty">لسه محدش كتب حاجة. ابدأ النقاش مع الفريق هنا.</p>`;
    let html = "";
    let prev = null;
    let lastDay = null;
    for (const c of list) {
      const day = dayLabel(c.created_at);
      if (day !== lastDay) {
        html += `<div class="chat-day"><span>${esc(day)}</span></div>`;
        lastDay = day;
        prev = null;
      }
      const mine = same(c.author, myName());
      const grouped = prev && same(prev.author, c.author) && new Date(c.created_at) - new Date(prev.created_at) < 5 * 60e3;
      html += `
        <div class="msg${mine ? " mine" : ""}${grouped ? " grouped" : ""}${c.pending ? " pending" : ""}">
          ${mine ? "" : grouped ? '<span class="msg-av"></span>' : `<span class="msg-av">${avatar(c.author, "sm")}</span>`}
          <div class="bubble">
            ${!mine && !grouped ? `<span class="msg-name">${esc(c.author)}</span>` : ""}
            <p>${esc(c.body)}</p>
            <time datetime="${esc(c.created_at)}">${c.pending ? "بيتبعت…" : esc(timeOnly(c.created_at))}</time>
          </div>
        </div>`;
      prev = c;
    }
    return html;
  }

  function chatHtml(i) {
    const n = features.comments ? commentsFor(i.id).length : 0;
    return `
      <section class="section chat" aria-labelledby="chat-title">
        <div class="section-head"><h2 id="chat-title">النقاش<span id="chat-count">${n ? ` · ${n}` : ""}</span></h2></div>
        <div class="chat-box">
          <div class="chat-list" id="chat-list" aria-live="polite">${chatMessagesHtml(i.id)}</div>
          <form id="chat-form" class="chat-form" novalidate>
            <textarea id="chat-input" class="input" rows="1" maxlength="2000" placeholder="اكتب رسالة للفريق…" aria-label="اكتب رسالة"
              ${features.comments ? "" : "disabled"}>${esc(chatDrafts[i.id] || "")}</textarea>
            <button type="submit" class="btn btn-primary chat-send" aria-label="ابعت" ${features.comments ? "" : "disabled"}>${icon("send")}</button>
          </form>
        </div>
      </section>`;
  }

  const nearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 80;

  function renderChat(forceBottom = false) {
    const list = $("chat-list");
    if (!list || route.view !== "issue") return;
    const stick = forceBottom || nearBottom(list);
    list.innerHTML = chatMessagesHtml(route.id);
    const n = commentsFor(route.id).length;
    $("chat-count").textContent = n ? ` · ${n}` : "";
    if (stick) list.scrollTop = list.scrollHeight;
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  function detailHtml(i) {
    const solved = i.status === "solved";
    const badge = `<span class="badge${solved ? " solved" : ""}">${solved ? "اتحلت" : "متحلتش"}</span>`;
    const person = (n) => (n ? `${avatar(n, "sm")}<span>${esc(n)}</span>` : `<span class="sub">مش متسجل</span>`);
    const when = (iso) => `<span>${esc(dateLong(iso))}</span><span class="sub">${esc(timeOnly(iso))}</span>`;

    const props = [
      ["الحالة", badge],
      ["المسؤول", `<input class="prop-select prop-input" data-field="assignee" type="text" maxlength="60" list="names" autocomplete="off"
          aria-label="المسؤول عن المشكلة" placeholder="اكتب اسم المسؤول" value="${esc(i.assignee || "")}" />`],
      ["الأهمية", `<select class="prop-select${isUrgent(i) ? " is-urgent" : ""}" data-field="priority" aria-label="أهمية المشكلة">
          <option value="normal" ${isUrgent(i) ? "" : "selected"}>عادية</option>
          <option value="urgent" ${isUrgent(i) ? "selected" : ""}>عاجلة</option>
        </select>`],
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
      props.push(["مفتوحة من", `<span class="${isLate(i) ? "late-text" : ""}">${esc(duration(Date.now() - new Date(i.created_at)))}</span>`]);
    }

    const section = (title, text, cls = "") =>
      `<section class="section ${cls}"><h2>${title}</h2>${text ? `<p>${esc(text)}</p>` : `<p class="none">مفيش.</p>`}</section>`;

    const editing = editingId === i.id;
    const body = editing
      ? `<form id="edit-form" class="card edit-card" novalidate>
          <div class="card-head"><h2>تعديل المشكلة</h2><p>التعديل بيظهر للفريق كله، وبيتكتب جنب المشكلة إنها اتعدلت.</p></div>
          <div class="field">
            <label for="edit-title">اسم المشكلة <span class="req" aria-hidden="true">*</span></label>
            <input id="edit-title" class="input" type="text" maxlength="120" value="${esc(i.title)}" />
            <p class="field-error" id="edit-title-error" hidden>اسم المشكلة مينفعش يبقى فاضي.</p>
          </div>
          <div class="field">
            <label for="edit-details">وصف المشكلة</label>
            <textarea id="edit-details" class="input" rows="4">${esc(i.details || "")}</textarea>
          </div>
          <div class="field">
            <label for="edit-note">ملاحظة</label>
            <textarea id="edit-note" class="input" rows="2">${esc(i.note || "")}</textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${icon("check")} احفظ التعديل</button>
            <button type="button" class="btn btn-ghost" data-action="cancel-edit">إلغاء</button>
          </div>
        </form>`
      : `${section("وصف المشكلة", i.details)}${i.note ? section("ملاحظة", i.note) : ""}`;

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

    const assignedToMe = same(i.assignee, myName());
    return `
      <article class="detail">
        <header class="detail-head">
          <div class="kicker">
            ${badge}
            ${isUrgent(i) && !solved ? `<span class="badge urgent">${icon("flame")} عاجلة</span>` : ""}
            ${isLate(i) ? `<span class="badge late">${icon("clock")} متأخرة</span>` : ""}
            ${assignedToMe && !solved ? `<span class="badge mine">مسؤوليتك</span>` : ""}
            <span class="ref">#${i.id}</span>
          </div>
          <h1 class="detail-title">${esc(i.title)}</h1>
          <p class="byline">${avatar(i.author, "sm")}<span><b>${esc(i.author)}</b> سجّلها ${esc(ago(i.created_at))}${i.edited_at ? ` · <span class="edited">اتعدلت ${esc(ago(i.edited_at))}</span>` : ""}</span></p>
          <p class="viewers" id="viewers" hidden></p>
        </header>
        <div class="detail-grid">
          <div class="detail-main">
            ${body}
            ${galleryHtml(i)}
            ${chatHtml(i)}
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
      <p>ممكن تكون اتمسحت أو اللينك غلط. اختار مشكلة من القايمة أو سجّل مشكلة جديدة.</p>
      <button type="button" class="btn btn-primary" data-action="new">${icon("plus")} مشكلة جديدة</button>
    </div>`;

  // ---------- الفريق ----------
  function memberStats(name) {
    const mine = (f) => issues.filter((i) => same(i[f], name));
    const solvedBy = mine("solved_by").filter((i) => i.status === "solved");
    return {
      reported: mine("author").length,
      solved: solvedBy.length,
      assignedOpen: mine("assignee").filter((i) => i.status === "open").length,
      avgSolve: solvedBy.length
        ? solvedBy.reduce((s, i) => s + (new Date(i.solved_at) - new Date(i.created_at)), 0) / solvedBy.length
        : null,
    };
  }

  function lastSeenOf(name) {
    const m = members.find((x) => same(x.name, name));
    return m?.last_seen || null;
  }

  function teamHtml() {
    const names = memberNames();
    const onlineCount = names.filter(isOnline).length;
    const rows = names
      .map((name) => ({ name, on: isOnline(name), seen: lastSeenOf(name), stats: memberStats(name) }))
      .sort((a, b) => (b.on - a.on) || (new Date(b.seen || 0) - new Date(a.seen || 0)) || a.name.localeCompare(b.name, "ar"));

    const card = (r) => {
      const me = same(r.name, myName());
      const o = online.find((x) => same(x.name, r.name));
      const viewing = o?.viewing.map(findIssue).filter(Boolean)[0];
      const status = r.on
        ? `<span class="m-status on">فاتح دلوقتي${viewing ? ` · بيبص على <a href="#p${viewing.id}">«${esc(viewing.title)}»</a>` : ""}</span>`
        : `<span class="m-status">${r.seen ? `آخر ظهور ${esc(ago(r.seen))}` : "لسه مفتحش الموقع باسمه"}</span>`;
      return `
        <article class="member${r.on ? " online" : ""}">
          <div class="member-top">
            <span class="member-av">${avatar(r.name)}<span class="presence-dot${r.on ? " on" : ""}" aria-hidden="true"></span></span>
            <div class="member-id">
              <h3>${esc(r.name)}${me ? ' <span class="you">إنت</span>' : ""}</h3>
              ${status}
            </div>
          </div>
          <dl class="member-stats">
            <div><dt>سجّل</dt><dd>${r.stats.reported}</dd></div>
            <div><dt>حل</dt><dd>${r.stats.solved}</dd></div>
            <div><dt>مسؤول عن</dt><dd>${r.stats.assignedOpen} <span class="unit">مفتوحة</span></dd></div>
          </dl>
          <button type="button" class="btn btn-secondary btn-sm btn-block" data-action="show-assigned" data-name="${esc(r.name)}">
            ${icon("user")} ${me ? "مشاكلي" : `مشاكل ${esc(r.name)}`}
          </button>
        </article>`;
    };

    return `
      <section class="page">
        <header class="view-head">
          <h1>الفريق</h1>
          <p>${plural(names.length, WORDS.member)} · <span class="on-text">${onlineCount} فاتحين دلوقتي</span>. أي حد بيكتب اسمه في الموقع بيتضاف هنا تلقائي.</p>
        </header>
        ${names.length ? `<div class="members">${rows.map(card).join("")}</div>`
          : `<p class="none">لسه محدش كتب اسمه. أول ما حد يكتب اسمه هيظهر هنا.</p>`}
        ${features.members ? "" : `<p class="none small">لتسجيل آخر ظهور لكل عضو: ${SETUP_NEW}</p>`}
      </section>`;
  }

  // ---------- الإحصائيات ----------
  const DAYS = 14;
  function statsData() {
    const now = Date.now();
    const within = (iso, days) => iso && now - new Date(iso) <= days * 86400e3;
    const open = issues.filter((i) => i.status === "open");
    const solvedRecent = issues.filter((i) => i.status === "solved" && within(i.solved_at, 30));
    const avg = solvedRecent.length
      ? solvedRecent.reduce((s, i) => s + (new Date(i.solved_at) - new Date(i.created_at)), 0) / solvedRecent.length
      : null;
    const days = [];
    const today = startOfDay(new Date());
    for (let k = DAYS - 1; k >= 0; k--) {
      const d = new Date(today);
      d.setDate(today.getDate() - k);
      const key = d.toDateString();
      days.push({
        date: d,
        created: issues.filter((i) => new Date(i.created_at).toDateString() === key).length,
        solved: issues.filter((i) => i.solved_at && new Date(i.solved_at).toDateString() === key).length,
      });
    }
    return {
      open: open.length,
      urgent: open.filter(isUrgent).length,
      late: open.filter(isLate).length,
      week: issues.filter((i) => within(i.created_at, 7)).length,
      prevWeek: issues.filter((i) => !within(i.created_at, 7) && within(i.created_at, 14)).length,
      solvedWeek: issues.filter((i) => i.status === "solved" && within(i.solved_at, 7)).length,
      avg,
      avgCount: solvedRecent.length,
      days,
    };
  }

  function statsHtml() {
    const s = statsData();
    const tile = (label, value, sub, cls = "") =>
      `<div class="kpi ${cls}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></div>`;
    const people = memberNames()
      .map((n) => ({ n, ...memberStats(n) }))
      .filter((r) => r.reported || r.solved || r.assignedOpen)
      .sort((a, b) => b.solved - a.solved || b.reported - a.reported);
    return `
      <section class="page stats">
        <header class="view-head">
          <h1>الإحصائيات</h1>
          <p>ملخص شغل الفريق على المشاكل. الأرقام بتتحدث لحظي.</p>
        </header>
        <div class="kpis">
          ${tile("مفتوحة دلوقتي", s.open, s.open ? `منها ${s.urgent} عاجلة و${s.late} متأخرة` : "مفيش حاجة مفتوحة", s.late ? "warn" : "")}
          ${tile("اتسجلت آخر 7 أيام", s.week, `الأسبوع اللي قبله: ${s.prevWeek}`)}
          ${tile("اتحلت آخر 7 أيام", s.solvedWeek, "من كل المشاكل")}
          ${tile("متوسط وقت الحل", s.avg ? esc(duration(s.avg)) : "—", s.avgCount ? `آخر 30 يوم · ${plural(s.avgCount, WORDS.problem)}` : "لسه مفيش مشاكل اتحلت")}
        </div>

        <section class="card chart-card" aria-labelledby="chart-title">
          <div class="chart-head">
            <h2 id="chart-title">آخر ${DAYS} يوم</h2>
            <div class="legend" aria-hidden="true">
              <span><i class="sw s1"></i>اتسجلت</span>
              <span><i class="sw s2"></i>اتحلت</span>
            </div>
          </div>
          <div id="chart" class="chart" role="img" aria-label="عدد المشاكل اللي اتسجلت واللي اتحلت كل يوم في آخر ${DAYS} يوم"></div>
          <div id="chart-tip" class="chart-tip" hidden></div>
          <details class="chart-table">
            <summary>اعرض الأرقام في جدول</summary>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>اليوم</th><th>اتسجلت</th><th>اتحلت</th></tr></thead>
              <tbody>${[...s.days].reverse().map((d) => `<tr><td>${esc(fmt(d.date, { weekday: "long", day: "numeric", month: "long" }))}</td><td>${d.created}</td><td>${d.solved}</td></tr>`).join("")}</tbody>
            </table></div>
          </details>
        </section>

        <section class="card" aria-labelledby="people-title">
          <h2 id="people-title" class="card-title">شغل الفريق</h2>
          ${people.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>الاسم</th><th>سجّل</th><th>حل</th><th>مسؤول عن (مفتوحة)</th><th>متوسط وقت الحل</th></tr></thead>
            <tbody>${people.map((r) => `
              <tr><td><span class="cell-person">${avatar(r.n, "sm")}${esc(r.n)}</span></td>
              <td>${r.reported}</td><td>${r.solved}</td><td>${r.assignedOpen}</td><td>${r.avgSolve ? esc(duration(r.avgSolve)) : "—"}</td></tr>`).join("")}
            </tbody></table></div>` : `<p class="none">لسه مفيش بيانات.</p>`}
        </section>
      </section>`;
  }

  // رسم الأعمدة: كل يوم عمودين (اتسجلت / اتحلت)، والزمن ماشي من اليمين للشمال
  function drawChart() {
    const box = $("chart");
    if (!box) return;
    const { days } = statsData();
    const W = Math.max(300, box.clientWidth || 640);
    const H = 220;
    const m = { t: 12, r: 30, b: 28, l: 8 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const max = Math.max(1, ...days.map((d) => Math.max(d.created, d.solved)));
    const step = Math.max(1, Math.ceil(max / 4));
    const top = step * Math.ceil(max / step);
    const y = (v) => m.t + ih - (v / top) * ih;
    const band = iw / days.length;
    const bw = Math.max(3, Math.min(14, (band - 8) / 2));
    // اليوم الأقدم على اليمين، والنهارده على الشمال
    const x0 = (k) => m.l + iw - (k + 1) * band;
    const bar = (x, v, cls) => {
      if (!v) return "";
      const h = Math.max(2, ih - (y(v) - m.t));
      const r = Math.min(4, bw / 2, h);
      const yt = m.t + ih - h;
      return `<path class="${cls}" d="M${x},${m.t + ih} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${m.t + ih} Z"/>`;
    };
    let grid = "";
    for (let v = 0; v <= top; v += step) {
      grid += `<line class="grid" x1="${m.l}" x2="${m.l + iw}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${W - 4}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    let bars = "";
    let labels = "";
    let hits = "";
    days.forEach((d, k) => {
      const cx = x0(k) + band / 2;
      const pair = bw * 2 + 2;
      const start = cx - pair / 2;
      // داخل اليوم: "اتسجلت" على اليمين و"اتحلت" على الشمال
      bars += bar(start + bw + 2, d.created, "b1") + bar(start, d.solved, "b2");
      if ((days.length - 1 - k) % 2 === 0) labels += `<text class="tick" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(dayShort(d.date))}</text>`;
      hits += `<rect class="hit" x="${x0(k)}" y="${m.t}" width="${band}" height="${ih}" data-k="${k}" tabindex="0"
        aria-label="${esc(fmt(d.date, { weekday: "long", day: "numeric", month: "long" }))}: اتسجلت ${d.created}، اتحلت ${d.solved}"/>`;
    });
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
      ${grid}<line class="axis" x1="${m.l}" x2="${m.l + iw}" y1="${m.t + ih}" y2="${m.t + ih}"/>${bars}${labels}${hits}</svg>`;

    const tip = $("chart-tip");
    const show = (el) => {
      const d = days[Number(el.dataset.k)];
      tip.innerHTML = `<b>${esc(fmt(d.date, { weekday: "long", day: "numeric", month: "long" }))}</b>
        <span><i class="sw s1"></i>اتسجلت ${d.created}</span><span><i class="sw s2"></i>اتحلت ${d.solved}</span>`;
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const pr = box.getBoundingClientRect();
      const left = Math.min(Math.max(0, r.left - pr.left + r.width / 2 - tip.offsetWidth / 2), pr.width - tip.offsetWidth);
      tip.style.left = left + "px";
      tip.style.top = box.offsetTop - tip.offsetHeight + 6 + "px";
      box.querySelectorAll(".hit").forEach((h) => h.classList.toggle("on", h === el));
    };
    const hide = () => { tip.hidden = true; box.querySelectorAll(".hit.on").forEach((h) => h.classList.remove("on")); };
    box.querySelectorAll(".hit").forEach((h) => {
      h.addEventListener("pointerenter", () => show(h));
      h.addEventListener("focus", () => show(h));
      h.addEventListener("blur", hide);
    });
    box.addEventListener("pointerleave", hide);
  }

  // ---------- Excel ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function saveFile(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function exportExcel() {
    const stamp = new Date().toISOString().slice(0, 10);
    const statusText = (i) => (i.status === "solved" ? "اتحلت" : "متحلتش");
    const rows = [...issues].sort((a, b) => a.id - b.id).map((i) => ({
      "رقم": i.id,
      "اسم المشكلة": i.title,
      "الحالة": statusText(i),
      "الأهمية": isUrgent(i) ? "عاجلة" : "عادية",
      "المسؤول": i.assignee || "",
      "الوصف": i.details || "",
      "ملاحظة": i.note || "",
      "سجّلها": i.author,
      "تاريخ التسجيل": dateTime(i.created_at),
      "حلّها": i.solved_by || "",
      "تاريخ الحل": i.solved_at ? dateTime(i.solved_at) : "",
      "مدة الحل": i.solved_at ? duration(new Date(i.solved_at) - new Date(i.created_at)) : "",
      "إزاي اتحلت": i.solution || "",
      "عدد الصور": imagesOf(i).length,
      "رسائل النقاش": commentsFor(i.id).length,
    }));
    const chat = comments.map((c) => ({
      "رقم المشكلة": c.problem_id,
      "المشكلة": findIssue(c.problem_id)?.title || "",
      "الاسم": c.author,
      "الرسالة": c.body,
      "الوقت": dateTime(c.created_at),
    }));
    try {
      if (!window.XLSX) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
      const X = window.XLSX;
      const wb = X.utils.book_new();
      const sheet = (data, widths) => {
        const ws = X.utils.json_to_sheet(data.length ? data : [{}]);
        ws["!cols"] = widths.map((wch) => ({ wch }));
        return ws;
      };
      X.utils.book_append_sheet(wb, sheet(rows, [6, 36, 10, 10, 14, 50, 30, 14, 30, 14, 30, 14, 40, 10, 12]), "المشاكل");
      X.utils.book_append_sheet(wb, sheet(chat, [10, 36, 14, 60, 30]), "النقاش");
      wb.Workbook = { Views: [{ RTL: true }] };
      const data = X.write(wb, { bookType: "xlsx", type: "array" });
      saveFile(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `team-problems-${stamp}.xlsx`);
      toast("اتنزل ملف Excel");
    } catch (e) {
      console.warn(e);
      // لو مكتبة Excel ما اتحملتش: ملف CSV بيتفتح في Excel برضو
      const cols = Object.keys(rows[0] || { "رقم": "" });
      const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = "﻿" + [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
      saveFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), `team-problems-${stamp}.csv`);
      toast("اتنزل ملف CSV (بيتفتح في Excel)");
    }
  }

  function renderView(force = false) {
    const view = $("view");
    if (!force && typingIn(view)) { viewPending = true; return; }
    viewPending = false;
    renderTop();
    view.classList.toggle("wide", route.view === "team" || route.view === "stats");
    if (route.view === "new") {
      view.innerHTML = composeHtml();
      renderDraftThumbs();
    } else if (route.view === "team") {
      view.innerHTML = teamHtml();
    } else if (route.view === "stats") {
      view.innerHTML = statsHtml();
      drawChart();
    } else if (!loaded) {
      view.innerHTML = `<div class="view-loading">${'<div class="sk"></div>'.repeat(4)}</div>`;
    } else {
      const i = findIssue(route.id);
      view.innerHTML = i ? detailHtml(i) : notFoundHtml();
      if (i) {
        renderViewers();
        const list = $("chat-list");
        if (list) list.scrollTop = list.scrollHeight;
        const input = $("chat-input");
        if (input) autoGrow(input);
      }
    }
  }

  // ============ التنقل ============
  function go(r) {
    if (r.view !== "issue" || r.id !== route.id) editingId = null;
    route = r;
    try { history.replaceState(null, "", hashOf(r)); } catch {}
    renderTabs();
    renderList();
    renderView(true);
    $("main").scrollTop = 0;
    closeSidebar();
    trackPresence();
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

  async function reloadComments() {
    try {
      comments = await store.listComments();
      features.comments = true;
    } catch (e) {
      console.warn(e);
      features.comments = false;
    }
    renderChat();
    renderList();
  }

  async function reloadMembers() {
    try {
      members = await store.listMembers();
      features.members = true;
    } catch (e) {
      console.warn(e);
      features.members = false;
    }
    renderTabs();
    if (route.view === "team") renderView();
  }

  async function touchMe() {
    if (!myName()) return;
    try {
      await store.touchMember(myName());
      if (mode === "demo") reloadMembers();
    } catch (e) {
      console.warn(e);
    }
  }

  let reloadTimer;
  function reload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      try {
        await refresh();
        if (route.view !== "new") renderView();
      } catch (e) {
        console.error(e);
        notice(friendlyError(e), { error: true });
        $("list").innerHTML = '<p class="sb-empty">مقدرناش نحمّل المشاكل.</p>';
      }
    }, 60);
  }

  // ============ الاسم ============
  let afterName = null;
  function askName({ welcome = false, then = null } = {}) {
    afterName = then;
    $("name-title").textContent = welcome ? "أهلًا بيك" : "اسمك";
    $("name-desc").textContent = welcome
      ? "اكتب اسمك عشان تظهر للفريق في قسم الفريق، وتشوف مين فاتح معاك دلوقتي."
      : "بيظهر جنب المشاكل اللي بتسجلها أو بتحلها، والموقع بيفتكره على الجهاز ده.";
    $("name-input").value = myName();
    const dialog = $("name-dialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    $("name-input").focus();
  }

  function saveName(n) {
    if (!n || same(n, myName()) && n === myName()) {
      if (n) local.set(NAME_KEY, n);
      return;
    }
    local.set(NAME_KEY, n);
    renderMe();
    renderTabs();
    trackPresence();
    touchMe();
    resyncPush();
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
      // الخانات الجديدة بتتبعت بس لو ليها قيمة، عشان التسجيل يشتغل حتى قبل تحديث قاعدة البيانات
      if (uploaded.length) row.images = uploaded;
      if ($("urgent").checked) row.priority = "urgent";
      if ($("assignee").value.trim()) row.assignee = $("assignee").value.trim();
      const created = await store.add(row);
      saveName(author);
      clearDraftImages();
      Object.assign(draft, { title: "", details: "", note: "", author: "", urgent: false, assignee: "" });
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
    else if (route.view === "issue" && findIssue(route.id)) addImagesToIssue(images);
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

  async function saveEdit() {
    const i = findIssue(route.id);
    if (!i) return;
    const title = $("edit-title").value.trim();
    flagError("edit-title", "edit-title-error", !title);
    if (!title) return $("edit-title").focus();
    try {
      await store.update(i.id, {
        title,
        details: $("edit-details").value.trim() || null,
        note: $("edit-note").value.trim() || null,
        edited_at: new Date().toISOString(),
      });
      editingId = null;
      document.activeElement?.blur();
      await refresh();
      renderView(true);
      toast("اتحفظ التعديل");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أحفظ التعديل: " + friendlyError(err));
    }
  }

  async function changeField(field, value) {
    const id = route.id;
    const i = findIssue(id);
    if (!i) return;
    const v = value || null;
    if (field === "priority" && (v || "normal") === priorityOf(i)) return;
    if (field === "assignee" && same(v, i.assignee)) return;
    try {
      await store.update(id, { [field]: field === "priority" ? v || "normal" : v });
      await refresh();
      renderView(true);
      if (field === "assignee") toast(v ? (same(v, myName()) ? "بقيت إنت المسؤول عنها" : `بقى ${v} المسؤول عنها`) : "اتشالت المسؤولية");
      else toast(v === "urgent" ? "بقت عاجلة" : "بقت عادية");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أحدّث المشكلة: " + friendlyError(err));
      renderView(true);
    }
  }

  async function sendComment() {
    const input = $("chat-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (!myName()) return askName({ then: sendComment });
    const id = route.id;
    input.value = "";
    chatDrafts[id] = "";
    autoGrow(input);
    const temp = { id: "tmp-" + uid(), problem_id: id, author: myName(), body: text, created_at: new Date().toISOString(), pending: true };
    comments.push(temp);
    renderChat(true);
    try {
      await store.addComment({ problem_id: id, author: myName(), body: text });
      comments = comments.filter((c) => c !== temp);
      await reloadComments();
      renderChat(true);
      touchMe();
    } catch (err) {
      console.error(err);
      comments = comments.filter((c) => c !== temp);
      renderChat();
      if ($("chat-input") && !$("chat-input").value) $("chat-input").value = text;
      toast("مقدرتش أبعت الرسالة: " + friendlyError(err));
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
      comments = comments.filter((c) => c.problem_id !== i.id);
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

  function showAssigned(name) {
    assigneeFilter = name;
    tab = "open";
    local.set(TAB_KEY, tab);
    renderTabs();
    renderList();
    if (window.matchMedia("(max-width: 860px)").matches) openSidebar();
    const n = issues.filter((i) => i.status === "open" && same(i.assignee, name)).length;
    toast(n ? `${same(name, myName()) ? "إنت مسؤول" : `${name} مسؤول`} عن ${plural(n, WORDS.problem)} مفتوحة` : "مفيش مشاكل مفتوحة متعيّنة ليه");
  }

  // ============ إشعارات الموبايل ============
  const PUSH_KEY = cfg.VAPID_PUBLIC_KEY || "";
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  let swReg = null;

  const b64uToBytes = (s) => {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  async function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      swReg = await navigator.serviceWorker.register("sw.js");
    } catch (e) {
      console.warn(e);
    }
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "open") go(parseHash(e.data.hash));
    });
    updatePushUI();
    resyncPush();
  }

  async function currentSub() {
    if (!("serviceWorker" in navigator)) return null;
    const reg = swReg || (await navigator.serviceWorker.getRegistration());
    return reg ? reg.pushManager?.getSubscription() : null;
  }

  async function pushStatus() {
    if (mode !== "live" || !PUSH_KEY) return "unavailable";
    if (isIOS && !isStandalone()) return "ios-install";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return (await currentSub().catch(() => null)) ? "on" : "off";
  }

  async function updatePushUI() {
    const st = await pushStatus();
    $("push-btn").classList.toggle("on", st === "on");
    $("push-dot").hidden = st !== "on";
    $("push-btn").title = st === "on" ? "الإشعارات شغالة على الجهاز ده" : "فعّل إشعارات الموبايل";
  }

  async function savePushSub(sub) {
    const j = sub.toJSON();
    const { error } = await db.rpc("save_push_subscription", {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_member: myName(),
    });
    if (error) throw error;
  }

  // بنحدّث الاشتراك مع الاسم الحالي (لو الاسم اتغير أو قاعدة البيانات اتمسحت)
  async function resyncPush() {
    if (mode !== "live" || !myName()) return;
    try {
      const sub = await currentSub();
      if (sub) await savePushSub(sub);
    } catch (e) {
      console.warn(e);
    }
  }

  async function enablePush() {
    if (!myName()) return askName({ then: enablePush });
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast("لازم توافق على الإشعارات من المتصفح عشان توصلك.");
        return openPushDialog();
      }
      const reg = swReg || (await navigator.serviceWorker.ready);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(PUSH_KEY) });
      await savePushSub(sub);
      $("push-dialog").close();
      toast("اتفعّلت الإشعارات على الجهاز ده");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أفعّل الإشعارات: " + friendlyError(err));
    }
    updatePushUI();
  }

  async function disablePush() {
    try {
      const sub = await currentSub();
      if (sub) {
        await db.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      $("push-dialog").close();
      toast("وقفت الإشعارات على الجهاز ده");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أوقف الإشعارات: " + friendlyError(err));
    }
    updatePushUI();
  }

  const PUSH_TEXT = {
    unavailable: "الإشعارات بتشتغل لما الموقع يكون متوصل بـ Supabase ومتظبط فيه مفتاح الإشعارات.",
    "ios-install": "على الآيفون، الإشعارات بتشتغل بس لما الموقع يبقى على الشاشة الرئيسية زي التطبيق:",
    unsupported: "المتصفح ده مبيدعمش الإشعارات. جرّب Chrome على أندرويد أو الكمبيوتر، أو Safari على الآيفون بعد ما تضيف الموقع للشاشة الرئيسية.",
    denied: "الإشعارات مقفولة للموقع ده من إعدادات المتصفح. افتحها من علامة القفل جنب اللينك ← الإشعارات ← سماح، وبعدين ارجع هنا.",
    off: "هيوصلك إشعار على الجهاز ده حتى لو الموقع مقفول، لما: حد يسجّل مشكلة جديدة، أو مشكلة تتحل، أو تبقى مسؤول عن مشكلة، أو حد يكتب في النقاش.",
    on: "الإشعارات شغالة على الجهاز ده. كل جهاز بيتفعّل لوحده، ففعّلها على موبايلك وعلى الكمبيوتر لو عايز الاتنين.",
  };
  const IOS_STEPS = [
    "افتح الموقع في Safari.",
    "دوس زرار المشاركة (المربع اللي طالع منه سهم).",
    "اختار «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).",
    "افتح الموقع من الأيقونة الجديدة، ودوس على الجرس تاني.",
  ];

  let pushAction = null;
  async function openPushDialog() {
    const st = await pushStatus();
    $("push-desc").textContent = PUSH_TEXT[st];
    $("push-steps").hidden = st !== "ios-install";
    $("push-steps").innerHTML = IOS_STEPS.map((s) => `<li>${esc(s)}</li>`).join("");
    const btn = $("push-action");
    btn.hidden = !(st === "off" || st === "on");
    btn.textContent = st === "on" ? "وقّف الإشعارات" : "فعّل الإشعارات";
    btn.className = st === "on" ? "btn btn-secondary" : "btn btn-primary";
    pushAction = st === "on" ? disablePush : enablePush;
    const d = $("push-dialog");
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
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

    document.querySelectorAll("[data-nav]").forEach((b) =>
      b.addEventListener("click", () => go({ view: b.dataset.nav }))
    );

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

    $("mine-btn").addEventListener("click", () => {
      if (!myName()) return askName({ then: () => $("mine-btn").click() });
      assigneeFilter = assigneeFilter && same(assigneeFilter, myName()) ? null : myName();
      if (assigneeFilter) { tab = "open"; local.set(TAB_KEY, tab); }
      renderTabs();
      renderList();
    });
    $("filter-chip").addEventListener("click", () => {
      assigneeFilter = null;
      renderTabs();
      renderList();
    });

    $("search").addEventListener("input", renderList);

    const view = $("view");
    view.addEventListener("input", (e) => {
      const id = e.target.id;
      if (["title", "details", "note", "author", "assignee"].includes(id)) draft[id] = e.target.value;
      if (id === "title" && e.target.value.trim()) flagError("title", "title-error", false);
      if (id === "author" && e.target.value.trim()) flagError("author", "author-error", false);
      if (id === "by" && e.target.value.trim()) flagError("by", "by-error", false);
      if (id === "edit-title" && e.target.value.trim()) flagError("edit-title", "edit-title-error", false);
      if (id === "chat-input") { chatDrafts[route.id] = e.target.value; autoGrow(e.target); }
    });

    view.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "urgent") draft.urgent = t.checked;
      if (t.id === "assignee") draft.assignee = t.value;
      if (t.classList.contains("prop-input")) return changeField(t.dataset.field, t.value.trim());
      if (t.classList.contains("prop-select")) changeField(t.dataset.field, t.value);
    });

    view.addEventListener("keydown", (e) => {
      if (e.target.classList?.contains("prop-input") && e.key === "Enter") {
        e.preventDefault();
        e.target.blur();
      }
      if (e.target.id === "chat-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendComment();
      }
    });

    view.addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.target.id === "issue-form") createIssue();
      if (e.target.id === "resolve-form") resolveIssue(e.target);
      if (e.target.id === "edit-form") saveEdit();
      if (e.target.id === "chat-form") sendComment();
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
      if (a === "edit") { editingId = route.id; renderView(true); $("edit-title")?.focus(); }
      if (a === "cancel-edit") { editingId = null; renderView(true); }
      if (a === "show-assigned") showAssigned(btn.dataset.name);
      if (a === "export") exportExcel();
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
      if (route.view !== "new" && !(route.view === "issue" && findIssue(route.id))) return;
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

    // الاسم
    const dialog = $("name-dialog");
    $("me-btn").addEventListener("click", () => askName());
    dialog.addEventListener("close", () => {
      const then = afterName;
      afterName = null;
      if (dialog.returnValue !== "save") return;
      const n = $("name-input").value.trim();
      if (!n) return;
      const changed = n !== myName();
      saveName(n);
      if ($("author") && !draft.author) $("author").value = n;
      if ($("by")) $("by").value = n;
      if (route.view === "team" || route.view === "issue") renderView();
      if (changed) toast(`أهلًا ${n}`);
      if (then) then();
    });

    // الإشعارات
    $("push-btn").addEventListener("click", openPushDialog);
    $("push-action").addEventListener("click", () => pushAction && pushAction());

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
      const typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
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

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => route.view === "stats" && drawChart(), 150);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { touchMe(); updatePushUI(); }
    });

    // الساعة في فورم "مشكلة جديدة"، وتوقيت "من قد إيه"، وآخر ظهور
    setInterval(() => {
      if ($("now")) $("now").textContent = dateTime(new Date().toISOString());
      if ((route.view === "issue" || route.view === "team") && $("lightbox").hidden) renderView();
    }, 30e3);
    setInterval(() => document.visibilityState === "visible" && touchMe(), 4 * 60e3);
  }

  // ============ التشغيل ============
  function showModeNotice() {
    if (mode === "demo") {
      const hasSeed = (local.get(DEMO_KEY) ?? "null") !== "[]";
      notice("وضع تجربة: المشاكل بتتسجل على جهازك بس. حط بيانات Supabase في config.js عشان الفريق كله يشوف نفس القايمة.", hasSeed ? {
        action: "امسح الأمثلة",
        onAction: async () => {
          local.set(DEMO_KEY, "[]");
          local.set(DEMO_COMMENTS_KEY, "[]");
          await refresh();
          await reloadComments();
          showModeNotice();
          go({ view: "new" });
          toast("اتمسحت الأمثلة");
        },
      } : {});
    } else if (mode === "broken") {
      notice("مكتبة Supabase ما اتحملتش. اتأكد من النت واعمل ريفريش.", { error: true });
    }
  }

  async function start() {
    $("app").hidden = false;
    renderMe();
    renderTabs();
    renderList();
    renderView(true);
    showModeNotice();
    bindEvents();
    store.subscribe({ [TABLE]: reload, problem_comments: reloadComments, team_members: reloadMembers });
    startPresence();
    initServiceWorker();
    if (!myName()) askName({ welcome: true });
    else touchMe();

    try {
      await refresh();
      await Promise.all([reloadComments(), reloadMembers()]);
      if (route.view !== "new") renderView();
    } catch (e) {
      console.error(e);
      notice(friendlyError(e), { error: true });
      $("list").innerHTML = '<p class="sb-empty">مقدرناش نحمّل المشاكل.</p>';
    }
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
