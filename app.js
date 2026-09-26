(() => {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";

  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const LOCALE = "ar-EG-u-nu-latn";

  // ============ إعدادات الجهاز ده بس (مش بتتزامن) ============
  const memory = {};
  const local = {
    get(k) { try { return localStorage.getItem(k); } catch { return memory[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { memory[k] = v; } },
  };
  const TAB_KEY = "team_problems_tab";
  const NUDGE_KEY = "team_problems_push_nudge";

  // ============ الاتصال بـ Supabase ============
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const db = configured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  const TABLE = cfg.TABLE || "team_problems";
  const BUCKET = "problem-images";
  const CHAT_BUCKET = "chat-files";
  const MAX_IMAGES = 10;
  const MAX_BYTES = 5 * 1024 * 1024;
  const MAX_FILE = 10 * 1024 * 1024;
  const MAX_CHAT_FILES = 5;
  const MAX_VOICE_SEC = 180;
  const LATE_HOURS = 48;
  const EMOJIS = ["👍", "✅", "👀", "❤️", "😂"];
  const AVAILABILITY = {
    available: { label: "متاح", cls: "av-available" },
    busy: { label: "مشغول", cls: "av-busy" },
    away: { label: "في إجازة", cls: "av-away" },
  };

  const SETUP_NEW = "الخاصية دي محتاجة تشغّل ملف supabase.sql الجديد مرة واحدة في Supabase.";

  const friendlyError = (e) => {
    const msg = String(e?.message || e || "");
    if (e?.kind === "not-image") return "الملف ده مش صورة.";
    if (e?.kind === "bad-image") return "مقدرتش أفتح الصورة دي. جرّب صورة JPG أو PNG.";
    if (e?.kind === "too-big" || /maximum allowed size|too large|payload/i.test(msg)) return "الملف كبير زيادة.";
    if (/only_author_can_edit/.test(msg)) return "اللي سجّل المشكلة بس هو اللي يقدر يعدّلها.";
    if (/only_assignee_can_start|only_assignee_can_stop/.test(msg)) return "المسؤول عن المشكلة بس هو اللي يقدر يعلّم إنه شغال عليها.";
    if (/not_admin/.test(msg)) return "الخاصية دي للأدمن بس.";
    if (/cannot_remove_self/.test(msg)) return "مينفعش تشيل نفسك من الفريق.";
    if (/members_display_name_key|duplicate key/.test(msg)) return "الاسم ده مستخدم عند حد تاني في الفريق. اختار اسم تاني.";
    if (/not_member|row-level security/i.test(msg)) return "إنت مش ضمن الفريق دلوقتي.";
    if (/join_team|team_roster|could not find the function|relation .* does not exist|schema cache/i.test(msg)) return SETUP_NEW;
    if (e?.storage && /bucket not found/i.test(msg)) return SETUP_NEW;
    if (/fetch|network|Failed/i.test(msg)) return "مفيش اتصال بالسيرفر. اتأكد من النت وجرّب تاني.";
    if (/Invalid API key|JWT/i.test(msg)) return "مفتاح Supabase في config.js غلط.";
    return msg || "حصلت مشكلة غير متوقعة.";
  };

  // ============ أدوات ============
  const uid = () =>
    (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    reopen: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
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
    pin: '<path d="M12 17v5"/><path d="M5 17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2Z"/>',
    alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6M22 6l-3-3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    sparkle: '<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    play: '<path d="M7 4v16l13-8Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16.8a2 2 0 0 1 2.9-2.8L8 16"/>',
  };
  const icon = (name, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const GOOGLE_G = `<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.2 1.5-5 2.4-8.7 2.4-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>`;

  const fmt = (iso, opts) => new Date(iso).toLocaleString(LOCALE, opts);
  const dateLong = (iso) => fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeOnly = (iso) => fmt(iso, { hour: "numeric", minute: "2-digit" });
  const dateTime = (iso) => `${dateLong(iso)} · ${timeOnly(iso)}`;
  const dateShortTime = (iso) => fmt(iso, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const dayShort = (d) => d.toLocaleDateString(LOCALE, { day: "numeric", month: "numeric" });
  const hourLabel = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(LOCALE, { hour: "numeric" });

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
    time: ["مرة", "مرتين", "مرات", "مرة"],
    message: ["رسالة جديدة", "رسالتين جداد", "رسايل جديدة", "رسالة جديدة"],
  };
  function duration(ms) {
    const m = Math.max(1, Math.round(Math.abs(ms) / 60e3));
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

  // datetime-local بيشتغل بالوقت المحلي
  const toLocalInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

  const HUES = [212, 158, 28, 268, 340, 190, 96, 8];
  function avatar(name, cls = "") {
    const n = String(name || "؟").trim() || "؟";
    let h = 0;
    for (const c of n) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `<span class="avatar ${cls}" style="--h:${HUES[h % HUES.length]}" aria-hidden="true">${esc([...n][0])}</span>`;
  }
  const fileSize = (b) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} ك.ب` : `${(b / 1024 / 1024).toFixed(1)} م.ب`);
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3800);
  }

  function notice(text, { error = false, action = null, onAction = null, onClose = null } = {}) {
    $("notice").hidden = !text;
    $("notice").classList.toggle("error", error);
    $("notice-text").textContent = text || "";
    $("notice-action").hidden = !action;
    $("notice-action").textContent = action || "";
    $("notice-action").onclick = onAction;
    $("notice-close").hidden = !onClose;
    $("notice-close").onclick = () => { notice(""); onClose && onClose(); };
  }

  // ============ الحالة ============
  let me = null; // صف العضو من جدول members
  let isAdmin = false;
  let issues = [];
  let comments = [];
  let roster = [];
  let reactions = [];
  let reads = [];
  let links = [];
  let myReminders = [];
  let settings = { member_limit: 5 };
  const eventsCache = {};
  let online = []; // [{ uid, name, availability, viewing: [ids] }]
  let loaded = false;
  let started = false;
  let tab = ["open", "solved", "all"].includes(local.get(TAB_KEY)) ? local.get(TAB_KEY) : "open";
  let assigneeFilter = null;
  const parseHash = (h) => {
    const m = /^#p(\d+)$/.exec(h || "");
    if (m) return { view: "issue", id: Number(m[1]) };
    if (["#team", "#stats", "#settings"].includes(h)) return { view: h.slice(1) };
    return { view: "new" };
  };
  const hashOf = (r) => (r.view === "issue" ? "#p" + r.id : "#" + r.view);
  let route = parseHash(location.hash);
  const draft = { title: "", details: "", note: "", assignee: "", due: "", urgent: false, more: false, images: [] };
  const chatDrafts = {};
  const chatFiles = {};
  const aiCache = {};
  let detailTab = "chat";
  let viewPending = false;
  let uploadingIssue = null;
  let submitting = false;
  let editingId = null;
  let rec = null; // تسجيل صوتي شغال

  const myName = () => me?.display_name || "";
  const findIssue = (id) => issues.find((i) => i.id === id);
  const priorityOf = (i) => (i?.priority === "urgent" ? "urgent" : "normal");
  const isUrgent = (i) => priorityOf(i) === "urgent";
  const isOpen = (i) => i.status !== "solved";
  const ageHours = (i) => (Date.now() - new Date(i.created_at)) / 3600e3;
  const isOverdue = (i) => isOpen(i) && !!i.due_at && new Date(i.due_at) < new Date();
  const isLate = (i) => isOpen(i) && (ageHours(i) > LATE_HOURS || isOverdue(i));
  const isAuthor = (i) => !!me && (i.created_by === me.user_id || same(i.author, myName()));
  const isAssignee = (i) => same(i.assignee, myName());
  const isMineComment = (c) => !!me && (c.created_by === me.user_id || same(c.author, myName()));
  const commentsFor = (id) => comments.filter((c) => c.problem_id === id);
  const imagesOf = (i) => (Array.isArray(i?.images) ? i.images.filter(Boolean) : []);
  const activeRoster = () => roster.filter((r) => r.active);
  const memberByName = (n) => roster.find((r) => same(r.display_name, n));
  const playing = () => [...document.querySelectorAll("#view audio")].some((a) => !a.paused && !a.ended);
  const typingIn = (el) => {
    const a = document.activeElement;
    return Boolean(rec) || playing() || Boolean(a && el.contains(a) && ((a.tagName === "INPUT" && a.type !== "file") || a.tagName === "TEXTAREA"));
  };

  function myLastRead(pid) {
    return reads.find((r) => r.problem_id === pid && r.user_id === me?.user_id)?.last_read_at || me?.joined_at || 0;
  }
  function unreadCount(pid) {
    const since = new Date(myLastRead(pid));
    return comments.filter((c) => c.problem_id === pid && !isMineComment(c) && !c.pending && new Date(c.created_at) > since).length;
  }

  function memberNames() {
    const seen = new Map();
    const add = (n) => { if (n && n.trim() && !seen.has(n.trim().toLowerCase())) seen.set(n.trim().toLowerCase(), n.trim()); };
    activeRoster().forEach((r) => add(r.display_name));
    issues.forEach((i) => { add(i.author); add(i.solved_by); add(i.assignee); });
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "ar"));
  }

  // ============ البيانات ============
  async function must(p) {
    const { data, error } = await p;
    if (error) throw error;
    return data;
  }

  const ME_COLS = "user_id,display_name,joined_at,last_seen,removed,availability,status_note,quiet_start,quiet_end,summary_hour,tz";
  const store = {
    join: () => {
      const meta = sessionUser()?.user_metadata || {};
      return must(db.rpc("join_team", {
        p_name: meta.full_name || meta.name || null,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo",
      }));
    },
    listProblems: () => must(db.from(TABLE).select("*").order("created_at", { ascending: false })),
    addProblem: (row) => must(db.from(TABLE).insert(row).select().single()),
    updateProblem: (id, patch) => must(db.from(TABLE).update(patch).eq("id", id)),
    removeProblem: (id) => must(db.from(TABLE).delete().eq("id", id)),
    listComments: () => must(db.from("problem_comments").select("*").order("created_at", { ascending: true })),
    addComment: (row) => must(db.from("problem_comments").insert(row)),
    roster: () => must(db.rpc("team_roster")),
    settings: () => must(db.from("team_settings").select("id,member_limit").eq("id", 1).maybeSingle()),
    listReactions: () => must(db.from("comment_reactions").select("comment_id,user_id,member,emoji")),
    addReaction: (commentId, emoji) => must(db.from("comment_reactions").insert({ comment_id: commentId, emoji })),
    removeReaction: (commentId, emoji) =>
      must(db.from("comment_reactions").delete().eq("comment_id", commentId).eq("emoji", emoji).eq("user_id", me.user_id)),
    listReads: () => must(db.from("problem_reads").select("problem_id,user_id,member,last_read_at")),
    markRead: (pid) => must(db.rpc("mark_read", { p_problem: pid })),
    listLinks: () => must(db.from("problem_links").select("a,b")),
    addLink: (a, b) => must(db.from("problem_links").insert({ a: Math.min(a, b), b: Math.max(a, b) })),
    removeLink: (a, b) => must(db.from("problem_links").delete().eq("a", Math.min(a, b)).eq("b", Math.max(a, b))),
    listReminders: () => must(db.from("reminders").select("id,problem_id,remind_at,sent_at").is("sent_at", null)),
    addReminder: (pid, at) => must(db.from("reminders").insert({ problem_id: pid, remind_at: at })),
    removeReminder: (id) => must(db.from("reminders").delete().eq("id", id)),
    listEvents: (pid) => must(db.from("problem_events").select("*").eq("problem_id", pid).order("created_at", { ascending: true })),
    getMe: () => must(db.from("members").select(ME_COLS).eq("user_id", me.user_id).single()),
    updateMe: (patch) => must(db.from("members").update(patch).eq("user_id", me.user_id).select(ME_COLS).single()),
    adminSetLimit: (n) => must(db.rpc("admin_set_limit", { p_limit: n })),
    adminSetRemoved: (u, removed) => must(db.rpc("admin_set_removed", { p_user: u, p_removed: removed })),

    async uploadImage({ blob, ext }) {
      const path = `${new Date().toISOString().slice(0, 7)}/${uid()}.${ext}`;
      const { error } = await db.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || "image/jpeg", cacheControl: "31536000", upsert: false,
      });
      if (error) throw Object.assign(new Error(error.message || "upload failed"), { storage: true });
      return path;
    },
    async uploadChatFile(f) {
      const ext = (f.name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || EXT[f.type] || (f.kind === "audio" ? "webm" : "bin")).toLowerCase();
      const path = `${new Date().toISOString().slice(0, 7)}/${uid()}.${ext}`;
      const { error } = await db.storage.from(CHAT_BUCKET).upload(path, f.blob, {
        contentType: f.type || "application/octet-stream", cacheControl: "31536000", upsert: false,
      });
      if (error) throw Object.assign(new Error(error.message || "upload failed"), { storage: true });
      const att = { kind: f.kind, path, name: f.name.slice(0, 120), type: f.type, size: f.size };
      if (f.duration) att.duration = Math.round(f.duration);
      return att;
    },
    async removeFiles(bucket, paths) {
      const list = (paths || []).filter((p) => p && !/^(data:|blob:|https?:)/.test(p));
      if (!list.length) return;
      try { await db.storage.from(bucket).remove(list); } catch (e) { console.warn(e); }
    },
    // كل جدول في قناة لوحده، عشان لو جدول لسه متعملش ما يوقفش الباقي
    subscribe(handlers) {
      for (const [table, fn] of Object.entries(handlers)) {
        db.channel(`changes-${table}`)
          .on("postgres_changes", { event: "*", schema: "public", table }, fn)
          .subscribe();
      }
    },
  };

  let authSession = null;
  const sessionUser = () => authSession?.user || null;

  // ============ الصور ============
  const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "application/pdf": "pdf" };
  const fail = (kind) => Object.assign(new Error(kind), { kind });
  const publicUrl = (bucket, path) => (db ? db.storage.from(bucket).getPublicUrl(path).data.publicUrl : "");
  function imageUrl(ref) {
    if (!ref) return "";
    if (/^(data:|blob:|https?:)/.test(ref)) return ref;
    return publicUrl(BUCKET, ref);
  }
  const attUrl = (a) => a.url || publicUrl(CHAT_BUCKET, a.path);

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
    if (file.type === "image/gif") {
      if (file.size > MAX_BYTES) throw fail("too-big");
      return { blob: file, ext: "gif" };
    }
    const img = await loadImage(file);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = Math.min(1, 1920 / Math.max(w, h));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && EXT[file.type]) return { blob: file, ext: EXT[file.type] };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.86));
    if (!blob) throw fail("bad-image");
    if (blob.size > MAX_BYTES) throw fail("too-big");
    return { blob, ext: "jpg" };
  }

  // ============ الدخول ============
  let fullTimer;
  function showAuth(kind, msg = "") {
    clearTimeout(fullTimer);
    if (kind === "full") fullTimer = setTimeout(enter, 30e3);
    $("app").hidden = true;
    $("auth").hidden = false;
    const email = sessionUser()?.email;
    const who = email ? `<p class="auth-who">إنت داخل بـ <b dir="ltr">${esc(email)}</b></p>` : "";
    const signOutBtn = `<button type="button" class="btn btn-ghost" data-auth="signout">${icon("logout")} اخرج وادخل بحساب تاني</button>`;
    const body = {
      loading: `<p class="muted">بيحمّل…</p>`,
      config: `<p>الموقع لسه مش متوصل بقاعدة البيانات. حط بيانات Supabase في <code>config.js</code>.</p>`,
      broken: `<p>مقدرتش أحمّل الموقع. اتأكد من النت واعمل ريفريش.</p>
               <button type="button" class="btn btn-primary btn-lg btn-block" data-auth="reload">جرّب تاني</button>`,
      signin: `<p>ادخل بحساب جوجل بتاعك عشان تشوف مشاكل الفريق وتشتغل عليها.</p>
               ${msg ? `<p class="auth-error">${esc(msg)}</p>` : ""}
               <button type="button" class="btn btn-google btn-lg btn-block" data-auth="google">${GOOGLE_G} ادخل بحساب جوجل</button>
               <p class="auth-note">بعد ما تدخل، الموقع بيفتكرك على الجهاز ده. ولو دخلت من جهاز تاني بنفس الحساب هتلاقي كل حاجة زي ما هي.</p>`,
      full: `<div class="auth-state">${icon("user", "i auth-icon")}<h2>الفريق كامل دلوقتي</h2>
               <p>العدد المسموح بيه في الفريق كمل. كلّم الأدمن يزوّد العدد، وأول ما يزوّده هتدخل على طول.</p></div>
               ${who}
               <button type="button" class="btn btn-primary btn-lg btn-block" data-auth="retry">جرّب تاني</button>
               ${signOutBtn}`,
      removed: `<div class="auth-state">${icon("shield", "i auth-icon")}<h2>مبقتش ضمن الفريق</h2>
               <p>الأدمن شالك من الفريق. لو ده حصل بالغلط، كلّمه يرجّعك.</p></div>
               ${who}${signOutBtn}`,
      error: `<p class="auth-error">${esc(msg)}</p>${who}
               <button type="button" class="btn btn-primary btn-lg btn-block" data-auth="retry">جرّب تاني</button>
               ${signOutBtn}`,
    }[kind];
    $("auth-body").innerHTML = body;
  }

  async function signIn() {
    const { error } = await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } },
    });
    if (error) showAuth("signin", friendlyError(error));
  }

  async function signOut() {
    try { await disablePush({ quiet: true }); } catch (e) { console.warn(e); }
    try { await db.auth.signOut(); } catch (e) { console.warn(e); }
    location.hash = "";
    location.reload();
  }

  async function enter() {
    let res;
    try {
      res = await store.join();
    } catch (e) {
      console.error(e);
      return showAuth("error", friendlyError(e));
    }
    isAdmin = !!res.is_admin;
    me = res.member;
    if (res.state === "removed") return showAuth("removed");
    if (res.state === "full") return showAuth("full");
    startApp(res.is_new);
  }

  // لو الأدمن قلّل العدد أو شالني وأنا جوه، أو غيّرت بياناتي من جهاز تاني
  let recheckTimer;
  function recheckMembership() {
    clearTimeout(recheckTimer);
    recheckTimer = setTimeout(async () => {
      await reloadRoster();
      const mine = roster.find((r) => r.user_id === me?.user_id);
      if (!mine?.active) return enter();
      isAdmin = !!mine.is_admin;
      const row = await soft(store.getMe, null);
      if (row) {
        const renamed = row.display_name !== me.display_name;
        me = { ...me, ...row };
        renderMe();
        trackPresence();
        if (renamed) renderView();
      }
    }, 400);
  }

  async function boot() {
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-auth]");
      if (!b) return;
      const a = b.dataset.auth;
      if (a === "google") signIn();
      if (a === "signout") signOut();
      if (a === "reload") location.reload();
      if (a === "retry") { showAuth("loading"); enter(); }
    });
    if (!configured) return showAuth("config");
    if (!db) return showAuth("broken");

    const params = new URLSearchParams(location.search);
    const oauthError = params.get("error_description") || params.get("error");
    let data;
    try {
      ({ data } = await db.auth.getSession());
    } catch (e) {
      return showAuth("error", friendlyError(e));
    }
    if (params.has("code") || oauthError) {
      try { history.replaceState(null, "", location.pathname + location.hash); } catch {}
    }
    authSession = data?.session || null;
    db.auth.onAuthStateChange((event, s) => {
      if (s) authSession = s;
      if (event === "SIGNED_OUT" && started) location.reload();
    });
    if (!authSession) return showAuth("signin", oauthError ? "الدخول ما كملش. جرّب تاني." : "");
    showAuth("loading");
    enter();
  }

  // ============ مين فاتح دلوقتي ============
  let presenceCh = null;
  const isOnline = (name) => online.some((o) => same(o.name, name));
  const onlineEntry = (name) => online.find((o) => same(o.name, name));

  function startPresence() {
    presenceCh = db.channel("team-presence", { config: { presence: { key: me.user_id } } });
    presenceCh
      .on("presence", { event: "sync" }, () => {
        const map = new Map();
        Object.values(presenceCh.presenceState()).flat().forEach((p) => {
          if (!p?.uid || !p?.name) return;
          const cur = map.get(p.uid) || { uid: p.uid, name: p.name, availability: p.availability || "available", viewing: [] };
          if (p.viewing) cur.viewing.push(p.viewing);
          map.set(p.uid, cur);
        });
        online = [...map.values()];
        renderPresence();
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") trackPresence(); });
  }

  function trackPresence() {
    if (!presenceCh || !me) return;
    Promise.resolve(presenceCh.track({
      uid: me.user_id, name: myName(), availability: me.availability,
      viewing: route.view === "issue" ? route.id : null,
    })).catch(() => {});
  }

  function renderPresence() {
    const list = [...online].sort((a, b) => (a.uid === me?.user_id ? -1 : b.uid === me?.user_id ? 1 : 0));
    $("presence-text").textContent = list.length ? `فاتحين دلوقتي · ${list.length}` : "محدش فاتح دلوقتي";
    const shown = list.slice(0, 5);
    $("presence-avatars").innerHTML =
      shown.map((o) => `<span class="stack-item" title="${esc(o.name)}">${avatar(o.name, "sm")}</span>`).join("") +
      (list.length > shown.length ? `<span class="stack-more">+${list.length - shown.length}</span>` : "");
    $("nav-team").dataset.count = list.length ? String(list.length) : "";
    renderViewers();
    if (route.view === "team") renderView();
  }

  function renderViewers() {
    const el = $("viewers");
    if (!el || route.view !== "issue") return;
    const others = online.filter((o) => o.uid !== me?.user_id && o.viewing.includes(route.id));
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
    const open = issues.filter(isOpen).length;
    $("count-open").textContent = open;
    $("count-solved").textContent = issues.length - open;
    $("count-all").textContent = issues.length;
    document.querySelectorAll("#tabs [role=tab]").forEach((t) =>
      t.setAttribute("aria-selected", String(t.dataset.status === tab))
    );

    const mine = issues.filter((i) => isOpen(i) && isAssignee(i)).length;
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
    $("me-btn").classList.toggle("active", route.view === "settings");
    $("menu-dot").hidden = !issues.some((i) => unreadCount(i.id) > 0);
  }

  function listItem(i) {
    const active = route.view === "issue" && route.id === i.id;
    const solved = i.status === "solved";
    const unread = unreadCount(i.id);
    const nComments = commentsFor(i.id).length;
    const dot = solved ? " solved" : i.status === "in_progress" ? " working" : isUrgent(i) ? " urgent" : "";
    const meta = [
      isOverdue(i) ? `<span class="sb-late overdue" title="عدّى الميعاد النهائي">${icon("clock")}</span>`
        : isLate(i) ? `<span class="sb-late" title="مفتوحة من ${esc(duration(Date.now() - new Date(i.created_at)))}">${icon("clock")}</span>` : "",
      imagesOf(i).length ? `<span class="sb-meta-i" title="فيها صور">${icon("image")}</span>` : "",
      unread ? `<span class="sb-unread" title="${esc(plural(unread, WORDS.message))}">${unread}</span>`
        : nComments ? `<span class="sb-meta-i sb-count" title="${nComments} رسالة في النقاش">${icon("chat")}${nComments}</span>` : "",
    ].join("");
    return `
      <button type="button" class="sb-item${active ? " active" : ""}${solved ? " solved" : ""}${unread ? " unread" : ""}" data-id="${i.id}"
        ${active ? 'aria-current="page"' : ""} title="${esc(`${i.title} — ${i.author}، ${ago(i.created_at)}${i.assignee ? ` · المسؤول: ${i.assignee}` : ""}`)}">
        <span class="dot${dot}" aria-hidden="true"></span>
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
      // البحث بيدوّر في كل المشاكل، مش في القسم المفتوح بس
      .filter((i) => q || tab === "all" || (tab === "open" ? isOpen(i) : i.status === "solved"))
      .filter((i) => !assigneeFilter || same(i.assignee, assigneeFilter))
      .filter((i) => !q || String(i.id) === q.replace("#", "") ||
        [i.title, i.details, i.note, i.author, i.solved_by, i.solution, i.assignee]
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
    const pinned = rows.filter((i) => i.pinned);
    const urgent = rows.filter((i) => !i.pinned && isOpen(i) && isUrgent(i));
    if (pinned.length) html += `<h3 class="sb-group pinned">${icon("pin")} مثبتة</h3>` + pinned.map(listItem).join("");
    if (urgent.length) html += `<h3 class="sb-group urgent">${icon("flame")} عاجلة</h3>` + urgent.map(listItem).join("");
    let lastGroup = null;
    for (const i of rows) {
      if (i.pinned || (isOpen(i) && isUrgent(i))) continue;
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
    if (!me) return;
    const av = AVAILABILITY[me.availability] || AVAILABILITY.available;
    $("me-av").innerHTML = `${avatar(myName())}<span class="av-dot ${av.cls}" title="${av.label}"></span>`;
    $("me-name").textContent = myName();
  }

  // ============ المحتوى ============
  function renderTop() {
    const actions = $("top-actions");
    actions.innerHTML = "";
    if (route.view === "issue") {
      $("crumb").innerHTML = `<span>المشاكل</span><span class="sep">/</span><b>#${route.id}</b>`;
    } else if (route.view === "team") {
      $("crumb").innerHTML = "<b>الفريق</b>";
    } else if (route.view === "stats") {
      $("crumb").innerHTML = "<b>الإحصائيات</b>";
      actions.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-action="export">${icon("download")} نزّل Excel</button>`;
    } else if (route.view === "settings") {
      $("crumb").innerHTML = "<b>حسابي</b>";
    } else {
      $("crumb").innerHTML = "<b>مشكلة جديدة</b>";
    }
  }

  // ---------- مشكلة جديدة ----------
  function composeHtml() {
    return `
      <section class="compose">
        <header class="view-head">
          <h1>مشكلة جديدة</h1>
          <p>اكتب المشكلة، وهتظهر للفريق كله على طول.</p>
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
            <textarea id="details" class="input" rows="4" placeholder="حصلت إمتى؟ فين بالظبط؟ جربت إيه؟">${esc(draft.details)}</textarea>
          </div>

          <div class="field">
            <span class="label" id="images-label">صور <span class="optional">اختياري</span></span>
            <button type="button" id="dropzone" class="dropzone" data-action="pick-images" aria-labelledby="images-label" aria-describedby="images-hint">
              ${icon("image")}
              <span><b>اختار صور</b> أو اسحبها هنا</span>
              <span class="dz-hint" id="images-hint">أو الصق سكرين شوت بـ Ctrl+V · لحد ${MAX_IMAGES} صور</span>
            </button>
            <div id="thumbs" class="thumbs" hidden></div>
          </div>

          <details id="more" class="more" ${draft.more ? "open" : ""}>
            <summary>
              <span class="more-title">تفاصيل إضافية</span>
              <span class="more-hint">المسؤول، الأهمية، الميعاد النهائي، ملاحظة</span>
              ${icon("chevron", "i more-chev")}
            </summary>
            <div class="more-body">
              <div class="grid-2">
                <div class="field">
                  <label for="assignee">المسؤول عنها</label>
                  <input id="assignee" class="input" type="text" maxlength="60" list="names" autocomplete="off"
                    placeholder="اكتب اسم المسؤول" value="${esc(draft.assignee)}" />
                </div>
                <div class="field">
                  <label for="due">لازم تتحل قبل</label>
                  <input id="due" class="input" type="datetime-local" value="${esc(draft.due)}" />
                </div>
              </div>
              <label class="switch switch-danger" for="urgent">
                <input id="urgent" type="checkbox" ${draft.urgent ? "checked" : ""} />
                <span class="switch-track" aria-hidden="true"></span>
                <span class="switch-text">مشكلة عاجلة</span>
              </label>
              <div class="field">
                <label for="note">ملاحظة</label>
                <textarea id="note" class="input" rows="2" placeholder="أي حاجة زيادة حابب الفريق يعرفها">${esc(draft.note)}</textarea>
              </div>
            </div>
          </details>

          <div class="form-foot">
            <p class="as-who">${avatar(myName(), "sm")}<span>هتتسجل باسمك <b>${esc(myName())}</b> · <span id="now">${esc(dateTime(new Date().toISOString()))}</span></span></p>
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

  // ---------- صفحة المشكلة ----------
  function statusBadge(i) {
    if (i.status === "solved") return `<span class="badge solved">اتحلت</span>`;
    if (i.status === "in_progress") return `<span class="badge working">بيتشتغل عليها</span>`;
    return `<span class="badge">متحلتش</span>`;
  }

  function dueHtml(i) {
    if (!i.due_at) return "";
    const diff = new Date(i.due_at) - Date.now();
    if (i.status === "solved") return `<span class="sub">الميعاد كان ${esc(dateShortTime(i.due_at))}</span>`;
    return diff > 0
      ? `<span class="sub">فاضل ${esc(duration(diff))}</span>`
      : `<span class="sub overdue-text">عدّى الميعاد بـ ${esc(duration(diff))}</span>`;
  }

  function galleryHtml(i) {
    const imgs = imagesOf(i);
    const busy = uploadingIssue === i.id;
    const full = imgs.length >= MAX_IMAGES;
    return `
      <section class="section gallery-zone">
        <div class="section-head">
          <h2>الصور${imgs.length ? ` · ${imgs.length}` : ""}</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-action="add-images" ${busy || full ? "disabled" : ""}>
            ${icon("image")} ${busy ? "بيرفع…" : "أضف صور"}</button>
        </div>
        ${imgs.length
          ? `<div class="gallery">${imgs.map((r, n) => `
              <button type="button" class="thumb" data-action="view-image" data-index="${n}" aria-label="افتح الصورة ${n + 1}">
                <img src="${esc(imageUrl(r))}" alt="" loading="lazy" />
              </button>`).join("")}</div>`
          : `<p class="none">مفيش صور. دوس "أضف صور"، أو اسحب صورة هنا، أو الصق سكرين شوت بـ Ctrl+V.</p>`}
      </section>`;
  }

  function relatedHtml(i) {
    const rows = [];
    if (i.duplicate_of) {
      const o = findIssue(i.duplicate_of);
      rows.push(relRow(o, i.duplicate_of, "مكررة من", `data-action="unduplicate"`));
    }
    issues.filter((x) => x.duplicate_of === i.id).forEach((x) => rows.push(relRow(x, x.id, "نسخة مكررة", null)));
    links.filter((l) => l.a === i.id || l.b === i.id).forEach((l) => {
      const other = l.a === i.id ? l.b : l.a;
      rows.push(relRow(findIssue(other), other, "مرتبطة", `data-action="unlink" data-other="${other}"`));
    });
    if (!rows.length) return "";
    return `<section class="section related"><h2>مشاكل مرتبطة</h2><ul class="rel-list">${rows.join("")}</ul></section>`;
  }

  function relRow(o, id, label, removeAttrs) {
    const dot = !o ? "" : o.status === "solved" ? " solved" : o.status === "in_progress" ? " working" : "";
    return `
      <li class="rel">
        <span class="rel-kind">${label}</span>
        <button type="button" class="rel-link" data-action="go-problem" data-id="${id}">
          <span class="dot${dot}" aria-hidden="true"></span><span class="ref">#${id}</span> ${o ? esc(o.title) : "مشكلة اتمسحت"}
        </button>
        ${removeAttrs ? `<button type="button" class="icon-btn rel-x" ${removeAttrs} aria-label="شيل الربط">${icon("x")}</button>` : ""}
      </li>`;
  }

  function toolbarHtml(i) {
    const solved = i.status === "solved";
    const btns = [];
    if (!solved && isAssignee(i)) {
      btns.push(i.status === "in_progress"
        ? `<button type="button" class="btn btn-secondary btn-sm" data-action="work-stop">${icon("pause")} وقّفت الشغل عليها</button>`
        : `<button type="button" class="btn btn-primary btn-sm" data-action="work-start">${icon("play")} أنا شغال عليها</button>`);
    }
    if (!solved && !i.assignee) {
      btns.push(`<button type="button" class="btn btn-secondary btn-sm" data-action="take">${icon("hand")} هتابعها أنا</button>`);
    }
    const nRem = myReminders.filter((r) => r.problem_id === i.id).length;
    btns.push(`<button type="button" class="btn btn-ghost btn-sm${i.pinned ? " on" : ""}" data-action="pin" aria-pressed="${!!i.pinned}">${icon("pin")} ${i.pinned ? "مثبتة" : "ثبّت"}</button>`);
    btns.push(`<button type="button" class="btn btn-ghost btn-sm${nRem ? " on" : ""}" data-action="remind">${icon("alarm")} فكّرني${nRem ? ` <span class="n">${nRem}</span>` : ""}</button>`);
    btns.push(`<button type="button" class="btn btn-ghost btn-sm" data-action="link">${icon("link")} اربط</button>`);
    const more = [
      isAuthor(i) ? `<button type="button" data-action="edit">${icon("edit")} عدّل المشكلة</button>` : "",
      `<button type="button" data-action="copy">${icon("link")} انسخ لينك المشكلة</button>`,
      `<button type="button" class="danger" data-action="delete">${icon("trash")} امسح المشكلة</button>`,
    ].join("");
    btns.push(`<details class="menu"><summary class="btn btn-ghost btn-sm" aria-label="المزيد">${icon("more")}</summary><div class="menu-list">${more}</div></details>`);
    return `<div class="toolbar" role="toolbar" aria-label="أوامر المشكلة">${btns.join("")}</div>`;
  }

  function detailHtml(i) {
    const solved = i.status === "solved";
    const person = (n) => (n ? `${avatar(n, "sm")}<span>${esc(n)}</span>` : `<span class="sub">مش متسجل</span>`);
    const when = (iso) => `<span>${esc(dateLong(iso))}</span><span class="sub">${esc(timeOnly(iso))}</span>`;
    const asg = memberByName(i.assignee);
    const asgAway = asg && asg.availability !== "available" ? `<span class="sub av-note ${AVAILABILITY[asg.availability].cls}">${AVAILABILITY[asg.availability].label}${asg.status_note ? ` · ${esc(asg.status_note)}` : ""}</span>` : "";

    const props = [
      ["الحالة", statusBadge(i)],
      ["المسؤول", `<input class="prop-input" data-field="assignee" type="text" maxlength="60" list="names" autocomplete="off"
          aria-label="المسؤول عن المشكلة" placeholder="اكتب اسم المسؤول" value="${esc(i.assignee || "")}" />${asgAway}`],
      ["الأهمية", `<select class="prop-select${isUrgent(i) ? " is-urgent" : ""}" data-field="priority" aria-label="أهمية المشكلة">
          <option value="normal" ${isUrgent(i) ? "" : "selected"}>عادية</option>
          <option value="urgent" ${isUrgent(i) ? "selected" : ""}>عاجلة</option>
        </select>`],
      ["الميعاد النهائي", `<input class="prop-input" data-field="due_at" type="datetime-local" aria-label="الميعاد النهائي" value="${esc(toLocalInput(i.due_at))}" />${dueHtml(i)}`],
      ["سجّلها", person(i.author)],
      ["اتسجلت", when(i.created_at)],
    ];
    if (solved) {
      props.push(["حلّها", person(i.solved_by)], ["اتحلت", when(i.solved_at)],
        ["مدة الحل", `<span>${esc(duration(new Date(i.solved_at) - new Date(i.created_at)))}</span>`]);
    } else {
      props.push(["مفتوحة من", `<span class="${isLate(i) ? "late-text" : ""}">${esc(duration(Date.now() - new Date(i.created_at)))}</span>`]);
    }
    if (i.recur_count > 0) props.push(["اتكررت", `<span>${esc(plural(i.recur_count, WORDS.time))}</span>`]);

    const section = (title, text, cls = "") =>
      `<section class="section ${cls}"><h2>${title}</h2>${text ? `<p>${esc(text)}</p>` : `<p class="none">مفيش.</p>`}</section>`;

    const editing = editingId === i.id;
    const body = editing
      ? `<form id="edit-form" class="card edit-card" novalidate>
          <div class="card-head"><h2>تعديل المشكلة</h2><p>التعديل بيظهر للفريق كله، وبيتسجل في سجل التغييرات.</p></div>
          <div class="field">
            <label for="edit-title">اسم المشكلة <span class="req" aria-hidden="true">*</span></label>
            <input id="edit-title" class="input" type="text" maxlength="120" value="${esc(i.title)}" />
            <p class="field-error" id="edit-title-error" hidden>اسم المشكلة مينفعش يبقى فاضي.</p>
          </div>
          <div class="field"><label for="edit-details">وصف المشكلة</label><textarea id="edit-details" class="input" rows="4">${esc(i.details || "")}</textarea></div>
          <div class="field"><label for="edit-note">ملاحظة</label><textarea id="edit-note" class="input" rows="2">${esc(i.note || "")}</textarea></div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">${icon("check")} احفظ التعديل</button>
            <button type="button" class="btn btn-ghost" data-action="cancel-edit">إلغاء</button>
          </div>
        </form>`
      : `${section("وصف المشكلة", i.details)}${i.note ? section("ملاحظة", i.note) : ""}`;

    const action = solved
      ? `<div class="card solved-card">
          <div class="solved-text">${icon("check")}<span>المشكلة دي اتحلت${i.solved_by ? ` على إيد <b>${esc(i.solved_by)}</b>` : ""}.</span></div>
          <div class="solved-actions">
            <button type="button" class="btn btn-secondary" data-action="recur">${icon("repeat")} حصلت تاني</button>
            <button type="button" class="link-btn muted-link" data-action="reopen">اتقفلت بالغلط؟ افتحها تاني</button>
          </div>
        </div>`
      : `<form id="resolve-form" class="card resolve" novalidate>
          <div class="card-head">
            <h2>قفل المشكلة</h2>
            <p>لما تتحل، اكتب اتحلت إزاي عشان لو اتكررت نعرف نعمل إيه. هتتسجل باسمك.</p>
          </div>
          <div class="field">
            <label for="how">إزاي اتحلت؟ <span class="optional">اختياري</span></label>
            <textarea id="how" class="input" rows="3" placeholder="اكتب الحل باختصار"></textarea>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-success btn-lg">${icon("check")} اتحلت</button>
          </div>
        </form>`;

    const kicker = [
      statusBadge(i),
      i.status === "in_progress" && i.assignee ? `<span class="kicker-note">${esc(i.assignee)} شغال عليها</span>` : "",
      isUrgent(i) && !solved ? `<span class="badge urgent">${icon("flame")} عاجلة</span>` : "",
      i.pinned ? `<span class="badge pinned">${icon("pin")} مثبتة</span>` : "",
      isOverdue(i) ? `<span class="badge overdue">${icon("clock")} عدّى الميعاد</span>` : isLate(i) ? `<span class="badge late">${icon("clock")} متأخرة</span>` : "",
      i.recur_count > 0 ? `<span class="badge recur">${icon("repeat")} اتكررت ${esc(plural(i.recur_count, WORDS.time))}</span>` : "",
      isAssignee(i) && !solved ? `<span class="badge mine">مسؤوليتك</span>` : "",
      `<span class="ref">#${i.id}</span>`,
    ].join("");

    const nComments = commentsFor(i.id).length;
    return `
      <article class="detail">
        <header class="detail-head">
          <div class="kicker">${kicker}</div>
          <h1 class="detail-title">${esc(i.title)}</h1>
          <p class="byline">${avatar(i.author, "sm")}<span><b>${esc(i.author)}</b> سجّلها ${esc(ago(i.created_at))}${i.edited_at ? ` · <span class="edited">اتعدلت ${esc(ago(i.edited_at))}</span>` : ""}</span></p>
          <p class="viewers" id="viewers" hidden></p>
          ${toolbarHtml(i)}
        </header>
        <div class="detail-grid">
          <div class="detail-main">
            ${body}
            ${galleryHtml(i)}
            ${relatedHtml(i)}
            ${!solved && i.solution ? section("الحل اللي اتكتب قبل كده", i.solution, "solution") : ""}
            <section class="section discuss">
              <div class="dtabs" role="tablist" aria-label="النقاش والسجل">
                <button type="button" role="tab" class="dtab" data-dtab="chat" aria-selected="${detailTab === "chat"}">
                  ${icon("chat")} النقاش <span class="n" id="chat-count">${nComments || ""}</span></button>
                <button type="button" role="tab" class="dtab" data-dtab="history" aria-selected="${detailTab === "history"}">
                  ${icon("history")} السجل</button>
                <span class="dtabs-spacer"></span>
                ${detailTab === "chat" && nComments >= 2 ? `<button type="button" class="btn btn-ghost btn-sm ai-btn" data-action="summarize">${icon("sparkle")} لخّص النقاش</button>` : ""}
              </div>
              <div id="ai-card" class="ai-card" hidden></div>
              <div id="dtab-panel">${detailTab === "chat" ? chatHtml(i) : historyHtml(i)}</div>
            </section>
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

  // ---------- النقاش ----------
  function highlightMentions(html) {
    const names = activeRoster().map((r) => r.display_name).sort((a, b) => b.length - a.length);
    let out = html;
    for (const n of names) {
      const tok = "@" + esc(n);
      if (!out.includes(tok)) continue;
      const cls = same(n, myName()) ? "mention me" : "mention";
      out = out.split(tok).join(`<span class="${cls}">${tok}</span>`);
    }
    return out;
  }

  function attachmentsHtml(c) {
    const atts = Array.isArray(c.attachments) ? c.attachments : [];
    if (!atts.length) return "";
    const imgs = atts.filter((a) => a.kind === "image");
    return `<div class="atts">
      ${imgs.length ? `<div class="att-imgs">${imgs.map((a, n) => `
        <button type="button" class="att-img" data-action="chat-image" data-cid="${c.id}" data-index="${n}" aria-label="افتح الصورة">
          <img src="${esc(attUrl(a))}" alt="" loading="lazy" /></button>`).join("")}</div>` : ""}
      ${atts.filter((a) => a.kind === "audio").map((a) => `
        <div class="att-audio">${icon("mic")}<audio controls preload="none" src="${esc(attUrl(a))}"></audio>${a.duration ? `<span class="att-dur">${clock(a.duration)}</span>` : ""}</div>`).join("")}
      ${atts.filter((a) => a.kind === "file").map((a) => `
        <a class="att-file" href="${esc(attUrl(a))}" target="_blank" rel="noopener" download="${esc(a.name)}">
          ${icon("file")}<span class="att-name">${esc(a.name)}</span><span class="att-size">${fileSize(a.size || 0)}</span></a>`).join("")}
    </div>`;
  }

  function reactionsHtml(c) {
    if (c.pending) return "";
    const rs = reactions.filter((r) => r.comment_id === c.id);
    const groups = EMOJIS.map((e) => {
      const list = rs.filter((r) => r.emoji === e);
      return { e, list, mine: list.some((r) => r.user_id === me?.user_id) };
    }).filter((g) => g.list.length);
    return `<div class="reacts">
      ${groups.map((g) => `<button type="button" class="react${g.mine ? " mine" : ""}" data-action="react" data-cid="${c.id}" data-emoji="${g.e}"
          title="${esc(g.list.map((r) => r.member).join("، "))}">${g.e} <span>${g.list.length}</span></button>`).join("")}
      <span class="react-add-wrap">
        <button type="button" class="react-add" data-action="react-open" data-cid="${c.id}" aria-label="رد سريع">${icon("smile")}</button>
      </span>
    </div>`;
  }

  function chatMessagesHtml(id) {
    const list = commentsFor(id);
    if (!list.length) return `<p class="chat-empty">لسه محدش كتب حاجة. ابدأ النقاش مع الفريق هنا، واكتب @ عشان تذكر حد.</p>`;
    let html = "";
    let prev = null;
    let lastDay = null;
    const lastMine = [...list].reverse().find(isMineComment);
    for (const c of list) {
      const day = dayLabel(c.created_at);
      if (day !== lastDay) {
        html += `<div class="chat-day"><span>${esc(day)}</span></div>`;
        lastDay = day;
        prev = null;
      }
      const mine = isMineComment(c);
      const grouped = prev && same(prev.author, c.author) && new Date(c.created_at) - new Date(prev.created_at) < 5 * 60e3;
      const mentionsMe = !mine && (c.body || "").toLowerCase().includes("@" + myName().toLowerCase());
      html += `
        <div class="msg${mine ? " mine" : ""}${grouped ? " grouped" : ""}${c.pending ? " pending" : ""}${mentionsMe ? " mentions-me" : ""}" data-cid="${c.id}">
          ${mine ? "" : grouped ? '<span class="msg-av"></span>' : `<span class="msg-av">${avatar(c.author, "sm")}</span>`}
          <div class="bubble-wrap">
            <div class="bubble">
              ${!mine && !grouped ? `<span class="msg-name">${esc(c.author)}</span>` : ""}
              ${attachmentsHtml(c)}
              ${c.body ? `<p>${highlightMentions(esc(c.body))}</p>` : ""}
              <time datetime="${esc(c.created_at)}">${c.pending ? "بيتبعت…" : esc(timeOnly(c.created_at))}</time>
            </div>
            ${reactionsHtml(c)}
            ${c === lastMine && !c.pending ? seenHtml(c) : ""}
          </div>
        </div>`;
      prev = c;
    }
    return html;
  }

  function seenHtml(c) {
    const who = reads
      .filter((r) => r.problem_id === c.problem_id && r.user_id !== me?.user_id && new Date(r.last_read_at) >= new Date(c.created_at))
      .map((r) => r.member)
      .filter(Boolean);
    return who.length
      ? `<p class="seen seen-yes">✓✓ شافها ${esc(who.join("، "))}</p>`
      : `<p class="seen">✓ اتبعتت</p>`;
  }

  function pendingChipsHtml(pid) {
    return (chatFiles[pid] || []).map((f) => `
      <span class="pchip">${f.kind === "image" ? `<img src="${f.url}" alt="" />` : icon(f.kind === "audio" ? "mic" : "file")}
        <span class="pchip-name">${esc(f.name)}</span>
        <button type="button" class="pchip-x" data-action="remove-pending" data-key="${f.key}" aria-label="شيل ${esc(f.name)}">${icon("x")}</button>
      </span>`).join("");
  }

  function chatHtml(i) {
    const hasText = !!(chatDrafts[i.id] || "").trim() || (chatFiles[i.id] || []).length;
    return `
      <div class="chat-box">
        <div class="chat-list" id="chat-list" data-pid="${i.id}" aria-live="polite">${chatMessagesHtml(i.id)}</div>
        <div class="chat-compose">
          <div id="mention-pop" class="mention-pop" role="listbox" hidden></div>
          <div id="chat-pending" class="chat-pending" ${(chatFiles[i.id] || []).length ? "" : "hidden"}>${pendingChipsHtml(i.id)}</div>
          <div id="rec-bar" class="rec-bar" hidden>
            <span class="rec-dot" aria-hidden="true"></span><span id="rec-time">0:00</span><span class="rec-label">بيسجّل…</span>
            <span class="rec-spacer"></span>
            <button type="button" class="btn btn-ghost btn-sm" data-action="rec-cancel">إلغاء</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="rec-send">${icon("send")} ابعت</button>
          </div>
          <form id="chat-form" class="chat-form" novalidate>
            <button type="button" class="icon-btn chat-tool" data-action="chat-attach" aria-label="ابعت صورة أو ملف">${icon("clip")}</button>
            <textarea id="chat-input" class="input" rows="1" maxlength="2000" placeholder="اكتب رسالة… واكتب @ عشان تذكر حد" aria-label="اكتب رسالة">${esc(chatDrafts[i.id] || "")}</textarea>
            <button type="button" id="mic-btn" class="btn btn-secondary chat-send" data-action="record" aria-label="سجّل رسالة صوتية" ${hasText ? "hidden" : ""}>${icon("mic")}</button>
            <button type="submit" id="send-btn" class="btn btn-primary chat-send" aria-label="ابعت" ${hasText ? "" : "hidden"}>${icon("send")}</button>
          </form>
        </div>
      </div>`;
  }

  const nearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 80;

  let chatPending = false;
  function renderChat(forceBottom = false) {
    const list = $("chat-list");
    if (!list || route.view !== "issue") return;
    if (playing()) { chatPending = true; return; }
    chatPending = false;
    const openPick = list.querySelector(".react-pick")?.dataset.cid;
    const stick = forceBottom || nearBottom(list);
    list.innerHTML = chatMessagesHtml(route.id);
    if (openPick) toggleReactPicker(Number(openPick), true);
    const n = commentsFor(route.id).length;
    if ($("chat-count")) $("chat-count").textContent = n || "";
    if (stick) list.scrollTop = list.scrollHeight;
  }

  function updateSendMode() {
    const input = $("chat-input");
    if (!input) return;
    const has = !!input.value.trim() || (chatFiles[route.id] || []).length > 0;
    $("send-btn").hidden = !has;
    $("mic-btn").hidden = has;
  }

  function renderChatPending() {
    const el = $("chat-pending");
    if (!el) return;
    el.innerHTML = pendingChipsHtml(route.id);
    el.hidden = !(chatFiles[route.id] || []).length;
    updateSendMode();
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // مين قرا: بنسجّل إني شفت الرسايل لما النقاش مفتوح قدامي
  let readTimer;
  function maybeMarkRead() {
    if (route.view !== "issue" || detailTab !== "chat" || document.visibilityState !== "visible") return;
    const pid = route.id;
    if (!findIssue(pid)) return;
    const last = commentsFor(pid).filter((c) => !c.pending).pop();
    const mineRead = reads.find((r) => r.problem_id === pid && r.user_id === me.user_id);
    if (!last || (mineRead && new Date(mineRead.last_read_at) >= new Date(last.created_at))) return;
    clearTimeout(readTimer);
    readTimer = setTimeout(async () => {
      const now = new Date().toISOString();
      const row = reads.find((r) => r.problem_id === pid && r.user_id === me.user_id);
      if (row) row.last_read_at = now;
      else reads.push({ problem_id: pid, user_id: me.user_id, member: myName(), last_read_at: now });
      renderList();
      renderTabs();
      try { await store.markRead(pid); } catch (e) { console.warn(e); }
    }, 700);
  }

  // ---------- السجل ----------
  function eventText(ev) {
    const d = ev.detail || {};
    switch (ev.kind) {
      case "created": return "سجّل المشكلة";
      case "edited": return "عدّل المشكلة";
      case "started": return "بدأ يشتغل عليها";
      case "stopped": return "وقّف الشغل عليها";
      case "solved": return "حلّ المشكلة";
      case "reopened": return "فتحها تاني";
      case "recurred": return "قال إنها حصلت تاني";
      case "assigned": return d.to ? `خلّى <b>${esc(d.to)}</b> المسؤول` : "شال المسؤول";
      case "priority": return d.to === "urgent" ? "خلّاها عاجلة" : "خلّاها عادية";
      case "due": return d.to ? `حدّد ميعاد نهائي ${esc(dateShortTime(d.to))}` : "شال الميعاد النهائي";
      case "pinned": return d.to ? "ثبّتها" : "شال التثبيت";
      case "duplicate": return d.of ? `علّمها مكررة من #${esc(d.of)}` : "شال علامة التكرار";
      case "images": return d.change > 0 ? `ضاف ${esc(plural(d.change, WORDS.image))}` : `مسح ${esc(plural(-d.change, WORDS.image))}`;
      default: return esc(ev.kind);
    }
  }
  const EVENT_ICON = {
    created: "plus", edited: "edit", started: "play", stopped: "pause", solved: "check", reopened: "reopen",
    recurred: "repeat", assigned: "user", priority: "flame", due: "calendar", pinned: "pin", duplicate: "link", images: "image",
  };

  function historyHtml(i) {
    const evs = eventsCache[i.id];
    if (!evs) return `<div class="view-loading">${'<div class="sk"></div>'.repeat(3)}</div>`;
    if (!evs.length) return `<p class="none">لسه مفيش تغييرات متسجلة.</p>`;
    return `<ol class="history">${[...evs].reverse().map((ev) => `
      <li class="ev ev-${esc(ev.kind)}">
        <span class="ev-icon">${icon(EVENT_ICON[ev.kind] || "history")}</span>
        <span class="ev-text"><b>${esc(ev.actor || "حد")}</b> ${eventText(ev)}</span>
        <time datetime="${esc(ev.created_at)}" title="${esc(dateTime(ev.created_at))}">${esc(ago(ev.created_at))}</time>
      </li>`).join("")}</ol>`;
  }

  async function loadHistory(pid) {
    try {
      eventsCache[pid] = await store.listEvents(pid);
    } catch (e) {
      console.warn(e);
      eventsCache[pid] = [];
    }
    if (route.view === "issue" && route.id === pid && detailTab === "history" && $("dtab-panel")) {
      $("dtab-panel").innerHTML = historyHtml(findIssue(pid));
    }
  }

  // ---------- الفريق ----------
  function memberStats(name) {
    const mine = (f) => issues.filter((i) => same(i[f], name));
    const solvedBy = mine("solved_by").filter((i) => i.status === "solved");
    return {
      reported: mine("author").length,
      solved: solvedBy.length,
      assignedOpen: mine("assignee").filter(isOpen).length,
      avgSolve: solvedBy.length
        ? solvedBy.reduce((s, i) => s + (new Date(i.solved_at) - new Date(i.created_at)), 0) / solvedBy.length
        : null,
    };
  }

  function teamHtml() {
    const active = activeRoster();
    const waiting = roster.filter((r) => !r.active && !r.removed);
    const removed = roster.filter((r) => r.removed);
    const onlineCount = active.filter((r) => isOnline(r.display_name)).length;

    const card = (r) => {
      const isMe = r.user_id === me.user_id;
      const on = isOnline(r.display_name);
      const o = onlineEntry(r.display_name);
      const viewing = o?.viewing.map(findIssue).filter(Boolean)[0];
      const av = AVAILABILITY[r.availability] || AVAILABILITY.available;
      const stats = memberStats(r.display_name);
      const status = on
        ? `<span class="m-status on">فاتح دلوقتي${viewing ? ` · بيبص على <a href="#p${viewing.id}">«${esc(viewing.title)}»</a>` : ""}</span>`
        : `<span class="m-status">آخر ظهور ${esc(ago(r.last_seen))}</span>`;
      return `
        <article class="member${on ? " online" : ""}">
          <div class="member-top">
            <span class="member-av">${avatar(r.display_name)}<span class="presence-dot${on ? " on" : ""}" aria-hidden="true"></span></span>
            <div class="member-id">
              <h3>${esc(r.display_name)}${isMe ? ' <span class="tag-sm">إنت</span>' : ""}${r.is_admin ? ` <span class="tag-sm admin">${icon("shield")} أدمن</span>` : ""}</h3>
              ${status}
            </div>
          </div>
          <p class="avail"><span class="av-chip ${av.cls}">${av.label}</span>${r.status_note ? `<span class="avail-note">${esc(r.status_note)}</span>` : ""}</p>
          <dl class="member-stats">
            <div><dt>سجّل</dt><dd>${stats.reported}</dd></div>
            <div><dt>حل</dt><dd>${stats.solved}</dd></div>
            <div><dt>مسؤول عن</dt><dd>${stats.assignedOpen} <span class="unit">مفتوحة</span></dd></div>
          </dl>
          <div class="member-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="show-assigned" data-name="${esc(r.display_name)}">
              ${icon("user")} ${isMe ? "مشاكلي" : `مشاكل ${esc(r.display_name)}`}</button>
            ${isAdmin && !isMe ? `<button type="button" class="btn btn-ghost btn-sm danger" data-action="admin-remove" data-uid="${r.user_id}" data-name="${esc(r.display_name)}">شيله من الفريق</button>` : ""}
          </div>
        </article>`;
    };

    const adminRow = (r, btn) => `
      <li class="admin-row">
        ${avatar(r.display_name, "sm")}
        <span class="admin-who"><b>${esc(r.display_name)}</b>${r.email ? `<span class="sub" dir="ltr">${esc(r.email)}</span>` : ""}</span>
        <span class="sub">دخل ${esc(ago(r.joined_at))}</span>
        ${btn || ""}
      </li>`;

    const adminPanel = !isAdmin ? "" : `
      <section class="card admin-card" aria-labelledby="admin-title">
        <div class="card-head">
          <h2 id="admin-title">${icon("shield")} إدارة الفريق</h2>
          <p>إنت الأدمن. الجزء ده بيظهرلك إنت بس.</p>
        </div>
        <div class="limit-row">
          <div>
            <b>عدد أعضاء الفريق المسموح</b>
            <span class="sub">داخلين دلوقتي ${active.length} من ${settings.member_limit}. لو قلّلت العدد، آخر اللي دخلوا هم اللي بيطلعوا.</span>
          </div>
          <div class="stepper" role="group" aria-label="العدد المسموح">
            <button type="button" class="btn btn-secondary" data-action="limit-dec" aria-label="قلّل" ${settings.member_limit <= 1 ? "disabled" : ""}>${icon("minus")}</button>
            <output>${settings.member_limit}</output>
            <button type="button" class="btn btn-secondary" data-action="limit-inc" aria-label="زوّد">${icon("plus")}</button>
          </div>
        </div>
        ${waiting.length ? `<div class="admin-list">
          <h3>مستنيين مكان · ${waiting.length}</h3>
          <p class="sub">دخلوا بجوجل بس الفريق كان كامل. هيدخلوا بالترتيب أول ما تزوّد العدد.</p>
          <ul>${waiting.map((r) => adminRow(r, `<button type="button" class="btn btn-ghost btn-sm danger" data-action="admin-remove" data-uid="${r.user_id}" data-name="${esc(r.display_name)}">امنعه</button>`)).join("")}</ul>
        </div>` : ""}
        ${removed.length ? `<div class="admin-list">
          <h3>اتشالوا من الفريق · ${removed.length}</h3>
          <ul>${removed.map((r) => adminRow(r, `<button type="button" class="btn btn-secondary btn-sm" data-action="admin-restore" data-uid="${r.user_id}">رجّعه</button>`)).join("")}</ul>
        </div>` : ""}
      </section>`;

    const sorted = [...active].sort((a, b) =>
      (isOnline(b.display_name) - isOnline(a.display_name)) || (new Date(b.last_seen) - new Date(a.last_seen)));
    return `
      <section class="page">
        <header class="view-head">
          <h1>الفريق</h1>
          <p>${plural(active.length, WORDS.member)} · <span class="on-text">${onlineCount} فاتحين دلوقتي</span></p>
        </header>
        ${adminPanel}
        <div class="members">${sorted.map(card).join("")}</div>
      </section>`;
  }

  // ---------- حسابي ----------
  function settingsHtml() {
    const av = me.availability || "available";
    const quietOn = me.quiet_start != null && me.quiet_end != null;
    const summaryOn = me.summary_hour != null;
    const hours = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${esc(hourLabel(h))}</option>`).join("");
    return `
      <section class="page settings">
        <header class="view-head">
          <h1>حسابي</h1>
          <p>الإعدادات دي بتاعتك إنت بس، ومتسجلة على حسابك فبتشتغل على كل أجهزتك.</p>
        </header>

        <section class="card set-card" aria-labelledby="set-profile">
          <h2 id="set-profile" class="card-title">الملف الشخصي</h2>
          <div class="profile-row">
            ${avatar(myName(), "lg")}
            <div><b>${esc(myName())}</b><span class="sub" dir="ltr">${esc(sessionUser()?.email || me.email || "")}</span>
              ${isAdmin ? `<span class="tag-sm admin">${icon("shield")} أدمن</span>` : ""}</div>
          </div>
          <div class="field">
            <label for="set-name">اسمك في الفريق</label>
            <div class="inline">
              <input id="set-name" class="input" type="text" maxlength="60" value="${esc(myName())}" />
              <button type="button" class="btn btn-secondary" data-action="save-name">احفظ</button>
            </div>
            <p class="hint">لو غيّرت اسمك، بيتغيّر في كل المشاكل والرسايل القديمة كمان.</p>
          </div>
          <div class="field">
            <span class="label" id="set-av-label">حالتك دلوقتي</span>
            <div class="seg seg-inline" role="radiogroup" aria-labelledby="set-av-label">
              ${Object.entries(AVAILABILITY).map(([k, v]) => `
                <button type="button" role="radio" aria-checked="${k === av}" data-action="set-availability" data-value="${k}">
                  <span class="av-dot ${v.cls}"></span>${v.label}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <label for="set-note">رسالة قصيرة للفريق <span class="optional">اختياري</span></label>
            <input id="set-note" class="input" type="text" maxlength="80" placeholder="مثلًا: راجع يوم الأحد" value="${esc(me.status_note || "")}" />
          </div>
        </section>

        <section class="card set-card" aria-labelledby="set-notif">
          <h2 id="set-notif" class="card-title">الإشعارات</h2>
          <div class="set-row" id="push-row">
            <div class="set-row-text"><b>إشعارات على الجهاز ده</b><span class="sub" id="push-desc">بيحمّل…</span></div>
            <button type="button" class="btn btn-primary" id="push-action" data-action="push-toggle" hidden></button>
          </div>
          <ol id="push-steps" class="push-steps" hidden></ol>

          <div class="set-row">
            <label class="switch" for="quiet-on">
              <input id="quiet-on" type="checkbox" ${quietOn ? "checked" : ""} />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="switch-text"><b>ساعات الهدوء</b><span class="sub">مفيش إشعارات في الوقت ده، إلا المشاكل العاجلة</span></span>
            </label>
          </div>
          <div class="grid-2 sub-fields" ${quietOn ? "" : "hidden"} id="quiet-fields">
            <div class="field"><label for="quiet-start">من</label><select id="quiet-start" class="input">${hours(me.quiet_start ?? 0)}</select></div>
            <div class="field"><label for="quiet-end">لحد</label><select id="quiet-end" class="input">${hours(me.quiet_end ?? 8)}</select></div>
          </div>

          <div class="set-row">
            <label class="switch" for="summary-on">
              <input id="summary-on" type="checkbox" ${summaryOn ? "checked" : ""} />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="switch-text"><b>ملخص يومي</b><span class="sub">كام مشكلة مفتوحة وعاجلة واتحلت، في الساعة اللي تختارها</span></span>
            </label>
          </div>
          <div class="sub-fields" ${summaryOn ? "" : "hidden"} id="summary-fields">
            <div class="field"><label for="summary-hour">الساعة</label><select id="summary-hour" class="input">${hours(me.summary_hour ?? 9)}</select></div>
          </div>
        </section>

        <section class="card set-card" aria-labelledby="set-account">
          <h2 id="set-account" class="card-title">الحساب</h2>
          <p class="sub">داخل بحساب جوجل <b dir="ltr">${esc(sessionUser()?.email || me.email || "")}</b>. تقدر تفضل داخل على أكتر من جهاز في نفس الوقت.</p>
          <button type="button" class="btn btn-secondary" data-action="signout">${icon("logout")} اخرج من الجهاز ده</button>
        </section>
      </section>`;
  }

  // ---------- الإحصائيات ----------
  const DAYS = 14;
  function statsData() {
    const now = Date.now();
    const within = (iso, days) => iso && now - new Date(iso) <= days * 86400e3;
    const open = issues.filter(isOpen);
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
      working: open.filter((i) => i.status === "in_progress").length,
      urgent: open.filter(isUrgent).length,
      late: open.filter(isLate).length,
      week: issues.filter((i) => within(i.created_at, 7)).length,
      prevWeek: issues.filter((i) => !within(i.created_at, 7) && within(i.created_at, 14)).length,
      solvedWeek: issues.filter((i) => i.status === "solved" && within(i.solved_at, 7)).length,
      recurring: issues.filter((i) => i.recur_count > 0).length,
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
          ${tile("مفتوحة دلوقتي", s.open, s.open ? `${s.working} بيتشتغل عليها · ${s.urgent} عاجلة · ${s.late} متأخرة` : "مفيش حاجة مفتوحة", s.late ? "warn" : "")}
          ${tile("اتسجلت آخر 7 أيام", s.week, `الأسبوع اللي قبله: ${s.prevWeek}`)}
          ${tile("اتحلت آخر 7 أيام", s.solvedWeek, s.recurring ? `${plural(s.recurring, WORDS.problem)} اتكررت قبل كده` : "من كل المشاكل")}
          ${tile("متوسط وقت الحل", s.avg ? esc(duration(s.avg)) : "—", s.avgCount ? `آخر 30 يوم · ${plural(s.avgCount, WORDS.problem)}` : "لسه مفيش مشاكل اتحلت")}
        </div>

        <section class="card chart-card" aria-labelledby="chart-title">
          <div class="chart-head">
            <h2 id="chart-title">آخر ${DAYS} يوم</h2>
            <div class="legend" aria-hidden="true"><span><i class="sw s1"></i>اتسجلت</span><span><i class="sw s2"></i>اتحلت</span></div>
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
    let bars = "", labels = "", hits = "";
    days.forEach((d, k) => {
      const cx = x0(k) + band / 2;
      const start = cx - (bw * 2 + 2) / 2;
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
    const statusText = (i) => ({ solved: "اتحلت", in_progress: "بيتشتغل عليها" }[i.status] || "متحلتش");
    const rows = [...issues].sort((a, b) => a.id - b.id).map((i) => ({
      "رقم": i.id,
      "اسم المشكلة": i.title,
      "الحالة": statusText(i),
      "الأهمية": isUrgent(i) ? "عاجلة" : "عادية",
      "مثبتة": i.pinned ? "أيوه" : "",
      "المسؤول": i.assignee || "",
      "الميعاد النهائي": i.due_at ? dateTime(i.due_at) : "",
      "الوصف": i.details || "",
      "ملاحظة": i.note || "",
      "سجّلها": i.author,
      "تاريخ التسجيل": dateTime(i.created_at),
      "حلّها": i.solved_by || "",
      "تاريخ الحل": i.solved_at ? dateTime(i.solved_at) : "",
      "مدة الحل": i.solved_at ? duration(new Date(i.solved_at) - new Date(i.created_at)) : "",
      "إزاي اتحلت": i.solution || "",
      "اتكررت": i.recur_count || 0,
      "مكررة من": i.duplicate_of ? `#${i.duplicate_of}` : "",
      "عدد الصور": imagesOf(i).length,
      "رسائل النقاش": commentsFor(i.id).length,
    }));
    const chat = comments.map((c) => ({
      "رقم المشكلة": c.problem_id,
      "المشكلة": findIssue(c.problem_id)?.title || "",
      "الاسم": c.author,
      "الرسالة": c.body || (c.attachments || []).map((a) => a.name).join("، "),
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
      X.utils.book_append_sheet(wb, sheet(rows, [6, 36, 14, 10, 8, 14, 26, 50, 30, 14, 30, 14, 30, 14, 40, 8, 10, 10, 12]), "المشاكل");
      X.utils.book_append_sheet(wb, sheet(chat, [10, 36, 14, 60, 30]), "النقاش");
      wb.Workbook = { Views: [{ RTL: true }] };
      const data = X.write(wb, { bookType: "xlsx", type: "array" });
      saveFile(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `team-problems-${stamp}.xlsx`);
      toast("اتنزل ملف Excel");
    } catch (e) {
      console.warn(e);
      const cols = Object.keys(rows[0] || { "رقم": "" });
      const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = "﻿" + [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
      saveFile(new Blob([csv], { type: "text/csv;charset=utf-8" }), `team-problems-${stamp}.csv`);
      toast("اتنزل ملف CSV (بيتفتح في Excel)");
    }
  }

  // ============ عرض الصفحة الحالية ============
  function renderView(force = false) {
    const view = $("view");
    if (!force && typingIn(view)) { viewPending = true; return; }
    viewPending = false;
    renderTop();
    view.classList.toggle("wide", ["team", "stats"].includes(route.view));
    view.classList.toggle("narrow", route.view === "settings");
    if (route.view === "new") {
      view.innerHTML = composeHtml();
      renderDraftThumbs();
    } else if (route.view === "team") {
      view.innerHTML = teamHtml();
    } else if (route.view === "stats") {
      view.innerHTML = statsHtml();
      drawChart();
    } else if (route.view === "settings") {
      view.innerHTML = settingsHtml();
      updatePushUI();
    } else if (!loaded) {
      view.innerHTML = `<div class="view-loading">${'<div class="sk"></div>'.repeat(4)}</div>`;
    } else {
      const i = findIssue(route.id);
      const old = $("chat-list");
      const keep = old && old.dataset.pid === String(route.id) && !nearBottom(old) ? old.scrollTop : null;
      view.innerHTML = i ? detailHtml(i) : notFoundHtml();
      if (i) {
        renderViewers();
        const list = $("chat-list");
        if (list) list.scrollTop = keep ?? list.scrollHeight;
        const input = $("chat-input");
        if (input) autoGrow(input);
        const card = aiCache[i.id];
        if (card && detailTab === "chat") showAiCard(i.id);
        if (detailTab === "history" && !eventsCache[i.id]) loadHistory(i.id);
        maybeMarkRead();
      }
    }
  }

  // ============ التنقل ============
  function go(r) {
    if (r.view !== "issue" || r.id !== route.id) {
      editingId = null;
      detailTab = "chat";
      if (rec) stopRecording(false);
    }
    route = r;
    try { history.replaceState(null, "", hashOf(r)); } catch {}
    renderTabs();
    renderList();
    renderView(true);
    $("main").scrollTop = 0;
    closeSidebar();
    trackPresence();
  }

  function openSidebar() { $("sidebar").classList.add("open"); $("scrim").hidden = false; }
  function closeSidebar() { $("sidebar").classList.remove("open"); $("scrim").hidden = true; }

  // ============ تحميل البيانات ============
  async function reloadProblems() {
    issues = await store.listProblems();
    loaded = true;
    renderTabs();
    renderList();
  }

  const soft = async (fn, fallback) => { try { return await fn(); } catch (e) { console.warn(e); return fallback; } };

  async function reloadComments() {
    comments = await soft(store.listComments, comments);
    renderChat();
    renderList();
    renderTabs();
    maybeMarkRead();
  }
  async function reloadRoster() {
    const [r, s] = await Promise.all([soft(store.roster, roster), soft(store.settings, settings)]);
    roster = r || [];
    if (s) settings = s;
    renderTabs();
    if (route.view === "team") renderView();
  }
  async function reloadReactions() { reactions = await soft(store.listReactions, reactions); renderChat(); }
  async function reloadReads() { reads = await soft(store.listReads, reads); renderChat(); renderList(); renderTabs(); }
  async function reloadLinks() { links = await soft(store.listLinks, links); if (route.view === "issue") renderView(); }
  async function reloadReminders() { myReminders = await soft(store.listReminders, myReminders); if (route.view === "issue") renderView(); }

  async function loadAll() {
    await reloadProblems();
    await Promise.all([reloadComments(), reloadRoster(), reloadReactions(), reloadReads(), reloadLinks(), reloadReminders()]);
    renderView();
  }

  let problemsTimer;
  function onProblemsChange() {
    clearTimeout(problemsTimer);
    problemsTimer = setTimeout(async () => {
      try {
        await reloadProblems();
        if (route.view !== "new") renderView();
        if (route.view === "issue" && detailTab === "history") loadHistory(route.id);
      } catch (e) {
        console.error(e);
      }
    }, 80);
  }

  // ============ الأفعال ============
  function flagError(inputId, errorId, show) {
    $(inputId).setAttribute("aria-invalid", String(show));
    $(errorId).hidden = !show;
  }

  async function run(fn, okMsg, errPrefix = "مقدرتش أكمّل") {
    try {
      await fn();
      if (okMsg) toast(okMsg);
      return true;
    } catch (err) {
      console.error(err);
      toast(`${errPrefix}: ${friendlyError(err)}`);
      return false;
    }
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
    flagError("title", "title-error", !title);
    if (!title) return $("title").focus();

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
        author: myName(),
        details: $("details").value.trim() || null,
        note: $("note").value.trim() || null,
      };
      if (uploaded.length) row.images = uploaded;
      if ($("urgent").checked) row.priority = "urgent";
      if ($("assignee").value.trim()) row.assignee = $("assignee").value.trim();
      if ($("due").value) row.due_at = fromLocalInput($("due").value);
      const created = await store.addProblem(row);
      clearDraftImages();
      Object.assign(draft, { title: "", details: "", note: "", assignee: "", due: "", urgent: false, more: false });
      if (tab === "solved") { tab = "open"; local.set(TAB_KEY, tab); }
      await reloadProblems();
      go({ view: "issue", id: created.id });
      toast(`اتسجلت المشكلة #${created.id}`);
    } catch (err) {
      console.error(err);
      store.removeFiles(BUCKET, uploaded);
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
      for (const file of list.slice(0, room)) uploaded.push(await store.uploadImage(await prepareImage(file)));
      await reloadProblems();
      const latest = imagesOf(findIssue(id));
      await store.updateProblem(id, { images: [...latest, ...uploaded].slice(0, MAX_IMAGES) });
      await reloadProblems();
      toast(`اتضافت ${plural(uploaded.length, WORDS.image)}`);
    } catch (err) {
      console.error(err);
      store.removeFiles(BUCKET, uploaded);
      toast("مقدرتش أضيف الصور: " + friendlyError(err));
    } finally {
      uploadingIssue = null;
      if (route.view === "issue" && route.id === id) renderView();
    }
  }

  async function updateIssue(patch, okMsg) {
    const id = route.id;
    const ok = await run(() => store.updateProblem(id, patch), okMsg, "مقدرتش أحدّث المشكلة");
    await reloadProblems();
    renderView(true);
    return ok;
  }

  async function resolveIssue(form) {
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    const ok = await updateIssue({
      status: "solved", solved_at: new Date().toISOString(), solved_by: myName(),
      solution: $("how").value.trim() || null,
    }, "اتقفلت المشكلة واتنقلت لقسم «اتحلت»");
    if (!ok && btn.isConnected) btn.disabled = false;
  }

  async function saveEdit() {
    const i = findIssue(route.id);
    if (!i) return;
    const title = $("edit-title").value.trim();
    flagError("edit-title", "edit-title-error", !title);
    if (!title) return $("edit-title").focus();
    editingId = null;
    document.activeElement?.blur();
    await updateIssue({
      title, details: $("edit-details").value.trim() || null, note: $("edit-note").value.trim() || null,
      edited_at: new Date().toISOString(),
    }, "اتحفظ التعديل");
  }

  async function changeField(field, raw) {
    const i = findIssue(route.id);
    if (!i) return;
    let value = raw;
    if (field === "assignee") {
      value = raw.trim() || null;
      if (same(value, i.assignee) || (!value && !i.assignee)) return;
    }
    if (field === "priority" && value === priorityOf(i)) return;
    if (field === "due_at") {
      value = fromLocalInput(raw);
      if ((value || null) === (i.due_at ? new Date(i.due_at).toISOString() : null)) return;
    }
    let msg = "";
    if (field === "assignee") {
      const m = memberByName(value);
      msg = !value ? "اتشالت المسؤولية"
        : same(value, myName()) ? "بقيت إنت المسؤول عنها"
        : m && m.availability === "away" ? `بقى ${value} المسؤول عنها · خلي بالك: ${value} في إجازة`
        : `بقى ${value} المسؤول عنها`;
    } else if (field === "priority") msg = value === "urgent" ? "بقت عاجلة" : "بقت عادية";
    else if (field === "due_at") msg = value ? `الميعاد النهائي: ${dateShortTime(value)}` : "اتشال الميعاد النهائي";
    await updateIssue({ [field]: value }, msg);
  }

  async function deleteIssue() {
    const i = findIssue(route.id);
    if (!i) return;
    if (!confirm(`تمسح المشكلة "${i.title}" نهائيًا؟ النقاش والصور بتوعها هيتمسحوا كمان، ومفيش رجوع بعد كده.`)) return;
    const chatPaths = commentsFor(i.id).flatMap((c) => (c.attachments || []).map((a) => a.path));
    const ok = await run(() => store.removeProblem(i.id), "اتمسحت المشكلة", "مقدرتش أمسح المشكلة");
    if (!ok) return;
    store.removeFiles(BUCKET, imagesOf(i));
    store.removeFiles(CHAT_BUCKET, chatPaths);
    await reloadProblems();
    comments = comments.filter((c) => c.problem_id !== i.id);
    const next = issues.find(isOpen) || issues[0];
    go(next ? { view: "issue", id: next.id } : { view: "new" });
  }

  function copyLink() {
    const url = location.href.split("#")[0] + "#p" + route.id;
    const onFail = () => toast("مقدرتش أنسخ اللينك. اللينك: " + url);
    try { navigator.clipboard.writeText(url).then(() => toast("اتنسخ لينك المشكلة"), onFail); } catch { onFail(); }
  }

  function showAssigned(name) {
    assigneeFilter = name;
    tab = "open";
    local.set(TAB_KEY, tab);
    renderTabs();
    renderList();
    if (window.matchMedia("(max-width: 860px)").matches) openSidebar();
    const n = issues.filter((i) => isOpen(i) && same(i.assignee, name)).length;
    toast(n ? `${same(name, myName()) ? "إنت مسؤول" : `${name} مسؤول`} عن ${plural(n, WORDS.problem)} مفتوحة` : "مفيش مشاكل مفتوحة متعيّنة ليه");
  }

  // ---------- النقاش: إرسال ومرفقات ----------
  async function addChatFiles(files) {
    const pid = route.id;
    const list = (chatFiles[pid] ||= []);
    for (const f of files) {
      if (list.length >= MAX_CHAT_FILES) { toast(`أقصى حاجة ${MAX_CHAT_FILES} ملفات في الرسالة.`); break; }
      try {
        if (/^image\//.test(f.type) && f.type !== "image/gif") {
          const p = await prepareImage(f);
          const base = (f.name || "صورة").replace(/\.[^.]+$/, "");
          list.push({ key: uid(), kind: "image", blob: p.blob, name: `${base}.${p.ext}`, type: p.blob.type || "image/jpeg", size: p.blob.size, url: URL.createObjectURL(p.blob) });
        } else {
          if (f.size > MAX_FILE) { toast(`«${f.name}» أكبر من 10 ميجا.`); continue; }
          const kind = /^image\//.test(f.type) ? "image" : /^audio\//.test(f.type) ? "audio" : "file";
          list.push({ key: uid(), kind, blob: f, name: f.name || "ملف", type: f.type || "application/octet-stream", size: f.size, url: URL.createObjectURL(f) });
        }
      } catch (e) {
        toast(friendlyError(e));
      }
    }
    renderChatPending();
  }

  function removePending(key) {
    const list = chatFiles[route.id] || [];
    const f = list.find((x) => x.key === key);
    if (f) URL.revokeObjectURL(f.url);
    chatFiles[route.id] = list.filter((x) => x.key !== key);
    renderChatPending();
  }

  async function sendComment(voice = null) {
    const pid = route.id;
    const input = $("chat-input");
    const text = voice ? "" : (input?.value || "").trim();
    const files = voice ? [voice] : [...(chatFiles[pid] || [])];
    if (!text && !files.length) return;
    if (!voice) {
      input.value = "";
      chatDrafts[pid] = "";
      chatFiles[pid] = [];
      autoGrow(input);
      renderChatPending();
      closeMentionPop();
    }
    const temp = {
      id: "tmp-" + uid(), problem_id: pid, author: myName(), created_by: me.user_id, body: text,
      attachments: files.map((f) => ({ kind: f.kind, name: f.name, size: f.size, url: f.url, duration: f.duration })),
      created_at: new Date().toISOString(), pending: true,
    };
    comments.push(temp);
    renderChat(true);
    const uploaded = [];
    try {
      for (const f of files) uploaded.push(await store.uploadChatFile(f));
      await store.addComment({ problem_id: pid, author: myName(), body: text, attachments: uploaded });
      comments = comments.filter((c) => c !== temp);
      await reloadComments();
      renderChat(true);
    } catch (err) {
      console.error(err);
      comments = comments.filter((c) => c !== temp);
      store.removeFiles(CHAT_BUCKET, uploaded.map((a) => a.path));
      renderChat();
      if (!voice && route.id === pid) {
        const box = $("chat-input");
        if (box && !box.value) box.value = text;
        chatFiles[pid] = [...files, ...(chatFiles[pid] || [])];
        renderChatPending();
      }
      toast("مقدرتش أبعت الرسالة: " + friendlyError(err));
    }
  }

  // ---------- رسالة صوتية ----------
  async function startRecording() {
    if (rec) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("الجهاز ده مبيدعمش تسجيل الصوت.");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast("لازم توافق على استخدام المايك عشان تسجّل رسالة صوتية.");
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec = { mr, chunks, stream, start: Date.now(), pid: route.id, send: false };
    mr.start(250);
    $("rec-bar").hidden = false;
    $("chat-form").hidden = true;
    rec.timer = setInterval(() => {
      const sec = (Date.now() - rec.start) / 1000;
      if ($("rec-time")) $("rec-time").textContent = clock(sec);
      if (sec >= MAX_VOICE_SEC) stopRecording(true);
    }, 250);
  }

  function stopRecording(send) {
    if (!rec) return;
    const r = rec;
    rec = null;
    clearInterval(r.timer);
    r.mr.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop());
      if ($("rec-bar")) $("rec-bar").hidden = true;
      if ($("chat-form")) $("chat-form").hidden = false;
      const secs = (Date.now() - r.start) / 1000;
      if (!send || secs < 0.8 || !r.chunks.length || route.id !== r.pid) return;
      const type = (r.mr.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(r.chunks, { type });
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      sendComment({ key: uid(), kind: "audio", blob, name: `رسالة-صوتية.${ext}`, type, size: blob.size, url: URL.createObjectURL(blob), duration: secs });
    };
    try { r.mr.stop(); } catch { r.mr.onstop(); }
    if (viewPending) setTimeout(() => renderView(), 50);
  }

  // ---------- الردود السريعة ----------
  function toggleReactPicker(cid, forceOpen = false) {
    document.querySelectorAll(".react-pick").forEach((p) => { if (Number(p.dataset.cid) !== cid || !forceOpen) p.remove(); });
    const wrap = document.querySelector(`.msg[data-cid="${cid}"] .react-add-wrap`);
    if (!wrap || (!forceOpen && wrap.querySelector(".react-pick"))) return;
    if (wrap.querySelector(".react-pick")) return;
    wrap.insertAdjacentHTML("beforeend", `<div class="react-pick" data-cid="${cid}" role="menu">${EMOJIS.map((e) =>
      `<button type="button" role="menuitem" data-action="react" data-cid="${cid}" data-emoji="${e}">${e}</button>`).join("")}</div>`);
  }

  async function toggleReaction(cid, emoji) {
    document.querySelectorAll(".react-pick").forEach((p) => p.remove());
    const mine = reactions.find((r) => r.comment_id === cid && r.emoji === emoji && r.user_id === me.user_id);
    if (mine) reactions = reactions.filter((r) => r !== mine);
    else reactions.push({ comment_id: cid, user_id: me.user_id, member: myName(), emoji });
    renderChat();
    try {
      if (mine) await store.removeReaction(cid, emoji);
      else await store.addReaction(cid, emoji);
    } catch (err) {
      console.error(err);
      toast("مقدرتش أسجّل الرد: " + friendlyError(err));
    }
    reloadReactions();
  }

  // ---------- المنشن @ ----------
  let mentionState = null; // { start, items, index }
  function updateMentionPop() {
    const input = $("chat-input");
    const pop = $("mention-pop");
    if (!input || !pop) return;
    const before = input.value.slice(0, input.selectionStart);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    if (!m) return closeMentionPop();
    const q = m[2].toLowerCase();
    const items = activeRoster()
      .map((r) => r.display_name)
      .filter((n) => !same(n, myName()) && n.toLowerCase().includes(q))
      .slice(0, 6);
    if (!items.length) return closeMentionPop();
    mentionState = { start: before.length - m[2].length - 1, end: input.selectionStart, items, index: 0 };
    renderMentionPop();
  }
  function renderMentionPop() {
    const pop = $("mention-pop");
    if (!pop || !mentionState) return;
    pop.hidden = false;
    pop.innerHTML = mentionState.items.map((n, k) => `
      <button type="button" role="option" class="mention-opt${k === mentionState.index ? " on" : ""}" aria-selected="${k === mentionState.index}"
        data-action="mention-pick" data-name="${esc(n)}">${avatar(n, "sm")}<span>${esc(n)}</span></button>`).join("");
  }
  function closeMentionPop() {
    mentionState = null;
    const pop = $("mention-pop");
    if (pop) { pop.hidden = true; pop.innerHTML = ""; }
  }
  function pickMention(name) {
    const input = $("chat-input");
    if (!input || !mentionState) return;
    const v = input.value;
    const insert = `@${name} `;
    input.value = v.slice(0, mentionState.start) + insert + v.slice(mentionState.end);
    const pos = mentionState.start + insert.length;
    closeMentionPop();
    input.focus();
    input.setSelectionRange(pos, pos);
    chatDrafts[route.id] = input.value;
    updateSendMode();
  }

  // ---------- تلخيص النقاش ----------
  function showAiCard(pid) {
    const el = $("ai-card");
    const c = aiCache[pid];
    if (!el || !c) return;
    el.hidden = false;
    el.innerHTML = c.loading
      ? `<div class="ai-head">${icon("sparkle")}<b>ملخص النقاش</b></div><p class="muted">بيلخّص…</p>`
      : c.error
        ? `<div class="ai-head">${icon("sparkle")}<b>ملخص النقاش</b><button type="button" class="icon-btn" data-action="ai-close" aria-label="اقفل">${icon("x")}</button></div><p class="ai-error">${esc(c.error)}</p>`
        : `<div class="ai-head">${icon("sparkle")}<b>ملخص النقاش</b><span class="sub">بالذكاء الاصطناعي · ممكن يغلط</span>
             <button type="button" class="icon-btn" data-action="ai-close" aria-label="اقفل">${icon("x")}</button></div>
           <ul class="ai-points">${c.text.split("\n").map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim()).filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
           ${c.count !== commentsFor(pid).length ? `<button type="button" class="link-btn" data-action="summarize">فيه رسايل جديدة، لخّص تاني</button>` : ""}`;
  }

  async function summarize() {
    const pid = route.id;
    aiCache[pid] = { loading: true };
    showAiCard(pid);
    try {
      const { data } = await db.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch(`${cfg.SUPABASE_URL}/functions/v1/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "summarize", problem_id: pid }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.summary) {
        const why = {
          no_key: "خاصية التلخيص محتاجة مفتاح Gemini يتحط في Supabase الأول.",
          empty: "مفيش رسايل كفاية تتلخص.",
          not_member: "إنت مش ضمن الفريق دلوقتي.",
          gemini: "Gemini مردّش. جرّب تاني بعد شوية.",
        }[out.error] || "مقدرتش ألخّص دلوقتي. جرّب تاني بعد شوية.";
        aiCache[pid] = { error: why };
      } else {
        aiCache[pid] = { text: out.summary, count: commentsFor(pid).length };
      }
    } catch (e) {
      console.error(e);
      aiCache[pid] = { error: "مقدرتش أوصل لخدمة التلخيص. اتأكد من النت." };
    }
    if (route.id === pid) showAiCard(pid);
  }

  // ---------- نافذة الحوارات ----------
  let modalHandler = null;
  function openModal(html, handler) {
    modalHandler = handler;
    $("modal-body").innerHTML = html;
    const d = $("modal");
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
  }
  function closeModal() {
    const d = $("modal");
    if (d.open) d.close();
    modalHandler = null;
  }

  function openWelcome(step = 1) {
    if (step === 1) {
      openModal(`
        <h2>أهلًا بيك في الفريق 👋</h2>
        <p>ده الاسم اللي هيظهر للفريق جنب المشاكل والرسايل. تقدر تغيّره بعدين من «حسابي».</p>
        <div class="field">
          <label for="welcome-name">اسمك</label>
          <input id="welcome-name" class="input input-lg" type="text" maxlength="60" value="${esc(myName())}" />
          <p class="field-error" id="welcome-error" hidden></p>
        </div>
        <div class="dialog-actions"><button type="button" class="btn btn-primary btn-lg" data-modal="next">كمّل</button></div>`,
        async (a) => {
          if (a !== "next") return;
          const n = $("welcome-name").value.trim();
          if (!n) { $("welcome-error").hidden = false; $("welcome-error").textContent = "اكتب اسمك."; return; }
          if (n !== myName()) {
            try { await saveMe({ display_name: n }); } catch (e) {
              $("welcome-error").hidden = false;
              $("welcome-error").textContent = friendlyError(e);
              return;
            }
          }
          openWelcome(2);
        });
      setTimeout(() => $("welcome-name")?.focus(), 50);
      return;
    }
    openModal(`
      <h2>3 حاجات تعرفها</h2>
      <ol class="tips">
        <li><b>مشكلة جديدة</b> من الزرار اللي فوق القايمة. اسمك والوقت بيتسجلوا لوحدهم.</li>
        <li>زرار <b>مشاكلي</b> بيوريك المشاكل اللي إنت مسؤول عنها بس.</li>
        <li>جوه كل مشكلة فيه <b>نقاش</b> زي الشات. اكتب @ واسم حد عشان يوصله إشعار.</li>
      </ol>
      <p>عشان يوصلك جديد الفريق على موبايلك حتى لو الموقع مقفول، فعّل الإشعارات.</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-modal="close">بعدين</button>
        <button type="button" class="btn btn-primary" data-modal="push">${icon("bell")} فعّل الإشعارات</button>
      </div>`,
      async (a) => {
        closeModal();
        if (a === "push") go({ view: "settings" });
      });
  }

  function openRemind() {
    const i = findIssue(route.id);
    if (!i) return;
    const mine = myReminders.filter((r) => r.problem_id === i.id).sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at));
    const tomorrow9 = new Date();
    tomorrow9.setDate(tomorrow9.getDate() + 1);
    tomorrow9.setHours(9, 0, 0, 0);
    openModal(`
      <h2>${icon("alarm")} فكّرني بالمشكلة دي</h2>
      <p>هيوصلك إشعار على أجهزتك في الوقت اللي تختاره.</p>
      <p class="modal-warn" id="remind-push-warn" hidden>الإشعارات مش متفعّلة على الجهاز ده، فالتذكير مش هيوصله. <button type="button" class="link-btn" data-modal="settings">فعّلها من حسابي</button></p>
      <div class="choice-grid">
        <button type="button" class="choice" data-modal="in" data-min="60">بعد ساعة</button>
        <button type="button" class="choice" data-modal="in" data-min="180">بعد 3 ساعات</button>
        <button type="button" class="choice" data-modal="at" data-at="${tomorrow9.toISOString()}">بكرة الساعة 9 الصبح</button>
      </div>
      <div class="field">
        <label for="remind-at">أو اختار ميعاد</label>
        <div class="inline">
          <input id="remind-at" class="input" type="datetime-local" />
          <button type="button" class="btn btn-secondary" data-modal="custom">حدّد</button>
        </div>
      </div>
      ${mine.length ? `<div class="modal-list"><h3>تذكيراتك للمشكلة دي</h3><ul>${mine.map((r) => `
        <li>${icon("alarm")}<span>${esc(dateShortTime(r.remind_at))}</span>
          <button type="button" class="link-btn danger-link" data-modal="cancel" data-id="${r.id}">إلغاء</button></li>`).join("")}</ul></div>` : ""}
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-modal="close">اقفل</button></div>`,
      async (a, btn) => {
        if (a === "close") return closeModal();
        if (a === "settings") { closeModal(); return go({ view: "settings" }); }
        let at = null;
        if (a === "in") at = new Date(Date.now() + Number(btn.dataset.min) * 60e3).toISOString();
        if (a === "at") at = btn.dataset.at;
        if (a === "custom") {
          const v = $("remind-at").value;
          if (!v || new Date(v) <= new Date()) return toast("اختار ميعاد جاي، مش فات.");
          at = fromLocalInput(v);
        }
        if (a === "cancel") {
          await run(() => store.removeReminder(Number(btn.dataset.id)), "اتلغى التذكير");
          await reloadReminders();
          return openRemind();
        }
        if (!at) return;
        const ok = await run(() => store.addReminder(i.id, at), `هفكّرك ${dateShortTime(at)}`);
        if (ok) { closeModal(); await reloadReminders(); }
      });
    pushStatus().then((st) => { const w = $("remind-push-warn"); if (w) w.hidden = st === "on"; });
  }

  function openLink() {
    const i = findIssue(route.id);
    if (!i) return;
    const linked = new Set(links.filter((l) => l.a === i.id || l.b === i.id).map((l) => (l.a === i.id ? l.b : l.a)));
    const results = (q) => {
      const s = q.trim().toLowerCase().replace("#", "");
      return issues
        .filter((x) => x.id !== i.id && !linked.has(x.id) && x.id !== i.duplicate_of)
        .filter((x) => !s || String(x.id) === s || x.title.toLowerCase().includes(s))
        .slice(0, 8)
        .map((x) => `
          <li class="link-row">
            <span class="dot${x.status === "solved" ? " solved" : x.status === "in_progress" ? " working" : ""}"></span>
            <span class="ref">#${x.id}</span><span class="link-title">${esc(x.title)}</span>
            <span class="link-btns">
              <button type="button" class="btn btn-secondary btn-sm" data-modal="relate" data-id="${x.id}">مرتبطة</button>
              <button type="button" class="btn btn-ghost btn-sm" data-modal="dup" data-id="${x.id}" title="المشكلة دي نسخة من التانية">دي نفسها</button>
            </span>
          </li>`).join("") || `<li class="none">مفيش مشاكل تانية مطابقة.</li>`;
    };
    openModal(`
      <h2>${icon("link")} اربط بمشكلة تانية</h2>
      <p>اختار <b>مرتبطة</b> لو ليها علاقة بالمشكلة دي، أو <b>دي نفسها</b> لو دي نفس المشكلة واتسجلت مرتين.</p>
      <input id="link-search" class="input" type="search" placeholder="دوّر باسم المشكلة أو رقمها" autocomplete="off" />
      <ul id="link-results" class="link-results">${results("")}</ul>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-modal="close">اقفل</button></div>`,
      async (a, btn) => {
        if (a === "close") return closeModal();
        const other = Number(btn.dataset.id);
        if (a === "relate") {
          const ok = await run(() => store.addLink(i.id, other), `اتربطت بـ #${other}`);
          if (ok) { closeModal(); await reloadLinks(); }
        }
        if (a === "dup") {
          closeModal();
          await updateIssue({ duplicate_of: other }, `اتعلّمت مكررة من #${other}`);
        }
      });
    const search = $("link-search");
    search.addEventListener("input", () => { $("link-results").innerHTML = results(search.value); });
    setTimeout(() => search.focus(), 50);
  }

  // ---------- الأدمن ----------
  async function adminLimit(delta) {
    const n = Math.max(1, settings.member_limit + delta);
    settings.member_limit = n;
    renderView();
    await run(() => store.adminSetLimit(n), `العدد المسموح بقى ${n}`, "مقدرتش أغيّر العدد");
    await reloadRoster();
  }

  async function adminRemove(uidToRemove, name) {
    if (!confirm(`تشيل ${name} من الفريق؟ مش هيقدر يدخل الموقع لحد ما ترجّعه.`)) return;
    await run(() => store.adminSetRemoved(uidToRemove, true), `اتشال ${name} من الفريق`);
    await reloadRoster();
  }

  // ---------- حسابي ----------
  async function saveMe(patch) {
    const row = await store.updateMe(patch);
    me = { ...me, ...row };
    renderMe();
    trackPresence();
    if ("display_name" in patch) {
      await Promise.all([reloadProblems(), reloadComments(), reloadRoster()]);
      resyncPush();
    }
  }

  async function saveSetting(patch, msg) {
    try {
      await saveMe(patch);
      if (msg) toast(msg);
    } catch (err) {
      console.error(err);
      toast("مقدرتش أحفظ: " + friendlyError(err));
    }
    if (route.view === "settings") renderView(true);
  }

  function saveQuiet() {
    const on = $("quiet-on").checked;
    saveSetting(on
      ? { quiet_start: Number($("quiet-start").value), quiet_end: Number($("quiet-end").value) }
      : { quiet_start: null, quiet_end: null },
    on ? `ساعات الهدوء: من ${hourLabel(Number($("quiet-start").value))} لحد ${hourLabel(Number($("quiet-end").value))}` : "اتلغت ساعات الهدوء");
  }

  function saveSummary() {
    const on = $("summary-on").checked;
    saveSetting({ summary_hour: on ? Number($("summary-hour").value) : null },
      on ? `الملخص اليومي هيوصلك الساعة ${hourLabel(Number($("summary-hour").value))}` : "اتلغى الملخص اليومي");
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
    try { swReg = await navigator.serviceWorker.register("sw.js"); } catch (e) { console.warn(e); }
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "open") go(parseHash(e.data.hash));
    });
    resyncPush();
    nudgePush();
  }

  async function currentSub() {
    if (!("serviceWorker" in navigator)) return null;
    const reg = swReg || (await navigator.serviceWorker.getRegistration());
    return reg ? reg.pushManager?.getSubscription() : null;
  }

  async function pushStatus() {
    if (!PUSH_KEY) return "unavailable";
    if (isIOS && !isStandalone()) return "ios-install";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    return (await currentSub().catch(() => null)) ? "on" : "off";
  }

  const PUSH_TEXT = {
    unavailable: "الإشعارات لسه مش متظبطة في إعدادات الموقع.",
    "ios-install": "على الآيفون، الإشعارات بتشتغل بس لما الموقع يبقى على الشاشة الرئيسية زي التطبيق:",
    unsupported: "المتصفح ده مبيدعمش الإشعارات. جرّب Chrome على أندرويد أو الكمبيوتر، أو Safari على الآيفون بعد ما تضيف الموقع للشاشة الرئيسية.",
    denied: "الإشعارات مقفولة للموقع ده من إعدادات المتصفح. افتحها من علامة القفل جنب اللينك ← الإشعارات ← سماح، وبعدين ارجع هنا.",
    off: "مقفولة. فعّلها عشان يوصلك جديد الفريق حتى لو الموقع مقفول.",
    on: "شغالة على الجهاز ده. كل جهاز بيتفعّل لوحده.",
  };
  const IOS_STEPS = [
    "افتح الموقع في Safari.",
    "دوس زرار المشاركة (المربع اللي طالع منه سهم).",
    "اختار «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).",
    "افتح الموقع من الأيقونة الجديدة، وارجع لـ «حسابي» وفعّل الإشعارات.",
  ];

  async function updatePushUI() {
    const st = await pushStatus();
    const desc = $("push-desc");
    if (!desc) return;
    desc.textContent = PUSH_TEXT[st];
    $("push-steps").hidden = st !== "ios-install";
    $("push-steps").innerHTML = IOS_STEPS.map((s) => `<li>${esc(s)}</li>`).join("");
    const btn = $("push-action");
    btn.hidden = !(st === "off" || st === "on");
    btn.textContent = st === "on" ? "وقّفها" : "فعّل الإشعارات";
    btn.className = st === "on" ? "btn btn-secondary" : "btn btn-primary";
    btn.dataset.state = st;
  }

  async function savePushSub(sub) {
    const j = sub.toJSON();
    await must(db.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }));
  }

  async function resyncPush() {
    try {
      const sub = await currentSub();
      if (sub) await savePushSub(sub);
    } catch (e) {
      console.warn(e);
    }
  }

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast("لازم توافق على الإشعارات من المتصفح عشان توصلك.");
        return updatePushUI();
      }
      const reg = swReg || (await navigator.serviceWorker.ready);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(PUSH_KEY) });
      await savePushSub(sub);
      local.set(NUDGE_KEY, "done");
      notice("");
      toast("اتفعّلت الإشعارات على الجهاز ده");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أفعّل الإشعارات: " + friendlyError(err));
    }
    updatePushUI();
  }

  async function disablePush({ quiet = false } = {}) {
    const sub = await currentSub().catch(() => null);
    if (sub) {
      try { await db.rpc("delete_push_subscription", { p_endpoint: sub.endpoint }); } catch (e) { console.warn(e); }
      await sub.unsubscribe().catch(() => {});
    }
    if (!quiet) { toast("وقفت الإشعارات على الجهاز ده"); updatePushUI(); }
  }

  async function nudgePush() {
    if (local.get(NUDGE_KEY)) return;
    const st = await pushStatus();
    if (st !== "off" && st !== "ios-install") return;
    notice("فعّل الإشعارات عشان يوصلك جديد الفريق على الجهاز ده حتى لو الموقع مقفول.", {
      action: "فعّلها",
      onAction: () => go({ view: "settings" }),
      onClose: () => local.set(NUDGE_KEY, "dismissed"),
    });
  }

  // ============ عارض الصور ============
  const lb = { srcs: [], refs: [], index: 0, issueId: null, deletable: false };

  function openLightbox({ srcs, refs = [], index = 0, issueId = null, deletable = false }) {
    Object.assign(lb, { srcs, refs, index, issueId, deletable });
    $("lightbox").hidden = false;
    document.body.classList.add("no-scroll");
    showLightbox();
    $("lb-close").focus();
  }

  function showLightbox() {
    const n = lb.srcs.length;
    if (!n) return closeLightbox();
    lb.index = ((lb.index % n) + n) % n;
    const src = lb.srcs[lb.index];
    $("lb-img").src = src;
    $("lb-img").alt = `صورة ${lb.index + 1} من ${n}`;
    $("lb-count").textContent = `صورة ${lb.index + 1} من ${n}`;
    $("lb-open").hidden = src.startsWith("data:") || src.startsWith("blob:");
    $("lb-open").href = src;
    $("lb-delete").hidden = !lb.deletable;
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
      await reloadProblems();
      const next = imagesOf(findIssue(lb.issueId)).filter((r) => r !== ref);
      await store.updateProblem(lb.issueId, { images: next });
      store.removeFiles(BUCKET, [ref]);
      await reloadProblems();
      lb.refs = next;
      lb.srcs = next.map(imageUrl);
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
  function handleFiles(files, target) {
    const list = [...(files || [])];
    if (!list.length) return;
    if (target === "chat") return addChatFiles(list);
    const images = list.filter((f) => /^image\//.test(f.type));
    if (!images.length) return toast("الملف ده مش صورة.");
    if (route.view === "new") addDraftImages(images);
    else if (route.view === "issue" && findIssue(route.id)) addImagesToIssue(images);
  }

  function bindEvents() {
    $("new-btn").addEventListener("click", () => { go({ view: "new" }); $("title")?.focus(); });
    document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => go({ view: b.dataset.nav })));

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
      assigneeFilter = assigneeFilter && same(assigneeFilter, myName()) ? null : myName();
      if (assigneeFilter) { tab = "open"; local.set(TAB_KEY, tab); }
      renderTabs();
      renderList();
    });
    $("filter-chip").addEventListener("click", () => { assigneeFilter = null; renderTabs(); renderList(); });
    $("search").addEventListener("input", renderList);

    const view = $("view");
    view.addEventListener("input", (e) => {
      const t = e.target;
      const id = t.id;
      if (["title", "details", "note", "assignee", "due"].includes(id)) draft[id] = t.value;
      if (id === "title" && t.value.trim()) flagError("title", "title-error", false);
      if (id === "edit-title" && t.value.trim()) flagError("edit-title", "edit-title-error", false);
      if (id === "chat-input") {
        chatDrafts[route.id] = t.value;
        autoGrow(t);
        updateSendMode();
        updateMentionPop();
      }
    });

    view.addEventListener("toggle", (e) => {
      if (e.target.id === "more") draft.more = e.target.open;
      // القايمة الصغيرة تفتح في الناحية اللي فيها مكان
      if (e.target.classList.contains("menu") && e.target.open) {
        e.target.classList.remove("flip");
        const r = e.target.querySelector(".menu-list").getBoundingClientRect();
        if (r.right > window.innerWidth - 8 || r.left < 8) e.target.classList.add("flip");
      }
    }, true);

    view.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "urgent") draft.urgent = t.checked;
      if (t.classList.contains("prop-input") || t.classList.contains("prop-select")) changeField(t.dataset.field, t.value);
      if (t.id === "set-note") saveSetting({ status_note: t.value.trim() || null }, "اتحفظت رسالتك للفريق");
      if (t.id === "quiet-on") { $("quiet-fields").hidden = !t.checked; saveQuiet(); }
      if (t.id === "quiet-start" || t.id === "quiet-end") saveQuiet();
      if (t.id === "summary-on") { $("summary-fields").hidden = !t.checked; saveSummary(); }
      if (t.id === "summary-hour") saveSummary();
    });

    view.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t.classList?.contains("prop-input") && e.key === "Enter") { e.preventDefault(); t.blur(); }
      if (t.id === "set-name" && e.key === "Enter") { e.preventDefault(); view.querySelector('[data-action="save-name"]')?.click(); }
      if (t.id === "chat-input") {
        if (mentionState) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            mentionState.index = (mentionState.index + (e.key === "ArrowDown" ? 1 : -1) + mentionState.items.length) % mentionState.items.length;
            return renderMentionPop();
          }
          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return pickMention(mentionState.items[mentionState.index]); }
          if (e.key === "Escape") { e.preventDefault(); return closeMentionPop(); }
        }
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendComment(); }
      }
    });

    view.addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.target.id === "issue-form") createIssue();
      if (e.target.id === "resolve-form") resolveIssue(e.target);
      if (e.target.id === "edit-form") saveEdit();
      if (e.target.id === "chat-form") sendComment();
    });

    const onAction = async (e) => {
      const btn = e.target.closest("[data-action]");
      const dt = e.target.closest("[data-dtab]");
      if (dt) {
        detailTab = dt.dataset.dtab;
        renderView(true);
        if (detailTab === "history") loadHistory(route.id);
        return;
      }
      if (!btn) return;
      const a = btn.dataset.action;
      const i = findIssue(route.id);
      btn.closest("details.menu")?.removeAttribute("open");
      switch (a) {
        case "new": return go({ view: "new" });
        case "go-problem": return go({ view: "issue", id: Number(btn.dataset.id) });
        case "pick-images": case "add-images": return $("file-input").click();
        case "unpick": return removeDraftImage(btn.dataset.key);
        case "view-image":
          return openLightbox({ srcs: imagesOf(i).map(imageUrl), refs: imagesOf(i), index: Number(btn.dataset.index), issueId: route.id, deletable: true });
        case "chat-image": {
          const c = comments.find((x) => String(x.id) === btn.dataset.cid);
          const imgs = (c?.attachments || []).filter((x) => x.kind === "image");
          return openLightbox({ srcs: imgs.map(attUrl), index: Number(btn.dataset.index) });
        }
        case "work-start": return updateIssue({ status: "in_progress" }, "تمام، الفريق هيعرف إنك شغال عليها");
        case "work-stop": return updateIssue({ status: "open" }, "وقّفت الشغل عليها");
        case "take": return updateIssue({ assignee: myName() }, "بقيت إنت المسؤول عنها");
        case "pin": return updateIssue({ pinned: !i.pinned }, i.pinned ? "اتشال التثبيت" : "اتثبتت فوق القايمة");
        case "remind": return openRemind();
        case "link": return openLink();
        case "unlink": {
          await run(() => store.removeLink(route.id, Number(btn.dataset.other)), "اتشال الربط");
          return reloadLinks();
        }
        case "unduplicate": return updateIssue({ duplicate_of: null }, "اتشالت علامة التكرار");
        case "edit": editingId = route.id; renderView(true); return $("edit-title")?.focus();
        case "cancel-edit": editingId = null; return renderView(true);
        case "copy": return copyLink();
        case "delete": return deleteIssue();
        case "recur":
          return updateIssue({ status: "open", recur_count: (i.recur_count || 0) + 1, solved_at: null, solved_by: null },
            "اتفتحت تاني وتعلّمت إنها اتكررت");
        case "reopen": return updateIssue({ status: "open", solved_at: null, solved_by: null }, "المشكلة اتفتحت تاني");
        case "summarize": return summarize();
        case "ai-close": delete aiCache[route.id]; $("ai-card").hidden = true; return;
        case "chat-attach": return $("chat-file-input").click();
        case "remove-pending": return removePending(btn.dataset.key);
        case "record": return startRecording();
        case "rec-cancel": return stopRecording(false);
        case "rec-send": return stopRecording(true);
        case "react-open": return toggleReactPicker(Number(btn.dataset.cid));
        case "react": return toggleReaction(Number(btn.dataset.cid), btn.dataset.emoji);
        case "mention-pick": return pickMention(btn.dataset.name);
        case "show-assigned": return showAssigned(btn.dataset.name);
        case "admin-remove": return adminRemove(btn.dataset.uid, btn.dataset.name);
        case "admin-restore":
          await run(() => store.adminSetRemoved(btn.dataset.uid, false), "رجع للفريق");
          return reloadRoster();
        case "limit-inc": return adminLimit(1);
        case "limit-dec": return adminLimit(-1);
        case "export": return exportExcel();
        case "save-name": {
          const n = $("set-name").value.trim();
          if (!n) return toast("اكتب اسمك.");
          if (n === myName()) return;
          return saveSetting({ display_name: n }, "اتغيّر اسمك في كل حتة");
        }
        case "set-availability": return saveSetting({ availability: btn.dataset.value }, `حالتك: ${AVAILABILITY[btn.dataset.value].label}`);
        case "push-toggle": return btn.dataset.state === "on" ? disablePush() : enablePush();
        case "signout": return signOut();
      }
    };
    view.addEventListener("click", onAction);
    $("top-actions").addEventListener("click", onAction);

    // قفل القوايم لما تدوس برّاها
    document.addEventListener("click", (e) => {
      document.querySelectorAll("details.menu[open]").forEach((m) => { if (!m.contains(e.target)) m.removeAttribute("open"); });
      if (!e.target.closest(".react-add-wrap")) document.querySelectorAll(".react-pick").forEach((p) => p.remove());
      if (!e.target.closest(".chat-compose")) closeMentionPop();
    });

    $("file-input").addEventListener("change", (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      handleFiles(files, "problem");
    });
    $("chat-file-input").addEventListener("change", (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      handleFiles(files, "chat");
    });

    // سحب وإفلات: على النقاش بيروح للرسالة، وعلى باقي الصفحة بيروح لصور المشكلة
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
    let dragDepth = 0;
    view.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; view.classList.add("dragging"); });
    view.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    view.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; view.classList.remove("dragging"); } });
    view.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      view.classList.remove("dragging");
      handleFiles(e.dataTransfer.files, e.target.closest(".chat-box") ? "chat" : "problem");
    });
    window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener("drop", (e) => { if (hasFiles(e)) e.preventDefault(); });

    // لصق سكرين شوت: في خانة الرسالة بيروح للنقاش، غير كده لصور المشكلة
    document.addEventListener("paste", (e) => {
      if (!$("lightbox").hidden || $("modal").open) return;
      const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      if (document.activeElement?.id === "chat-input") { e.preventDefault(); return handleFiles(files, "chat"); }
      if (route.view !== "new" && !(route.view === "issue" && findIssue(route.id))) return;
      e.preventDefault();
      handleFiles(files, "problem");
    });

    view.addEventListener("focusout", () => setTimeout(() => viewPending && renderView(), 0));
    const afterAudio = () => setTimeout(() => {
      if (playing()) return;
      if (viewPending) renderView();
      else if (chatPending) renderChat();
    }, 0);
    view.addEventListener("pause", afterAudio, true);
    view.addEventListener("ended", afterAudio, true);
    // رسالة صوتية واحدة بس تشتغل في نفس الوقت
    view.addEventListener("play", (e) => {
      view.querySelectorAll("audio").forEach((a) => { if (a !== e.target) a.pause(); });
    }, true);

    $("menu-btn").addEventListener("click", openSidebar);
    $("sb-close").addEventListener("click", closeSidebar);
    $("scrim").addEventListener("click", closeSidebar);

    $("lb-close").addEventListener("click", closeLightbox);
    $("lb-prev").addEventListener("click", () => { lb.index--; showLightbox(); });
    $("lb-next").addEventListener("click", () => { lb.index++; showLightbox(); });
    $("lb-delete").addEventListener("click", deleteImage);
    $("lightbox").addEventListener("click", (e) => { if (e.target === $("lightbox") || e.target === $("lb-stage")) closeLightbox(); });

    $("modal").addEventListener("click", (e) => {
      const b = e.target.closest("[data-modal]");
      if (!b) return;
      if (b.dataset.modal === "close") return closeModal();
      modalHandler && modalHandler(b.dataset.modal, b);
    });
    $("modal").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.id === "welcome-name") { e.preventDefault(); $("modal").querySelector('[data-modal="next"]')?.click(); }
    });

    document.addEventListener("keydown", (e) => {
      if (!$("lightbox").hidden) {
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowLeft") { lb.index++; showLightbox(); }
        if (e.key === "ArrowRight") { lb.index--; showLightbox(); }
        return;
      }
      if (e.key === "Escape") {
        closeSidebar();
        document.querySelectorAll("details.menu[open]").forEach((m) => m.removeAttribute("open"));
        document.querySelectorAll(".react-pick").forEach((p) => p.remove());
      }
      const a = document.activeElement;
      const typing = a && ["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName);
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !$("modal").open) {
        e.preventDefault();
        openSidebar();
        $("search").focus();
      }
    });

    window.addEventListener("hashchange", () => {
      const r = parseHash(location.hash);
      if (r.view !== route.view || r.id !== route.id) { closeLightbox(); go(r); }
    });

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => route.view === "stats" && drawChart(), 150);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { touch(); maybeMarkRead(); }
    });

    setInterval(() => {
      if ($("now")) $("now").textContent = dateTime(new Date().toISOString());
      if (["issue", "team"].includes(route.view) && $("lightbox").hidden && !$("modal").open) renderView();
    }, 30e3);
    setInterval(() => document.visibilityState === "visible" && touch(), 4 * 60e3);
  }

  async function touch() {
    if (!me) return;
    try { await store.updateMe({ last_seen: new Date().toISOString() }); } catch (e) { console.warn(e); }
  }

  // ============ التشغيل ============
  function startApp(isNew) {
    $("auth").hidden = true;
    $("app").hidden = false;
    if (started) {
      renderMe();
      loadAll().catch((e) => console.error(e));
      return;
    }
    started = true;
    renderMe();
    renderTabs();
    renderList();
    renderView(true);
    bindEvents();
    store.subscribe({
      [TABLE]: onProblemsChange,
      problem_comments: reloadComments,
      members: recheckMembership,
      team_settings: recheckMembership,
      comment_reactions: reloadReactions,
      problem_reads: reloadReads,
      problem_links: reloadLinks,
      reminders: reloadReminders,
      problem_events: () => { if (route.view === "issue" && detailTab === "history") loadHistory(route.id); },
    });
    startPresence();
    loadAll().catch((e) => {
      console.error(e);
      notice(friendlyError(e), { error: true });
      $("list").innerHTML = '<p class="sb-empty">مقدرناش نحمّل المشاكل.</p>';
    });
    if (isNew) openWelcome(1);
    initServiceWorker();
  }

  boot();
})();
