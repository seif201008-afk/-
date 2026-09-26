(() => {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";

  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const LOCALE = "ar-EG-u-nu-latn";
  const BASE_TITLE = document.title;

  // ============ إعدادات الجهاز ده بس (مش بتتزامن) ============
  const memory = {};
  const local = {
    get(k) { try { return localStorage.getItem(k); } catch { return memory[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { memory[k] = v; } },
  };
  const TAB_KEY = "team_problems_tab";
  const NUDGE_KEY = "team_problems_push_nudge";
  const NUDGE_AGAIN_KEY = "team_problems_push_nudge_again";

  // ============ الاتصال بـ Supabase ============
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const db = configured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        // نبض الاتصال من Web Worker: كروم مبيبطّأوش لما التاب يبقى في الخلفية، فالاتصال مبيقعش
        realtime: { worker: true, heartbeatIntervalMs: 20000 },
      })
    : null;
  const TABLE = cfg.TABLE || "team_problems";
  const BUCKET = "problem-images";
  const CHAT_BUCKET = "chat-files";
  const AVATAR_BUCKET = "avatars";
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
    if (/only_member_can_edit/.test(msg)) return "لازم تكون عضو في الفريق عشان تعدّل المشكلة.";
    if (/only_assignee_can_start|only_assignee_can_stop/.test(msg)) return "المسؤول عن المشكلة بس هو اللي يقدر يعلّم إنه شغال عليها.";
    if (/not_admin/.test(msg)) return "الخاصية دي للأدمن بس.";
    if (/cannot_remove_self/.test(msg)) return "مينفعش تشيل نفسك من الفريق.";
    if (/only_sender_or_admin_can_delete/.test(msg)) return "اللي بعت الرسالة أو الأدمن بس هو اللي يقدر يمسحها من عند الكل.";
    if (/assignee_not_member/.test(msg)) return "المسؤول لازم يكون عضو في الفريق.";
    if (/only_sender_can_edit/.test(msg)) return "اللي بعت الرسالة بس هو اللي يقدر يعدّلها.";
    if (/message_deleted/.test(msg)) return "الرسالة دي اتمسحت خلاص.";
    if (/no_members/.test(msg)) return "اختار حد على الأقل.";
    if (/not_allowed/.test(msg)) return "اللي عمل المجموعة أو الأدمن بس يقدر يعمل كده.";
    if (/not_active_member/.test(msg)) return "الشخص ده مش ضمن الفريق دلوقتي.";
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
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.6 3.4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>',
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
  // بيدوّر على صورة العضو بالاسم؛ لو مفيش، بيرجع أول حرف بلون ثابت زي ما كان
  function avatarPathOf(name) {
    return roster?.find((r) => same(r.display_name, name))?.avatar_path || null;
  }
  function avatar(name, cls = "") {
    const n = String(name || "؟").trim() || "؟";
    const path = avatarPathOf(n);
    if (path) return `<span class="avatar has-photo ${cls}" aria-hidden="true"><img src="${esc(avatarUrl(path))}" alt="" loading="lazy" /></span>`;
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
  // أدوات الأدمن مخفية دايمًا، ومبتظهرش غير بـ 3 دوسات على اسم الموقع (ولحد ما التاب يتقفل)
  let adminMode = false;
  try { adminMode = sessionStorage.getItem("tp_x") === "1"; } catch {}
  const showAdmin = () => isAdmin && adminMode;
  let issues = [];
  let comments = [];
  let roster = [];
  let reactions = [];
  let reads = [];
  let links = [];
  let myReminders = [];
  let hiddenComments = new Set(); // رسايل النقاش اللي مسحتها من عندي
  let chatGroups = [];             // شات الفريق والمجموعات اللي أقدر أشوفها
  let chatMembers = [];
  let chatMsgs = [];
  let chatHidden = new Set();
  let chatReads = [];
  let chatReactions = [];
  let chatError = "";
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
    const c = /^#c(\d+)$/.exec(h || "");
    if (c) return { view: "chat", gid: Number(c[1]) };
    if (["#team", "#stats", "#settings", "#chat"].includes(h)) return { view: h.slice(1) };
    return { view: "new" };
  };
  const hashOf = (r) => (r.view === "issue" ? "#p" + r.id : r.view === "chat" && r.gid ? "#c" + r.gid : "#" + r.view);
  let route = parseHash(location.hash);
  const draft = { title: "", details: "", note: "", assignee: "", due: "", urgent: false, more: false, images: [] };
  const chatDrafts = {};
  const chatFiles = {};
  const aiCache = {};
  const transcripts = {}; // att_path → { loading } | { text } | { error }
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
  const isAssignee = (i) => same(i.assignee, myName());
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
    return comments.filter((c) => c.problem_id === pid && !isMine(c) && !c.pending && !c.deleted_at &&
      !hiddenComments.has(c.id) && new Date(c.created_at) > since).length;
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

  const ME_COLS = "user_id,display_name,joined_at,last_seen,removed,availability,status_note,quiet_start,quiet_end,summary_hour,tz,muted,push_wanted,avatar_path";
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
    // نقاش المشكلة: تعديل ومسح
    updateComment: (id, patch) => must(db.from("problem_comments").update(patch).eq("id", id)),
    listCommentHides: () => must(db.from("comment_hides").select("comment_id")),
    hideComment: (id) => must(db.rpc("comment_hide_for_me", { p_comment: id })),
    deleteCommentForAll: (id) => must(db.rpc("comment_delete_for_everyone", { p_comment: id })),
    // شات الفريق والمجموعات
    listChatGroups: () => must(db.rpc("my_chat_groups")),
    listChatMembers: () => must(db.from("chat_group_members").select("group_id,user_id,added_at")),
    listChatMessages: async () =>
      (await must(db.from("chat_messages").select("*").order("created_at", { ascending: false }).limit(3000))).reverse(),
    addChatMessage: (row) => must(db.from("chat_messages").insert(row)),
    updateChatMessage: (id, patch) => must(db.from("chat_messages").update(patch).eq("id", id)),
    listChatHides: () => must(db.from("chat_message_hides").select("message_id")),
    hideChatMessage: (id) => must(db.rpc("chat_hide_for_me", { p_message: id })),
    deleteChatForAll: (id) => must(db.rpc("chat_delete_for_everyone", { p_message: id })),
    listChatReads: () => must(db.from("chat_reads").select("group_id,user_id,member,last_read_at")),
    markChatRead: (gid) => must(db.rpc("mark_chat_read", { p_group: gid })),
    listChatReactions: () => must(db.from("chat_reactions").select("message_id,user_id,member,emoji")),
    addChatReaction: (mid, emoji) => must(db.from("chat_reactions").insert({ message_id: mid, emoji })),
    removeChatReaction: (mid, emoji) =>
      must(db.from("chat_reactions").delete().eq("message_id", mid).eq("emoji", emoji).eq("user_id", me.user_id)),
    createGroup: (name, members) => must(db.rpc("create_chat_group", { p_name: name || null, p_members: members })),
    addGroupMember: (gid, u) => must(db.rpc("chat_group_add_member", { p_group: gid, p_user: u })),
    removeGroupMember: (gid, u) => must(db.rpc("chat_group_remove_member", { p_group: gid, p_user: u })),
    renameGroup: (gid, name) => must(db.rpc("chat_group_rename", { p_group: gid, p_name: name })),
    ping: (device, here, viewing) => must(db.rpc("presence_ping", { p_device: device, p_here: here, p_viewing: viewing })),
    presence: () => must(db.rpc("team_presence")),
    adminSetRemoved: (u, removed) => must(db.rpc("admin_set_removed", { p_user: u, p_removed: removed })),
    getTranscript: (path) => must(db.from("voice_transcripts").select("text").eq("att_path", path).maybeSingle()),
    async uploadAvatar({ blob, ext }) {
      const path = `${me.user_id}/${uid()}.${ext}`;
      const { error } = await db.storage.from(AVATAR_BUCKET).upload(path, blob, {
        contentType: blob.type || "image/jpeg", cacheControl: "31536000", upsert: false,
      });
      if (error) throw Object.assign(new Error(error.message || "upload failed"), { storage: true });
      return path;
    },

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
      return Object.entries(handlers).map(([table, fn]) =>
        db.channel(`changes-${table}`)
          .on("postgres_changes", { event: "*", schema: "public", table }, fn)
          .subscribe());
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
  const avatarUrl = (path) => (path ? publicUrl(AVATAR_BUCKET, path) : "");

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

  // بتقص الصورة كاريه من النص وتصغّرها عشان تتحط أفتار
  async function prepareAvatar(file) {
    if (!file || !/^image\//.test(file.type)) throw fail("not-image");
    const img = await loadImage(file);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(320, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) throw fail("bad-image");
    return { blob, ext: "jpg" };
  }

  async function pickAvatar(file) {
    const old = me.avatar_path;
    try {
      const prepared = await prepareAvatar(file);
      const path = await store.uploadAvatar(prepared);
      await store.updateMe({ avatar_path: path });
      me.avatar_path = path;
      const mine = roster.find((r) => r.user_id === me.user_id);
      if (mine) mine.avatar_path = path;
      if (old) store.removeFiles(AVATAR_BUCKET, [old]);
      toast("اتغيّرت صورتك");
      renderMe();
      renderView(true);
      renderTabs();
    } catch (err) {
      console.error(err);
      toast("مقدرتش أحفظ الصورة: " + friendlyError(err));
    }
  }

  async function removeAvatar() {
    const old = me.avatar_path;
    if (!old) return;
    try {
      await store.updateMe({ avatar_path: null });
      me.avatar_path = null;
      const mine = roster.find((r) => r.user_id === me.user_id);
      if (mine) mine.avatar_path = null;
      store.removeFiles(AVATAR_BUCKET, [old]);
      toast("اتمسحت صورتك");
      renderMe();
      renderView(true);
      renderTabs();
    } catch (err) {
      console.error(err);
      toast("مقدرتش أمسح الصورة: " + friendlyError(err));
    }
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

  // ============ مين موجود دلوقتي ============
  // الحقيقة متسجلة في قاعدة البيانات: كل تاب بيبعت نبض بطلب عادي (مش بالاتصال اللحظي)،
  // فلو كروم اتصغّر ووقّف الاتصال اللحظي، النبض بيفضل شغال، وأول ما ترجع بيتبعت على طول.
  // الاتصال اللحظي بقى بس عشان "فلان بيكتب…"، وعشان التحديث يوصل أسرع.
  const DEVICE_ID = (() => {
    const make = () => "d" + uid().replace(/-/g, "").slice(0, 24);
    try {
      let id = sessionStorage.getItem("tp_dev");
      if (!id) { id = make(); sessionStorage.setItem("tp_dev", id); }
      return id;
    } catch { return make(); }
  })();
  const HERE_S = 70;   // التاب اللي قدامك بيبعت كل 25 ثانية
  const ALIVE_S = 150; // التاب اللي في الخلفية بيبعت كل 50 ثانية
  let presenceRows = [];
  let presenceAt = Date.now();
  let presenceCh = null;
  let liveTyping = new Map(); // uid → { name, keys }
  const onlineEntry = (name) => online.find((o) => same(o.name, name));

  // الموقع قدام الشخص فعلًا (مش في تاب تاني ولا الكروم متصغّر)
  const pageHere = () => document.visibilityState === "visible" && document.hasFocus();
  const myViewing = () => (route.view === "issue" ? route.id : null);
  const rowAge = (p) => p.age_s + (Date.now() - presenceAt) / 1000;

  function buildOnline() {
    const byId = new Map(activeRoster().map((r) => [r.user_id, r]));
    const map = new Map();
    const add = (u, here, viewing) => {
      const r = byId.get(u);
      if (!r) return;
      const cur = map.get(u) || { uid: u, name: r.display_name, availability: r.availability || "available", viewing: [], typing: [], here: false };
      cur.here = cur.here || here;
      if (here && viewing) cur.viewing.push(viewing);
      map.set(u, cur);
    };
    for (const p of presenceRows) {
      if (p.gone) continue;
      const age = rowAge(p);
      if (age > ALIVE_S) continue;
      add(p.user_id, !!p.here && age <= HERE_S, p.viewing);
    }
    // أنا: حالتي من الجهاز ده على طول، من غير ما أستنى السيرفر
    if (me) add(me.user_id, pageHere(), myViewing());
    for (const [u, t] of liveTyping) if (map.has(u)) map.get(u).typing = t.keys;
    online = [...map.values()];
  }

  // آخر مرة كان موجود فيها (من أحدث نبض، أو من آخر دخول)
  function lastSeenOf(r) {
    let t = r?.last_seen ? new Date(r.last_seen).getTime() : 0;
    for (const p of presenceRows) if (p.user_id === r?.user_id) t = Math.max(t, Date.now() - rowAge(p) * 1000);
    return new Date(t || Date.now()).toISOString();
  }

  // ---- النبض ----
  let pingSig = "";
  let pingAt = 0;
  let pingTimer;
  async function ping(force = false) {
    if (!started || !me) return;
    const here = pageHere();
    const viewing = myViewing();
    const sig = `${here}|${viewing}`;
    if (!force && sig === pingSig && Date.now() - pingAt < (here ? 25e3 : 50e3)) return;
    pingSig = sig;
    pingAt = Date.now();
    try { await store.ping(DEVICE_ID, here, viewing); } catch (e) { pingAt = 0; console.warn(e); }
  }
  // حالتي اتغيرت (رجعت، صغّرت، فتحت مشكلة…): نبلّغ على طول، ونجمّع التغييرات اللي ورا بعض
  function trackPresence() {
    buildOnline();
    renderPresence();
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => ping(), 250);
    if (presenceCh && me) {
      Promise.resolve(presenceCh.track({ uid: me.user_id, name: myName(), typing: typingKey })).catch(() => {});
    }
  }
  // لما التاب يتقفل: نقول إننا مشينا (الطلب بيكمل حتى بعد ما الصفحة تتقفل)
  function leaveNow() {
    const token = authSession?.access_token;
    if (!started || !me || !token) return;
    pingSig = "";
    try {
      fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/presence_ping`, {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ p_device: DEVICE_ID, p_here: false, p_viewing: null, p_gone: true }),
      }).catch(() => {});
    } catch {}
  }

  // ---- مين موجود عند الباقيين ----
  let presenceLoadAt = 0;
  let presenceDirty = false;
  let presenceLoadTimer;
  async function loadPresence() {
    presenceLoadAt = Date.now();
    presenceDirty = false;
    const rows = await soft(store.presence, null);
    if (rows) { presenceRows = rows; presenceAt = Date.now(); }
    buildOnline();
    renderPresence();
  }
  // حد اتغيرت حالته: لو الموقع قدامي نحدّث (مرة واحدة لكل شوية تغييرات)، ولو في الخلفية نستنى لما أرجع
  function onPresenceChange() {
    if (document.visibilityState !== "visible") { presenceDirty = true; return; }
    clearTimeout(presenceLoadTimer);
    presenceLoadTimer = setTimeout(loadPresence, 400);
  }

  // "فلان بيكتب…" بس
  function startPresence() {
    const ch = db.channel("team-presence", { config: { presence: { key: me.user_id } } });
    presenceCh = ch;
    ch.on("presence", { event: "sync" }, () => {
      if (presenceCh !== ch) return;
      const map = new Map();
      Object.values(ch.presenceState()).flat().forEach((p) => {
        if (!p?.uid || !p?.typing) return;
        const cur = map.get(p.uid) || { name: p.name, keys: [] };
        cur.keys.push(p.typing);
        map.set(p.uid, cur);
      });
      liveTyping = map;
      buildOnline();
      renderPresence();
    })
      .subscribe((status) => { if (status === "SUBSCRIBED" && presenceCh === ch) trackPresence(); });
  }

  // بنرسم بس لو حاجة اتغيرت فعلًا، عشان الموقع ميتقلش
  let presenceSig = "";
  function renderPresence() {
    const list = [...online].sort((a, b) => (a.uid === me?.user_id ? -1 : b.uid === me?.user_id ? 1 : 0) || (b.here - a.here));
    const sig = JSON.stringify([list.map((o) => [o.uid, o.name, o.here, o.viewing]), [...liveTyping], route.view, route.id, route.gid]);
    if (sig === presenceSig) return;
    presenceSig = sig;
    const here = list.filter((o) => o.here).length;
    const away = list.length - here;
    $("presence-text").textContent = !list.length ? "محدش فاتح دلوقتي"
      : `فاتحين دلوقتي · ${here}${away ? ` · ${away} في الخلفية` : ""}`;
    const shown = list.slice(0, 5);
    $("presence-avatars").innerHTML =
      shown.map((o) => `<span class="stack-item${o.here ? "" : " idle"}" title="${esc(o.name)}${o.here ? "" : " · الموقع مش قدامه"}">${avatar(o.name, "sm")}</span>`).join("") +
      (list.length > shown.length ? `<span class="stack-more">+${list.length - shown.length}</span>` : "");
    $("nav-team").dataset.count = here ? String(here) : "";
    renderViewers();
    renderTyping();
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
    const chatUnreadAll = totalChatUnread();
    $("nav-chat").dataset.unread = chatUnreadAll ? String(chatUnreadAll) : "";
    $("menu-dot").hidden = !chatUnreadAll && !issues.some((i) => unreadCount(i.id) > 0);
    updateTitleBadge(chatUnreadAll + issues.reduce((s, i) => s + unreadCount(i.id), 0));
  }

  // العدد بجنب اسم الموقع في التبويب، زي الإيميل: رسالة واحدة مشوفتهاش = "(1)"، لحد ما تفتحها
  function updateTitleBadge(n) {
    document.title = n ? `(${n > 99 ? "99+" : n}) ${BASE_TITLE}` : BASE_TITLE;
  }

  function listItem(i) {
    const active = route.view === "issue" && route.id === i.id;
    const solved = i.status === "solved";
    const unread = unreadCount(i.id);
    const nComments = visibleCount(ctxOf("p", i.id));
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
    } else if (route.view === "chat") {
      const g = route.gid && groupById(route.gid);
      $("crumb").innerHTML = g ? `<span>الشات</span><span class="sep">/</span><b>${esc(groupTitle(g))}</b>` : "<b>الشات</b>";
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
                  ${assigneeSelect(draft.assignee, "input", 'id="assignee"')}
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
      `<button type="button" data-action="edit">${icon("edit")} عدّل المشكلة</button>`,
      `<button type="button" data-action="copy">${icon("link")} انسخ لينك المشكلة</button>`,
      `<button type="button" class="danger" data-action="delete">${icon("trash")} امسح المشكلة</button>`,
    ].join("");
    btns.push(`<details class="menu"><summary class="btn btn-ghost btn-sm" aria-label="المزيد">${icon("more")}</summary><div class="menu-list">${more}</div></details>`);
    return `<div class="toolbar" role="toolbar" aria-label="أوامر المشكلة">${btns.join("")}</div>`;
  }

  // المسؤول بيتختار من أعضاء الفريق بس (أي عضو جديد بيظهر هنا لوحده)
  function assigneeSelect(current, cls, attrs) {
    const people = activeRoster().map((r) => r.display_name)
      .sort((a, b) => (same(b, myName()) - same(a, myName())) || a.localeCompare(b, "ar"));
    const legacy = current && !people.some((n) => same(n, current));
    return `<select class="${cls}" ${attrs}>
      <option value="" ${current ? "" : "selected"}>مفيش مسؤول</option>
      ${legacy ? `<option value="${esc(current)}" selected disabled>${esc(current)} (مش في الفريق)</option>` : ""}
      ${people.map((n) => `<option value="${esc(n)}" ${same(n, current) ? "selected" : ""}>${esc(same(n, myName()) ? `أنا (${n})` : n)}</option>`).join("")}
    </select>`;
  }

  function detailHtml(i) {
    const solved = i.status === "solved";
    const person = (n) => (n ? `${avatar(n, "sm")}<span>${esc(n)}</span>` : `<span class="sub">مش متسجل</span>`);
    const when = (iso) => `<span>${esc(dateLong(iso))}</span><span class="sub">${esc(timeOnly(iso))}</span>`;
    const asg = memberByName(i.assignee);
    const asgAway = asg && asg.availability !== "available" ? `<span class="sub av-note ${AVAILABILITY[asg.availability].cls}">${AVAILABILITY[asg.availability].label}${asg.status_note ? ` · ${esc(asg.status_note)}` : ""}</span>` : "";

    const props = [
      ["الحالة", statusBadge(i)],
      ["المسؤول", `${assigneeSelect(i.assignee, "prop-select", 'data-field="assignee" aria-label="المسؤول عن المشكلة"')}${asgAway}`],
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

    const nComments = visibleCount(ctxOf("p", i.id));
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
              <div id="dtab-panel">${detailTab === "chat" ? chatBoxHtml(ctxOf("p", i.id)) : historyHtml(i)}</div>
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

  // ---------- الرسايل: نقاش المشكلة، وشات الفريق والمجموعات ----------
  // كل محادثة ليها "سياق": نقاش مشكلة { kind: "p" } أو محادثة من الشات { kind: "c" }
  const ctxOf = (kind, id) => ({ kind, id, key: kind + id });
  function currentCtx() {
    if (route.view === "issue" && findIssue(route.id)) return ctxOf("p", route.id);
    if (route.view === "chat" && route.gid && groupById(route.gid)) return ctxOf("c", route.gid);
    return null;
  }
  const groupById = (id) => chatGroups.find((g) => g.id === id);
  const teamGroup = () => chatGroups.find((g) => g.is_team);
  const rosterById = (u) => roster.find((r) => r.user_id === u);
  const nameOf = (u, fallback) => rosterById(u)?.display_name || fallback || "حد من الفريق";
  const memberRows = (gid) => chatMembers.filter((m) => m.group_id === gid);
  // مين في المحادثة دلوقتي (الأعضاء النشطين بس)
  function groupMemberIds(gid) {
    const g = groupById(gid);
    if (!g) return [];
    if (g.is_team) return activeRoster().map((r) => r.user_id);
    return memberRows(gid).map((m) => m.user_id).filter((u) => rosterById(u)?.active);
  }
  // عضو حقيقي في المحادثة (مش الأدمن اللي بيتابع من بعيد)
  const isParticipant = (gid) => {
    const g = groupById(gid);
    return !!g && !!me && (g.is_team || memberRows(gid).some((m) => m.user_id === me.user_id));
  };
  const canWrite = (ctx) => ctx.kind === "p" || isParticipant(ctx.id);
  function groupTitle(g) {
    if (!g) return "";
    if (g.is_team) return "شات الفريق";
    if (g.name) return g.name;
    const ids = memberRows(g.id).map((m) => m.user_id);
    const others = ids.filter((u) => u !== me?.user_id);
    return (others.length ? others : ids).map((u) => nameOf(u)).join("، ") || "شات خاص";
  }
  const isMine = (m) => !!me && (m.created_by === me.user_id || (!m.created_by && same(m.author, myName())));
  const ATT_LABEL = { image: "📷 صورة", audio: "🎤 رسالة صوتية", file: "📎 ملف" };
  const attLabel = (m) => ATT_LABEL[(m.attachments || [])[0]?.kind] || "";
  const snippet = (m, n = 90) => (m.deleted_at ? "اتمسحت الرسالة دي" : (m.body || attLabel(m) || "").replace(/\s+/g, " ").slice(0, n));

  function msgsOf(ctx) {
    if (ctx.kind === "p") return comments.filter((c) => c.problem_id === ctx.id && !hiddenComments.has(c.id));
    return chatMsgs.filter((m) => m.group_id === ctx.id && !chatHidden.has(m.id));
  }
  const findMsg = (ctx, id) => (ctx.kind === "p" ? comments : chatMsgs).find((m) => String(m.id) === String(id));
  const visibleCount = (ctx) => msgsOf(ctx).filter((m) => !m.deleted_at && !m.pending).length;

  // ---------- علامات الصح: ✓ اتبعتت، ✓✓ حد شافها، ✓✓✓ الكل شافها ----------
  function audienceIds(ctx, senderId) {
    const ids = ctx.kind === "p" ? activeRoster().map((r) => r.user_id) : groupMemberIds(ctx.id);
    return ids.filter((u) => u !== senderId);
  }
  const readRows = (ctx) =>
    ctx.kind === "p" ? reads.filter((r) => r.problem_id === ctx.id) : chatReads.filter((r) => r.group_id === ctx.id);
  function seenBy(ctx, m) {
    const aud = audienceIds(ctx, m.created_by || me?.user_id);
    const t = new Date(m.created_at);
    const rows = readRows(ctx).filter((r) => aud.includes(r.user_id) && new Date(r.last_read_at) >= t);
    const seenIds = new Set(rows.map((r) => r.user_id));
    return {
      total: aud.length,
      seen: rows.map((r) => nameOf(r.user_id, r.member)),
      waiting: aud.filter((u) => !seenIds.has(u)).map((u) => nameOf(u)),
    };
  }
  const TICKS = (n) =>
    `<svg class="tick-i" viewBox="0 0 ${8 + n * 5} 12" aria-hidden="true">${Array.from({ length: n }, (_, k) =>
      `<path d="M${1 + k * 5} 6.5l2.6 2.6L${8.6 + k * 5} 3"/>`).join("")}</svg>`;
  function ticksHtml(ctx, m) {
    if (m.pending) return `<span class="ticks pending" title="بيتبعت…">${icon("clock")}</span>`;
    const s = seenBy(ctx, m);
    const level = !s.seen.length ? 1 : s.seen.length >= s.total ? 3 : 2;
    const label = level === 1 ? "اتبعتت، ولسه محدش شافها" : level === 3 ? "الكل شافها" : `شافها ${s.seen.join("، ")}`;
    return `<button type="button" class="ticks t${level}" data-action="ticks" data-mid="${m.id}" title="${esc(label)}" aria-label="${esc(label)}">${TICKS(level)}</button>`;
  }
  function seenLineHtml(ctx, m) {
    const s = seenBy(ctx, m);
    if (!s.total || !s.seen.length) return "";
    const text = s.seen.length >= s.total && s.total > 1 ? "الكل شافها" : `شافها ${s.seen.join("، ")}`;
    return `<p class="seen">${esc(text)}</p>`;
  }

  // ---------- المنشن ----------
  const ALL_TAGS = ["@الكل", "@all"];
  function highlightMentions(html) {
    const names = [...activeRoster().map((r) => r.display_name), "الكل", "all"].sort((a, b) => b.length - a.length);
    let out = html;
    for (const n of names) {
      const tok = "@" + esc(n);
      if (!out.includes(tok)) continue;
      const cls = same(n, myName()) || n === "الكل" || n === "all" ? "mention to-me" : "mention";
      out = out.split(tok).join(`<span class="${cls}">${tok}</span>`);
    }
    return out;
  }
  const mentionsMeIn = (body) => {
    const t = (body || "").toLowerCase();
    return ALL_TAGS.some((x) => t.includes(x)) || (!!myName() && t.includes("@" + myName().toLowerCase()));
  };

  function attachmentsHtml(m) {
    const atts = Array.isArray(m.attachments) ? m.attachments : [];
    if (!atts.length) return "";
    const imgs = atts.filter((a) => a.kind === "image");
    return `<div class="atts">
      ${imgs.length ? `<div class="att-imgs">${imgs.map((a, n) => `
        <button type="button" class="att-img" data-action="chat-image" data-mid="${m.id}" data-index="${n}" aria-label="افتح الصورة">
          <img src="${esc(attUrl(a))}" alt="" loading="lazy" /></button>`).join("")}</div>` : ""}
      ${atts.filter((a) => a.kind === "audio").map((a) => {
        const st = transcripts[a.path];
        return `<div class="att-audio">${icon("mic")}<audio controls preload="none" src="${esc(attUrl(a))}"></audio>${a.duration ? `<span class="att-dur">${clock(a.duration)}</span>` : ""}
          ${!st ? `<button type="button" class="link-btn att-transcribe" data-action="transcribe" data-path="${esc(a.path)}">حوّلها لكلام</button>` : ""}</div>
          ${st?.loading ? `<p class="transcript loading">بيحوّلها لكلام…</p>`
            : st?.text ? `<p class="transcript">${esc(st.text)}</p>`
            : st?.error ? `<p class="transcript error">${esc(st.error)}</p>` : ""}`;
      }).join("")}
      ${atts.filter((a) => a.kind === "file").map((a) => `
        <a class="att-file" href="${esc(attUrl(a))}" target="_blank" rel="noopener" download="${esc(a.name)}">
          ${icon("file")}<span class="att-name">${esc(a.name)}</span><span class="att-size">${fileSize(a.size || 0)}</span></a>`).join("")}
    </div>`;
  }

  function quoteHtml(ctx, rid) {
    const q = findMsg(ctx, rid);
    if (!q) return `<span class="quote gone">${icon("reply")}<span>الرسالة الأصلية مش موجودة</span></span>`;
    return `<button type="button" class="quote" data-action="jump" data-mid="${q.id}">
      <b>${esc(isMine(q) ? "إنت" : q.author)}</b><span>${esc(snippet(q, 120))}</span></button>`;
  }

  const reactsOf = (ctx, m) =>
    ctx.kind === "p" ? reactions.filter((r) => r.comment_id === m.id) : chatReactions.filter((r) => r.message_id === m.id);

  // تحت كل رسالة: الردود السريعة، وزرار الرد السريع، وزرار الأوامر (⋯)
  function toolsHtml(ctx, m) {
    if (m.pending) return "";
    const write = canWrite(ctx) && !m.deleted_at;
    const groups = m.deleted_at ? [] : EMOJIS.map((e) => {
      const list = reactsOf(ctx, m).filter((r) => r.emoji === e);
      return { e, list, mine: list.some((r) => r.user_id === me?.user_id) };
    }).filter((g) => g.list.length);
    return `<div class="reacts">
      ${groups.map((g) => `<button type="button" class="react${g.mine ? " mine" : ""}" data-action="react" data-mid="${m.id}" data-emoji="${g.e}"
          title="${esc(g.list.map((r) => nameOf(r.user_id, r.member)).join("، "))}" ${write ? "" : "disabled"}>${g.e} <span>${g.list.length}</span></button>`).join("")}
      <span class="react-add-wrap">
        ${write ? `<button type="button" class="react-add" data-action="react-open" data-mid="${m.id}" aria-label="رد سريع">${icon("smile")}</button>` : ""}
        <button type="button" class="react-add msg-more" data-action="msg-menu" data-mid="${m.id}" aria-label="أوامر الرسالة">${icon("more")}</button>
      </span>
    </div>`;
  }

  function messagesHtml(ctx) {
    const list = msgsOf(ctx);
    if (!list.length) {
      return `<p class="chat-empty">${ctx.kind === "p"
        ? "لسه محدش كتب حاجة. ابدأ النقاش مع الفريق هنا، واكتب @ عشان تذكر حد."
        : "لسه مفيش رسايل هنا. ابدأ الكلام، واكتب @ عشان تذكر حد، أو @الكل عشان توصل للكل."}</p>`;
    }
    let html = "";
    let prev = null;
    let lastDay = null;
    const lastMine = [...list].reverse().find((m) => isMine(m) && !m.deleted_at && !m.pending);
    for (const m of list) {
      const day = dayLabel(m.created_at);
      if (day !== lastDay) {
        html += `<div class="chat-day"><span>${esc(day)}</span></div>`;
        lastDay = day;
        prev = null;
      }
      const mine = isMine(m);
      const deleted = !!m.deleted_at;
      const grouped = prev && !prev.deleted_at && same(prev.author, m.author) &&
        new Date(m.created_at) - new Date(prev.created_at) < 5 * 60e3;
      const mentionsMe = !mine && !deleted && mentionsMeIn(m.body);
      html += `
        <div class="msg${mine ? " mine" : ""}${grouped ? " grouped" : ""}${m.pending ? " pending" : ""}${mentionsMe ? " mentions-me" : ""}${deleted ? " deleted" : ""}" data-mid="${m.id}">
          ${mine ? "" : grouped ? '<span class="msg-av"></span>' : `<span class="msg-av">${avatar(m.author, "sm")}</span>`}
          <div class="bubble-wrap">
            <div class="bubble">
              ${!mine && !grouped ? `<span class="msg-name">${esc(m.author)}</span>` : ""}
              ${deleted
                ? `<p class="deleted-text">${icon("x")} اتمسحت الرسالة دي</p>`
                : `${m.reply_to ? quoteHtml(ctx, m.reply_to) : ""}${attachmentsHtml(m)}${m.body ? `<p>${highlightMentions(esc(m.body))}</p>` : ""}`}
              <span class="msg-meta">
                ${m.pinned_at && !deleted ? `<span class="pin-mark" title="مثبتة">${icon("pin")}</span>` : ""}
                ${m.edited_at && !deleted ? `<span class="edited-mark">اتعدلت</span>` : ""}
                <time datetime="${esc(m.created_at)}">${m.pending ? "بيتبعت…" : esc(timeOnly(m.created_at))}</time>
                ${mine && !deleted ? ticksHtml(ctx, m) : ""}
              </span>
            </div>
            ${toolsHtml(ctx, m)}
            ${m === lastMine ? seenLineHtml(ctx, m) : ""}
          </div>
        </div>`;
      prev = m;
    }
    return html;
  }

  function pendingChipsHtml(key) {
    return (chatFiles[key] || []).map((f) => `
      <span class="pchip">${f.kind === "image" ? `<img src="${f.url}" alt="" />` : icon(f.kind === "audio" ? "mic" : "file")}
        <span class="pchip-name">${esc(f.name)}</span>
        <button type="button" class="pchip-x" data-action="remove-pending" data-key="${f.key}" aria-label="شيل ${esc(f.name)}">${icon("x")}</button>
      </span>`).join("");
  }

  // الرد على رسالة أو تعديلها: شريط صغير فوق خانة الكتابة
  const composeMode = {};
  function composeModeHtml(ctx) {
    const mode = composeMode[ctx.key];
    if (!mode) return "";
    const m = findMsg(ctx, mode.mid);
    const text = mode.kind === "edit"
      ? `${icon("edit")}<span><b>بتعدّل رسالتك</b></span>`
      : `${icon("reply")}<span>رد على <b>${esc(m ? (isMine(m) ? "نفسك" : m.author) : "")}</b>: ${esc(m ? snippet(m, 70) : "")}</span>`;
    return `${text}<button type="button" class="icon-btn" data-action="compose-cancel" aria-label="إلغاء">${icon("x")}</button>`;
  }

  // مين بيكتب دلوقتي (زي واتساب)
  function typersFor(key) {
    return [...liveTyping].filter(([u, t]) => u !== me?.user_id && t.keys.includes(key)).map(([u, t]) => roster.find((r) => r.user_id === u)?.display_name || t.name);
  }
  function typingText(ctx) {
    const t = typersFor(ctx.key);
    if (!t.length) return "";
    if (t.length === 1) return `${t[0]} بيكتب…`;
    if (t.length === 2) return `${t[0]} و${t[1]} بيكتبوا…`;
    return `${plural(t.length, WORDS.member)} بيكتبوا…`;
  }
  function renderTyping() {
    const el = $("typing");
    const ctx = currentCtx();
    if (!el || !ctx) return;
    const text = typingText(ctx);
    el.hidden = !text;
    el.textContent = text;
  }

  function composerHtml(ctx) {
    if (!canWrite(ctx)) {
      return `<div class="watch-note">${icon("eye")}<span>للقراءة بس.</span></div>`;
    }
    const files = chatFiles[ctx.key] || [];
    const hasText = !!(chatDrafts[ctx.key] || "").trim() || files.length;
    return `
      <div class="chat-compose">
        <div id="mention-pop" class="mention-pop" role="listbox" hidden></div>
        <div id="compose-mode" class="compose-mode" ${composeMode[ctx.key] ? "" : "hidden"}>${composeModeHtml(ctx)}</div>
        <div id="chat-pending" class="chat-pending" ${files.length ? "" : "hidden"}>${pendingChipsHtml(ctx.key)}</div>
        <div id="rec-bar" class="rec-bar" hidden>
          <span class="rec-dot" aria-hidden="true"></span><span id="rec-time">0:00</span><span class="rec-label">بيسجّل…</span>
          <span class="rec-spacer"></span>
          <button type="button" class="btn btn-ghost btn-sm" data-action="rec-cancel">إلغاء</button>
          <button type="button" class="btn btn-primary btn-sm" data-action="rec-send">${icon("send")} ابعت</button>
        </div>
        <form id="chat-form" class="chat-form" novalidate>
          <button type="button" class="icon-btn chat-tool" data-action="chat-attach" aria-label="ابعت صورة أو ملف">${icon("clip")}</button>
          <textarea id="chat-input" class="input" rows="1" maxlength="2000" placeholder="اكتب رسالة… واكتب @ عشان تذكر حد" aria-label="اكتب رسالة">${esc(chatDrafts[ctx.key] || "")}</textarea>
          <button type="button" id="mic-btn" class="btn btn-secondary chat-send" data-action="record" aria-label="سجّل رسالة صوتية" ${hasText ? "hidden" : ""}>${icon("mic")}</button>
          <button type="submit" id="send-btn" class="btn btn-primary chat-send" aria-label="ابعت" ${hasText ? "" : "hidden"}>${icon("send")}</button>
        </form>
      </div>`;
  }

  function chatBoxHtml(ctx) {
    const typing = typingText(ctx);
    return `
      <div class="chat-box${ctx.kind === "c" ? " full" : ""}">
        <div class="chat-list" id="chat-list" data-key="${ctx.key}" aria-live="polite">${messagesHtml(ctx)}</div>
        <p id="typing" class="typing" ${typing ? "" : "hidden"}>${esc(typing)}</p>
        ${composerHtml(ctx)}
      </div>`;
  }

  const nearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 80;

  let chatPending = false;
  function renderChat(forceBottom = false) {
    const list = $("chat-list");
    const ctx = currentCtx();
    if (!list || !ctx || list.dataset.key !== ctx.key) return;
    if (playing()) { chatPending = true; return; }
    chatPending = false;
    const openPick = list.querySelector(".react-pick")?.dataset.mid;
    const stick = forceBottom || nearBottom(list);
    list.innerHTML = messagesHtml(ctx);
    if (openPick) toggleReactPicker(openPick, true);
    if ($("chat-count")) $("chat-count").textContent = visibleCount(ctx) || "";
    if ($("compose-mode")) {
      $("compose-mode").hidden = !composeMode[ctx.key];
      $("compose-mode").innerHTML = composeModeHtml(ctx);
    }
    if (ctx.kind === "c") renderConvChrome();
    if (stick) list.scrollTop = list.scrollHeight;
  }

  function updateSendMode() {
    const input = $("chat-input");
    const ctx = currentCtx();
    if (!input || !ctx) return;
    const has = !!input.value.trim() || (chatFiles[ctx.key] || []).length > 0 || composeMode[ctx.key]?.kind === "edit";
    $("send-btn").hidden = !has;
    $("mic-btn").hidden = has;
  }

  function renderChatPending() {
    const el = $("chat-pending");
    const ctx = currentCtx();
    if (!el || !ctx) return;
    el.innerHTML = pendingChipsHtml(ctx.key);
    el.hidden = !(chatFiles[ctx.key] || []).length;
    updateSendMode();
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // مين قرا: بنسجّل إني شفت الرسايل لما المحادثة مفتوحة قدامي
  let readTimer;
  function maybeMarkRead() {
    const ctx = currentCtx();
    if (!ctx || !me || document.visibilityState !== "visible") return;
    if (ctx.kind === "p" && detailTab !== "chat") return;
    if (!canWrite(ctx)) return; // الأدمن بيتابع من غير ما يبان إنه شاف
    const last = msgsOf(ctx).filter((m) => !m.pending).pop();
    const rows = ctx.kind === "p" ? reads : chatReads;
    const match = (r) => (ctx.kind === "p" ? r.problem_id === ctx.id : r.group_id === ctx.id) && r.user_id === me.user_id;
    const mineRead = rows.find(match);
    if (!last || (mineRead && new Date(mineRead.last_read_at) >= new Date(last.created_at))) return;
    clearTimeout(readTimer);
    readTimer = setTimeout(async () => {
      const now = new Date().toISOString();
      const row = rows.find(match);
      if (row) row.last_read_at = now;
      else rows.push({ [ctx.kind === "p" ? "problem_id" : "group_id"]: ctx.id, user_id: me.user_id, member: myName(), last_read_at: now });
      renderList();
      renderTabs();
      if (ctx.kind === "c") renderConvList();
      try {
        await (ctx.kind === "p" ? store.markRead(ctx.id) : store.markChatRead(ctx.id));
      } catch (e) { console.warn(e); }
    }, 700);
  }

  // ---------- صفحة الشات ----------
  let chatQuery = "";
  const pinIndex = {};
  function chatLastRead(gid) {
    return chatReads.find((r) => r.group_id === gid && r.user_id === me?.user_id)?.last_read_at || null;
  }
  function chatUnread(gid) {
    if (!isParticipant(gid)) return 0;
    const g = groupById(gid);
    const since = new Date(chatLastRead(gid) ||
      (g.is_team ? me.joined_at : memberRows(gid).find((m) => m.user_id === me.user_id)?.added_at) || 0);
    return chatMsgs.filter((m) => m.group_id === gid && !m.pending && !m.deleted_at && !chatHidden.has(m.id) &&
      !isMine(m) && new Date(m.created_at) > since).length;
  }
  const totalChatUnread = () => chatGroups.reduce((s, g) => s + chatUnread(g.id), 0);
  function lastMsgOf(gid) {
    for (let k = chatMsgs.length - 1; k >= 0; k--) {
      const m = chatMsgs[k];
      if (m.group_id === gid && !chatHidden.has(m.id)) return m;
    }
    return null;
  }
  function shortWhen(iso) {
    const d = daysAgo(iso);
    if (d <= 0) return timeOnly(iso);
    if (d === 1) return "امبارح";
    return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "numeric" });
  }
  function convAvatar(g) {
    if (g.is_team) return `<span class="conv-icon team">${icon("users")}</span>`;
    const ids = memberRows(g.id).map((m) => m.user_id);
    if (!g.name && ids.length === 2) {
      const other = ids.find((u) => u !== me?.user_id) || ids[0];
      return avatar(nameOf(other));
    }
    let h = 0;
    for (const c of groupTitle(g)) h = (h * 31 + c.codePointAt(0)) >>> 0;
    return `<span class="conv-icon" style="--h:${HUES[h % HUES.length]}">${icon("chat")}</span>`;
  }
  function convRowHtml(g) {
    const last = lastMsgOf(g.id);
    const unread = chatUnread(g.id);
    const watch = !isParticipant(g.id);
    const active = route.view === "chat" && route.gid === g.id;
    const preview = last
      ? last.deleted_at ? "اتمسحت رسالة" : `${isMine(last) ? "إنت" : last.author}: ${snippet(last, 60)}`
      : g.is_team ? "كل الفريق هنا" : "لسه مفيش رسايل";
    return `
      <button type="button" class="conv-row${active ? " active" : ""}${unread ? " unread" : ""}${watch ? " watch" : ""}" data-action="open-conv" data-gid="${g.id}">
        <span class="conv-av">${convAvatar(g)}</span>
        <span class="conv-main">
          <span class="conv-top"><b class="conv-name">${esc(groupTitle(g))}</b>${last ? `<time>${esc(shortWhen(last.created_at))}</time>` : ""}</span>
          <span class="conv-bottom"><span class="conv-last">${esc(preview)}</span>${unread ? `<span class="sb-unread">${unread}</span>` : ""}</span>
        </span>
      </button>`;
  }
  function convListHtml() {
    if (!chatGroups.length) return `<p class="sb-empty">${chatError || "بيحمّل…"}</p>`;
    const byRecent = (a, b) => (b.is_team - a.is_team) ||
      (new Date(lastMsgOf(b.id)?.created_at || b.created_at) - new Date(lastMsgOf(a.id)?.created_at || a.created_at));
    const mine = chatGroups.filter((g) => isParticipant(g.id)).sort(byRecent);
    const watched = showAdmin() ? chatGroups.filter((g) => !isParticipant(g.id)).sort(byRecent) : [];
    return mine.map(convRowHtml).join("") + (watched.length ? `
      <details class="watch-group" ${watched.some((g) => route.gid === g.id) ? "open" : ""}>
        <summary>${icon("eye")} محادثات تانية · ${watched.length}</summary>
        ${watched.map(convRowHtml).join("")}
      </details>` : "");
  }
  function markQuery(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return safe;
    return esc(text.slice(0, i)) + `<mark>${esc(text.slice(i, i + q.length))}</mark>` + esc(text.slice(i + q.length));
  }
  function searchResultsHtml() {
    const q = chatQuery.trim().toLowerCase();
    const hits = chatMsgs.filter((m) => !m.deleted_at && !m.pending && !chatHidden.has(m.id) && groupById(m.group_id) &&
      [m.body, m.author, ...(m.attachments || []).map((a) => a.name)].some((f) => (f || "").toLowerCase().includes(q)))
      .slice(-60).reverse();
    if (!hits.length) return `<p class="sb-empty">مفيش رسايل فيها "${esc(chatQuery.trim())}".</p>`;
    return hits.map((m) => `
      <button type="button" class="search-hit" data-action="open-hit" data-gid="${m.group_id}" data-mid="${m.id}">
        <span class="hit-top"><b>${esc(groupTitle(groupById(m.group_id)))}</b><time>${esc(shortWhen(m.created_at))}</time></span>
        <span class="hit-text"><b>${esc(m.author)}:</b> ${markQuery(m.body || attLabel(m), q)}</span>
      </button>`).join("");
  }
  function renderConvList() {
    const el = $("conv-list");
    if (el) el.innerHTML = chatQuery.trim() ? searchResultsHtml() : convListHtml();
  }
  function pinnedOf(gid) {
    return msgsOf(ctxOf("c", gid)).filter((m) => m.pinned_at && !m.deleted_at)
      .sort((a, b) => new Date(b.pinned_at) - new Date(a.pinned_at));
  }
  function pinBarHtml(gid) {
    const pins = pinnedOf(gid);
    if (!pins.length) return "";
    const k = (pinIndex[gid] || 0) % pins.length;
    return `<button type="button" class="pin-bar" data-action="jump-pin" data-gid="${gid}">
      ${icon("pin")}<span><b>مثبتة${pins.length > 1 ? ` · ${k + 1} من ${pins.length}` : ""}</b> ${esc(snippet(pins[k], 110))}</span></button>`;
  }
  function convSub(g) {
    if (g.is_team) return `${plural(activeRoster().length, WORDS.member)} · كل الفريق`;
    const ids = memberRows(g.id).map((m) => m.user_id);
    return ids.map((u) => (u === me?.user_id ? "إنت" : nameOf(u))).join("، ");
  }
  function convHtml(g) {
    return `
      <header class="conv-head">
        <button type="button" class="icon-btn conv-back" data-action="conv-back" aria-label="ارجع للمحادثات">
          <svg class="i" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></button>
        <span class="conv-av">${convAvatar(g)}</span>
        <div class="conv-title"><h2 id="conv-head-name">${esc(groupTitle(g))}</h2><span class="sub" id="conv-head-sub">${esc(convSub(g))}</span></div>
        ${g.is_team ? "" : `<button type="button" class="btn btn-ghost btn-sm" data-action="conv-info">${icon("users")} الأعضاء</button>`}
      </header>
      <div id="pin-wrap">${pinBarHtml(g.id)}</div>
      ${chatBoxHtml(ctxOf("c", g.id))}`;
  }
  // الأجزاء اللي بتتغير في المحادثة المفتوحة من غير ما نعيد رسم خانة الكتابة
  function renderConvChrome() {
    const g = groupById(route.gid);
    if (!g) return;
    if ($("pin-wrap")) $("pin-wrap").innerHTML = pinBarHtml(g.id);
    if ($("conv-head-name")) $("conv-head-name").textContent = groupTitle(g);
    if ($("conv-head-sub")) $("conv-head-sub").textContent = convSub(g);
    renderConvList();
  }
  function chatPageHtml() {
    const g = route.gid ? groupById(route.gid) : null;
    return `
      <section class="chat-page${g ? " has-conv" : ""}">
        <aside class="convs" aria-label="المحادثات">
          <div class="convs-head">
            <h1>الشات</h1>
            <button type="button" class="btn btn-primary btn-sm" data-action="new-conv">${icon("plus")} محادثة جديدة</button>
          </div>
          <div class="conv-search">
            ${icon("search")}
            <input id="chat-search" class="input" type="search" placeholder="دوّر في الرسايل" aria-label="دوّر في الرسايل" value="${esc(chatQuery)}" />
          </div>
          <nav id="conv-list" class="conv-list" aria-label="المحادثات">${chatQuery.trim() ? searchResultsHtml() : convListHtml()}</nav>
        </aside>
        <div class="conv">${g ? convHtml(g) : `
          <div class="conv-empty">${icon("chat")}<p>${chatGroups.length ? "اختار محادثة من القايمة، أو ابدأ محادثة جديدة." : esc(chatError || "بيحمّل…")}</p></div>`}</div>
      </section>`;
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
    const onlineCount = active.filter((r) => onlineEntry(r.display_name)?.here).length;

    const card = (r) => {
      const isMe = r.user_id === me.user_id;
      const o = onlineEntry(r.display_name);
      const on = !!o;
      const idle = on && !o?.here;
      const viewing = o?.viewing.map(findIssue).filter(Boolean)[0];
      const av = AVAILABILITY[r.availability] || AVAILABILITY.available;
      const stats = memberStats(r.display_name);
      const status = idle
        ? `<span class="m-status idle">موجود، بس الموقع مش قدامه دلوقتي</span>`
        : on
        ? `<span class="m-status on">فاتح دلوقتي${viewing ? ` · بيبص على <a href="#p${viewing.id}">«${esc(viewing.title)}»</a>` : ""}</span>`
        : `<span class="m-status">آخر ظهور ${esc(ago(lastSeenOf(r)))}</span>`;
      return `
        <article class="member${on ? " online" : ""}">
          <div class="member-top">
            <span class="member-av">${avatar(r.display_name)}<span class="presence-dot${idle ? " idle" : on ? " on" : ""}" aria-hidden="true"></span></span>
            <div class="member-id">
              <h3>${esc(r.display_name)}${isMe ? ' <span class="tag-sm">إنت</span>' : ""}</h3>
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
            ${showAdmin() && !isMe ? `<button type="button" class="btn btn-ghost btn-sm danger" data-action="admin-remove" data-uid="${r.user_id}" data-name="${esc(r.display_name)}">شيله من الفريق</button>` : ""}
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

    const adminPanel = !showAdmin() ? "" : `
      <section class="card admin-card" aria-labelledby="admin-title">
        <div class="card-head">
          <h2 id="admin-title">${icon("shield")} إدارة الفريق</h2>
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
      (!!onlineEntry(b.display_name)?.here - !!onlineEntry(a.display_name)?.here) || (new Date(lastSeenOf(b)) - new Date(lastSeenOf(a))));
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
              <div class="profile-actions">
                <button type="button" class="link-btn" data-action="avatar-pick">${me.avatar_path ? "غيّر الصورة" : "ضيف صورة"}</button>
                ${me.avatar_path ? `<button type="button" class="link-btn danger" data-action="avatar-remove">امسح الصورة</button>` : ""}
              </div>
            </div>
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
            <label class="switch" for="mute-on">
              <input id="mute-on" type="checkbox" ${me.muted ? "checked" : ""} />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="switch-text"><b>قفل كل الإشعارات دلوقتي</b><span class="sub">مفيش أي إشعار يوصلك على أي جهاز لحد ما ترجّعها. مختلف عن ساعات الهدوء اللي بتتحدد بالوقت.</span></span>
            </label>
          </div>

          <div class="set-row">
            <label class="switch" for="sound-on">
              <input id="sound-on" type="checkbox" ${soundOn ? "checked" : ""} />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="switch-text"><b>صوت للرسايل الجديدة</b><span class="sub">صوت بسيط مع كل رسالة توصلك وإنت فاتح الموقع، على الجهاز ده</span></span>
            </label>
          </div>
          <div class="field sub-fields" ${soundOn ? "" : "hidden"} id="sound-vol-field">
            <label for="sound-vol">مستوى الصوت</label>
            <input id="sound-vol" class="range" type="range" min="0" max="100" step="5" value="${soundVol}" />
          </div>

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
      "رسائل النقاش": visibleCount(ctxOf("p", i.id)),
    }));
    const chat = comments.filter((c) => !c.deleted_at && !c.pending).map((c) => ({
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
    const narrowScreen = window.matchMedia("(max-width: 860px)").matches;
    // الشات على الكمبيوتر بيفتح على شات الفريق على طول
    if (route.view === "chat" && !route.gid && !narrowScreen && teamGroup()) {
      route = { view: "chat", gid: teamGroup().id };
      try { history.replaceState(null, "", hashOf(route)); } catch {}
    }
    if (route.view === "chat" && route.gid && chatGroups.length && (!groupById(route.gid) || (!isParticipant(route.gid) && !showAdmin()))) {
      route = { view: "chat" };
      try { history.replaceState(null, "", hashOf(route)); } catch {}
    }
    renderTop();
    view.classList.toggle("wide", ["team", "stats"].includes(route.view));
    view.classList.toggle("narrow", route.view === "settings");
    view.classList.toggle("full", route.view === "chat");
    $("main").classList.toggle("fixed", route.view === "chat");
    const old = $("chat-list");
    const oldKey = old?.dataset.key;
    const keep = old && !nearBottom(old) ? old.scrollTop : null;
    if (route.view === "chat") {
      view.innerHTML = chatPageHtml();
      const list = $("chat-list");
      if (list) list.scrollTop = keep != null && oldKey === list.dataset.key ? keep : list.scrollHeight;
      const input = $("chat-input");
      if (input) autoGrow(input);
      if (pendingJump) { const mid = pendingJump; pendingJump = null; setTimeout(() => jumpToMessage(mid), 60); }
      maybeMarkRead();
    } else if (route.view === "new") {
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
      view.innerHTML = i ? detailHtml(i) : notFoundHtml();
      if (i) {
        renderViewers();
        const list = $("chat-list");
        if (list) list.scrollTop = keep != null && oldKey === list.dataset.key ? keep : list.scrollHeight;
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
  let pendingJump = null;
  function go(r) {
    const newKey = r.view === "issue" ? "p" + r.id : r.view === "chat" && r.gid ? "c" + r.gid : "";
    if (r.view !== "issue" || r.id !== route.id) {
      editingId = null;
      detailTab = "chat";
    }
    if (currentCtx()?.key !== newKey) {
      if (rec) stopRecording(false);
      stopTyping();
      closeMentionPop();
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

  // الرسايل اللي لسه بتتبعت بتفضل ظاهرة لحد ما توصل
  const keepPending = (rows, old) => [...(rows || []), ...old.filter((m) => m.pending)];
  async function reloadComments() {
    comments = keepPending(await soft(store.listComments, comments.filter((c) => !c.pending)), comments);
    noticeNew("p", comments);
    renderChat();
    renderList();
    renderTabs();
    maybeMarkRead();
  }
  async function reloadRoster() {
    const [r, s] = await Promise.all([soft(store.roster, roster), soft(store.settings, settings)]);
    const sig = (list) => list.map((x) => [x.user_id, x.display_name, x.active, x.availability, x.status_note].join("|")).join(",");
    const changed = sig(r || []) !== sig(roster);
    roster = r || [];
    if (s) settings = s;
    renderTabs();
    // عضو جديد بيظهر على طول في كل حتة: الفريق، واختيار المسؤول، والشات
    buildOnline();
    renderPresence();
    if (changed && ["new", "issue", "chat"].includes(route.view)) renderView();
  }
  async function reloadReactions() { reactions = await soft(store.listReactions, reactions); renderChat(); }
  async function reloadReads() { reads = await soft(store.listReads, reads); renderChat(); renderList(); renderTabs(); }
  async function reloadLinks() { links = await soft(store.listLinks, links); if (route.view === "issue") renderView(); }
  async function reloadReminders() { myReminders = await soft(store.listReminders, myReminders); if (route.view === "issue") renderView(); }

  async function reloadCommentHides() {
    const rows = await soft(store.listCommentHides, null);
    if (rows) hiddenComments = new Set(rows.map((r) => r.comment_id));
    renderChat();
    renderList();
    renderTabs();
  }

  // ---------- الشات ----------
  function afterChatChange() {
    renderChat();
    if (route.view === "chat") renderConvList();
    renderTabs();
    maybeMarkRead();
  }
  async function reloadChatMeta() {
    try {
      const [g, m] = await Promise.all([store.listChatGroups(), store.listChatMembers()]);
      chatGroups = g || [];
      chatMembers = m || [];
      chatError = "";
    } catch (e) {
      console.warn(e);
      chatError = friendlyError(e);
    }
    renderTabs();
    if (route.view === "chat") renderView();
  }
  async function reloadChatMessages() {
    chatMsgs = keepPending(await soft(store.listChatMessages, chatMsgs.filter((m) => !m.pending)), chatMsgs);
    noticeNew("c", chatMsgs);
    afterChatChange();
  }
  async function reloadChatHides() {
    const rows = await soft(store.listChatHides, null);
    if (rows) chatHidden = new Set(rows.map((r) => r.message_id));
    afterChatChange();
  }
  async function reloadChatReads() { chatReads = await soft(store.listChatReads, chatReads); afterChatChange(); }
  async function reloadChatReactions() { chatReactions = await soft(store.listChatReactions, chatReactions); renderChat(); }

  async function loadAll() {
    await reloadProblems();
    await Promise.all([reloadComments(), reloadRoster(), reloadReactions(), reloadReads(), reloadLinks(), reloadReminders(),
      reloadCommentHides(), reloadChatMeta(), reloadChatMessages(), reloadChatHides(), reloadChatReads(), reloadChatReactions()]);
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

  // ---------- صوت الرسايل الجديدة ----------
  const SOUND_KEY = "team_problems_sound";
  const SOUND_VOL_KEY = "team_problems_sound_vol";
  let soundOn = local.get(SOUND_KEY) !== "off";
  // من 0 لحد 100 على السلايدر؛ 70% دلوقتي بدل الصوت الثابت الأول اللي كان أهدى بكتير
  let soundVol = Math.min(100, Math.max(0, Number(local.get(SOUND_VOL_KEY) ?? 70) || 0));
  const soundGain = () => (soundVol / 100) * 0.6;
  let audioCtx = null;
  // المتصفح مبيسمحش بالصوت غير بعد أول دوسة في الصفحة
  function unlockAudio() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {}
  }
  let lastDing = 0;
  function playDing(peak) {
    if (!audioCtx || peak < 0.003) return;
    try {
      const t = audioCtx.currentTime;
      [[880, 0], [1320, 0.12]].forEach(([f, d]) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(peak, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.25);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + d);
        o.stop(t + d + 0.3);
      });
    } catch {}
  }
  function ding() {
    if (!soundOn || Date.now() - lastDing < 1200) return;
    lastDing = Date.now();
    playDing(soundGain());
  }
  // معاينة وإنت بتحرّك السلايدر، من غير ما تستنى رسالة جديدة
  let lastPreview = 0;
  function previewDing() {
    if (Date.now() - lastPreview < 250) return;
    lastPreview = Date.now();
    playDing(soundGain());
  }
  // بنرن مرة لما توصل رسالة جديدة من حد تاني في أي محادثة أنا فيها
  const seenMsgs = { p: null, c: null };
  function noticeNew(kind, rows) {
    const ids = new Set((rows || []).map((m) => m.id));
    const before = seenMsgs[kind];
    seenMsgs[kind] = ids;
    if (!before) return;
    const fresh = (rows || []).some((m) => !before.has(m.id) && !m.pending && !m.deleted_at && !isMine(m) &&
      Date.now() - new Date(m.created_at) < 5 * 60e3 && (kind === "p" || isParticipant(m.group_id)));
    if (fresh) ding();
  }

  // ---------- الرسايل: إرسال ومرفقات ----------
  async function addChatFiles(files) {
    const ctx = currentCtx();
    if (!ctx || !canWrite(ctx)) return;
    const list = (chatFiles[ctx.key] ||= []);
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

  function removePending(fileKey) {
    const ctx = currentCtx();
    if (!ctx) return;
    const list = chatFiles[ctx.key] || [];
    const f = list.find((x) => x.key === fileKey);
    if (f) URL.revokeObjectURL(f.url);
    chatFiles[ctx.key] = list.filter((x) => x.key !== fileKey);
    renderChatPending();
  }

  function setComposeMode(ctx, mode) {
    const input = $("chat-input");
    const prev = composeMode[ctx.key];
    // لما نخرج من التعديل، النص اللي كان مكتوب قبله بيرجع
    if (prev?.kind === "edit" && input) {
      input.value = prev.draft || "";
      chatDrafts[ctx.key] = input.value;
    }
    if (mode) composeMode[ctx.key] = mode;
    else delete composeMode[ctx.key];
    if (mode?.kind === "edit" && input) {
      const m = findMsg(ctx, mode.mid);
      mode.draft = prev?.kind === "edit" ? prev.draft : input.value;
      input.value = m?.body || "";
    }
    if ($("compose-mode")) {
      $("compose-mode").hidden = !mode;
      $("compose-mode").innerHTML = composeModeHtml(ctx);
    }
    if (input) {
      autoGrow(input);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    updateSendMode();
  }

  const msgList = (ctx) => (ctx.kind === "p" ? comments : chatMsgs);
  function setMsgList(ctx, list) {
    if (ctx.kind === "p") comments = list;
    else chatMsgs = list;
  }

  async function sendMessage(voice = null) {
    const ctx = currentCtx();
    if (!ctx || !canWrite(ctx)) return;
    const input = $("chat-input");
    const mode = voice ? null : composeMode[ctx.key];
    const text = voice ? "" : (input?.value || "").trim();
    if (mode?.kind === "edit") return saveEditedMessage(ctx, mode.mid, text);
    const files = voice ? [voice] : [...(chatFiles[ctx.key] || [])];
    if (!text && !files.length) return;
    const replyTo = mode?.kind === "reply" ? mode.mid : null;
    if (!voice) {
      input.value = "";
      chatDrafts[ctx.key] = "";
      chatFiles[ctx.key] = [];
      delete composeMode[ctx.key];
      autoGrow(input);
      renderChatPending();
      closeMentionPop();
    }
    stopTyping();
    const temp = {
      id: "tmp-" + uid(), author: myName(), created_by: me.user_id, body: text, reply_to: replyTo,
      attachments: files.map((f) => ({ kind: f.kind, name: f.name, size: f.size, url: f.url, duration: f.duration })),
      created_at: new Date().toISOString(), pending: true,
      [ctx.kind === "p" ? "problem_id" : "group_id"]: ctx.id,
    };
    msgList(ctx).push(temp);
    renderChat(true);
    const uploaded = [];
    try {
      for (const f of files) uploaded.push(await store.uploadChatFile(f));
      const row = { author: myName(), body: text, attachments: uploaded };
      if (replyTo) row.reply_to = replyTo;
      if (ctx.kind === "p") await store.addComment({ problem_id: ctx.id, ...row });
      else await store.addChatMessage({ group_id: ctx.id, ...row });
      setMsgList(ctx, msgList(ctx).filter((m) => m !== temp));
      await (ctx.kind === "p" ? reloadComments() : reloadChatMessages());
      renderChat(true);
    } catch (err) {
      console.error(err);
      setMsgList(ctx, msgList(ctx).filter((m) => m !== temp));
      store.removeFiles(CHAT_BUCKET, uploaded.map((a) => a.path));
      renderChat();
      if (!voice && currentCtx()?.key === ctx.key) {
        const box = $("chat-input");
        if (box && !box.value) box.value = text;
        chatFiles[ctx.key] = [...files, ...(chatFiles[ctx.key] || [])];
        if (replyTo) composeMode[ctx.key] = { kind: "reply", mid: replyTo };
        renderChatPending();
        renderChat();
      }
      toast("مقدرتش أبعت الرسالة: " + friendlyError(err));
    }
  }

  async function saveEditedMessage(ctx, mid, text) {
    const m = findMsg(ctx, mid);
    if (!m) return setComposeMode(ctx, null);
    if (!text && !(m.attachments || []).length) return toast("الرسالة مينفعش تبقى فاضية. لو عايز تشيلها استخدم «امسح».");
    const input = $("chat-input");
    const draft = composeMode[ctx.key]?.draft || "";
    delete composeMode[ctx.key];
    if (input) { input.value = draft; chatDrafts[ctx.key] = draft; autoGrow(input); }
    renderChat();
    updateSendMode();
    if (text === (m.body || "")) return;
    const old = { body: m.body, edited_at: m.edited_at };
    Object.assign(m, { body: text, edited_at: new Date().toISOString() });
    renderChat();
    try {
      await (ctx.kind === "p" ? store.updateComment(mid, { body: text }) : store.updateChatMessage(mid, { body: text }));
      toast("اتعدلت الرسالة");
    } catch (err) {
      console.error(err);
      Object.assign(m, old);
      renderChat();
      toast("مقدرتش أعدّل الرسالة: " + friendlyError(err));
    }
    await (ctx.kind === "p" ? reloadComments() : reloadChatMessages());
  }

  // ---------- أوامر الرسالة (⋯) ----------
  function closeMsgMenus() {
    document.querySelectorAll(".msg-menu").forEach((p) => p.remove());
  }
  function openMsgMenu(mid) {
    const ctx = currentCtx();
    const m = ctx && findMsg(ctx, mid);
    const open = document.querySelector(`.msg-menu[data-mid="${mid}"]`);
    closeMsgMenus();
    document.querySelectorAll(".react-pick").forEach((p) => p.remove());
    if (!m || open) return;
    const write = canWrite(ctx);
    const deleted = !!m.deleted_at;
    const mine = isMine(m);
    const items = [];
    if (!deleted && write) items.push(["reply", "reply", "رد"]);
    if (!deleted && mine && write) items.push(["edit", "edit", "عدّل"]);
    if (!deleted && ctx.kind === "c" && write) items.push(["pin", "pin", m.pinned_at ? "شيل التثبيت" : "ثبّت"]);
    if (!deleted && m.body) items.push(["copy", "copy", "انسخ النص"]);
    if (!deleted && ctx.kind === "c") {
      items.push(["to-new", "plus", "اعمل منها مشكلة جديدة"]);
      items.push(["to-problem", "link", "انقلها لنقاش مشكلة"]);
    }
    if (mine && !deleted && !m.pending) items.push(["info", "check", "مين شافها"]);
    items.push(["hide", "eyeOff", "امسح من عندي"]);
    if (!deleted && (mine || showAdmin())) items.push(["delete-all", "trash", "امسح من عند الكل", "danger"]);
    const wrap = document.querySelector(`.msg[data-mid="${mid}"] .react-add-wrap`);
    if (!wrap) return;
    wrap.insertAdjacentHTML("beforeend", `<div class="msg-menu menu-list" data-mid="${mid}" role="menu">${items.map(([act, ic, label, cls]) =>
      `<button type="button" role="menuitem" class="${cls || ""}" data-action="msg-act" data-act="${act}" data-mid="${mid}">${icon(ic)} ${label}</button>`).join("")}</div>`);
    // لو مفيش مكان فوق الرسالة، القايمة تفتح لتحت
    const menu = wrap.querySelector(".msg-menu");
    const list = $("chat-list");
    if (menu && list && menu.getBoundingClientRect().top < list.getBoundingClientRect().top + 4) menu.classList.add("down");
  }

  function seenInfo(ctx, m) {
    const s = seenBy(ctx, m);
    if (!s.total) return "مفيش حد تاني في المحادثة دي.";
    if (!s.seen.length) return `لسه محدش شافها · مستنيين ${s.waiting.join("، ")}`;
    if (!s.waiting.length) return `الكل شافها: ${s.seen.join("، ")}`;
    return `شافها: ${s.seen.join("، ")} · لسه: ${s.waiting.join("، ")}`;
  }

  function jumpToMessage(mid) {
    const el = document.querySelector(`#chat-list .msg[data-mid="${mid}"]`);
    if (!el) return toast("الرسالة دي مش ظاهرة عندك.");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1800);
  }

  async function msgAction(act, mid) {
    const ctx = currentCtx();
    const m = ctx && findMsg(ctx, mid);
    closeMsgMenus();
    if (!m) return;
    const where = ctx.kind === "p" ? `نقاش #${ctx.id}` : groupTitle(groupById(ctx.id));
    switch (act) {
      case "reply": return setComposeMode(ctx, { kind: "reply", mid: m.id });
      case "edit": return setComposeMode(ctx, { kind: "edit", mid: m.id });
      case "copy": {
        const onFail = () => toast("مقدرتش أنسخ النص.");
        try { navigator.clipboard.writeText(m.body).then(() => toast("اتنسخ النص"), onFail); } catch { onFail(); }
        return;
      }
      case "info": return toast(seenInfo(ctx, m));
      case "pin": {
        const pinned_at = m.pinned_at ? null : new Date().toISOString();
        const old = m.pinned_at;
        m.pinned_at = pinned_at;
        renderChat();
        try {
          await store.updateChatMessage(m.id, { pinned_at });
          toast(pinned_at ? "اتثبتت الرسالة فوق المحادثة" : "اتشال التثبيت");
        } catch (err) {
          m.pinned_at = old;
          renderChat();
          toast("مقدرتش أثبّت الرسالة: " + friendlyError(err));
        }
        return reloadChatMessages();
      }
      case "to-new": {
        const first = (m.body || attLabel(m) || "رسالة من الشات").split("\n")[0].trim();
        Object.assign(draft, {
          title: first.slice(0, 120),
          details: `${m.body || ""}\n\n— من ${where}، كتبها ${m.author}`.trim(),
        });
        go({ view: "new" });
        return toast("جهّزتلك المشكلة من الرسالة. راجعها ودوس «سجّل المشكلة».");
      }
      case "to-problem": return openForward(ctx, m);
      case "hide": {
        const set = ctx.kind === "p" ? hiddenComments : chatHidden;
        set.add(m.id);
        renderChat();
        renderList();
        renderTabs();
        if (ctx.kind === "c") renderConvList();
        try {
          await (ctx.kind === "p" ? store.hideComment(m.id) : store.hideChatMessage(m.id));
          toast("اتمسحت من عندك بس");
        } catch (err) {
          set.delete(m.id);
          renderChat();
          toast("مقدرتش أمسح الرسالة: " + friendlyError(err));
        }
        return;
      }
      case "delete-all": {
        if (!confirm("تمسح الرسالة دي من عند الكل؟ هيظهر مكانها «اتمسحت الرسالة دي».")) return;
        const paths = (m.attachments || []).map((a) => a.path);
        try {
          await (ctx.kind === "p" ? store.deleteCommentForAll(m.id) : store.deleteChatForAll(m.id));
          store.removeFiles(CHAT_BUCKET, paths);
          toast("اتمسحت الرسالة من عند الكل");
        } catch (err) {
          console.error(err);
          toast("مقدرتش أمسح الرسالة: " + friendlyError(err));
        }
        return ctx.kind === "p" ? reloadComments() : reloadChatMessages();
      }
    }
  }

  // ---------- رسالة صوتية ----------
  async function startRecording() {
    const ctx = currentCtx();
    if (rec || !ctx || !canWrite(ctx)) return;
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
    rec = { mr, chunks, stream, start: Date.now(), key: ctx.key, send: false };
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
      if (!send || secs < 0.8 || !r.chunks.length || currentCtx()?.key !== r.key) return;
      const type = (r.mr.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(r.chunks, { type });
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      sendMessage({ key: uid(), kind: "audio", blob, name: `رسالة-صوتية.${ext}`, type, size: blob.size, url: URL.createObjectURL(blob), duration: secs });
    };
    try { r.mr.stop(); } catch { r.mr.onstop(); }
    if (viewPending) setTimeout(() => renderView(), 50);
  }

  // ---------- الردود السريعة ----------
  function toggleReactPicker(mid, forceOpen = false) {
    closeMsgMenus();
    document.querySelectorAll(".react-pick").forEach((p) => { if (p.dataset.mid !== String(mid) || !forceOpen) p.remove(); });
    const wrap = document.querySelector(`.msg[data-mid="${mid}"] .react-add-wrap`);
    if (!wrap || (!forceOpen && wrap.querySelector(".react-pick"))) return;
    if (wrap.querySelector(".react-pick")) return;
    wrap.insertAdjacentHTML("beforeend", `<div class="react-pick" data-mid="${mid}" role="menu">${EMOJIS.map((e) =>
      `<button type="button" role="menuitem" data-action="react" data-mid="${mid}" data-emoji="${e}">${e}</button>`).join("")}</div>`);
  }

  async function toggleReaction(mid, emoji) {
    document.querySelectorAll(".react-pick").forEach((p) => p.remove());
    const ctx = currentCtx();
    if (!ctx || !canWrite(ctx)) return;
    const id = Number(mid);
    const isP = ctx.kind === "p";
    const list = isP ? reactions : chatReactions;
    const idKey = isP ? "comment_id" : "message_id";
    const mine = list.find((r) => r[idKey] === id && r.emoji === emoji && r.user_id === me.user_id);
    const next = mine ? list.filter((r) => r !== mine) : [...list, { [idKey]: id, user_id: me.user_id, member: myName(), emoji }];
    if (isP) reactions = next;
    else chatReactions = next;
    renderChat();
    try {
      if (isP) await (mine ? store.removeReaction(id, emoji) : store.addReaction(id, emoji));
      else await (mine ? store.removeChatReaction(id, emoji) : store.addChatReaction(id, emoji));
    } catch (err) {
      console.error(err);
      toast("مقدرتش أسجّل الرد: " + friendlyError(err));
    }
    isP ? reloadReactions() : reloadChatReactions();
  }

  // ---------- مين بيكتب ----------
  let typingKey = null;
  let typingSentAt = 0;
  let typingTimer;
  function noteTyping() {
    const ctx = currentCtx();
    if (!ctx || !canWrite(ctx)) return;
    const now = Date.now();
    if (typingKey !== ctx.key || now - typingSentAt > 2500) {
      typingKey = ctx.key;
      typingSentAt = now;
      trackPresence();
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 4000);
  }
  function stopTyping() {
    clearTimeout(typingTimer);
    if (!typingKey) return;
    typingKey = null;
    typingSentAt = 0;
    trackPresence();
  }

  // ---------- المنشن @ ----------
  let mentionState = null; // { start, items, index }
  function updateMentionPop() {
    const input = $("chat-input");
    const pop = $("mention-pop");
    const ctx = currentCtx();
    if (!input || !pop || !ctx) return;
    const before = input.value.slice(0, input.selectionStart);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    if (!m) return closeMentionPop();
    const q = m[2].toLowerCase();
    const names = (ctx.kind === "c" ? groupMemberIds(ctx.id) : activeRoster().map((r) => r.user_id))
      .map((u) => nameOf(u)).filter((n) => !same(n, myName()));
    const items = [...(names.length > 1 ? ["الكل"] : []), ...names].filter((n) => n.toLowerCase().includes(q)).slice(0, 7);
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
        data-action="mention-pick" data-name="${esc(n)}">${n === "الكل" ? `<span class="conv-icon team sm">${icon("users")}</span>` : avatar(n, "sm")}
        <span>${esc(n)}</span>${n === "الكل" ? `<span class="sub">يوصل لكل اللي هنا</span>` : ""}</button>`).join("");
  }
  function closeMentionPop() {
    mentionState = null;
    const pop = $("mention-pop");
    if (pop) { pop.hidden = true; pop.innerHTML = ""; }
  }
  function pickMention(name) {
    const input = $("chat-input");
    const ctx = currentCtx();
    if (!input || !mentionState || !ctx) return;
    const v = input.value;
    const insert = `@${name} `;
    input.value = v.slice(0, mentionState.start) + insert + v.slice(mentionState.end);
    const pos = mentionState.start + insert.length;
    closeMentionPop();
    input.focus();
    input.setSelectionRange(pos, pos);
    chatDrafts[ctx.key] = input.value;
    updateSendMode();
  }

  // ---------- محادثة جديدة، والأعضاء، ونقل رسالة لمشكلة ----------
  function openNewConv() {
    const people = activeRoster().filter((r) => r.user_id !== me.user_id);
    if (!people.length) return toast("لسه مفيش حد تاني في الفريق.");
    openModal(`
      <h2>${icon("chat")} محادثة جديدة</h2>
      <p>اختار واحد عشان تكلّمه لوحده، أو أكتر من واحد عشان تعمل مجموعة.</p>
      <div class="pick-list" id="conv-pick">${people.map((r) => `
        <label class="pick">
          <input type="checkbox" value="${r.user_id}" />
          ${avatar(r.display_name, "sm")}<span class="pick-name">${esc(r.display_name)}</span>
          ${r.availability && r.availability !== "available" ? `<span class="av-chip ${AVAILABILITY[r.availability].cls}">${AVAILABILITY[r.availability].label}</span>` : ""}
        </label>`).join("")}</div>
      <div class="field" id="conv-name-field" hidden>
        <label for="conv-name">اسم المجموعة <span class="optional">اختياري</span></label>
        <input id="conv-name" class="input" type="text" maxlength="60" placeholder="مثلًا: فريق الدعم" />
      </div>
      <p class="field-error" id="conv-error" hidden></p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-modal="close">إلغاء</button>
        <button type="button" class="btn btn-primary" data-modal="create">ابدأ المحادثة</button>
      </div>`,
      async (a, btn) => {
        if (a !== "create") return;
        const ids = [...document.querySelectorAll("#conv-pick input:checked")].map((x) => x.value);
        const err = $("conv-error");
        if (!ids.length) { err.hidden = false; err.textContent = "اختار حد على الأقل."; return; }
        const name = ids.length > 1 ? $("conv-name").value.trim() : "";
        // شات خاص مع نفس الشخص موجود قبل كده؟ نفتحه بدل ما نعمل واحد جديد
        if (ids.length === 1) {
          const existing = chatGroups.find((g) => !g.is_team && !g.name && isParticipant(g.id) &&
            memberRows(g.id).length === 2 && memberRows(g.id).some((m) => m.user_id === ids[0]));
          if (existing) { closeModal(); return go({ view: "chat", gid: existing.id }); }
        }
        btn.disabled = true;
        try {
          const gid = await store.createGroup(name, ids);
          closeModal();
          await reloadChatMeta();
          go({ view: "chat", gid: Number(gid) });
          toast(ids.length > 1 ? "اتعملت المجموعة" : "اتفتحت المحادثة");
        } catch (e) {
          btn.disabled = false;
          err.hidden = false;
          err.textContent = friendlyError(e);
        }
      });
    $("conv-pick").addEventListener("change", () => {
      $("conv-name-field").hidden = document.querySelectorAll("#conv-pick input:checked").length < 2;
    });
  }

  function openConvInfo(gid) {
    const g = groupById(gid);
    if (!g || g.is_team) return;
    const canManage = g.created_by === me.user_id || showAdmin();
    const part = isParticipant(gid);
    const ids = memberRows(gid).map((m) => m.user_id);
    const others = activeRoster().filter((r) => !ids.includes(r.user_id));
    openModal(`
      <h2>${icon("users")} ${esc(groupTitle(g))}</h2>
      ${canManage ? `
        <div class="field">
          <label for="conv-rename">اسم المجموعة</label>
          <div class="inline">
            <input id="conv-rename" class="input" type="text" maxlength="60" value="${esc(g.name || "")}" placeholder="من غير اسم" />
            <button type="button" class="btn btn-secondary" data-modal="rename">احفظ</button>
          </div>
        </div>` : ""}
      <div class="modal-list">
        <h3>الأعضاء · ${ids.length}</h3>
        <ul>${ids.map((u) => `
          <li>${avatar(nameOf(u), "sm")}<span>${esc(nameOf(u))}${u === me.user_id ? ' <span class="tag-sm">إنت</span>' : ""}${u === g.created_by ? ' <span class="tag-sm">عمل المجموعة</span>' : ""}</span>
            ${canManage && u !== me.user_id ? `<button type="button" class="link-btn danger-link" data-modal="remove" data-uid="${u}">شيله</button>` : ""}</li>`).join("")}</ul>
      </div>
      ${part && others.length ? `
        <div class="field">
          <label for="conv-add">ضيف حد للمجموعة</label>
          <div class="inline">
            <select id="conv-add" class="input">${others.map((r) => `<option value="${r.user_id}">${esc(r.display_name)}</option>`).join("")}</select>
            <button type="button" class="btn btn-secondary" data-modal="add">ضيف</button>
          </div>
        </div>` : ""}
      <div class="dialog-actions">
        ${part ? `<button type="button" class="btn btn-ghost danger" data-modal="leave">اخرج من المحادثة</button>` : ""}
        <button type="button" class="btn btn-primary" data-modal="close">تمام</button>
      </div>`,
      async (a, btn) => {
        if (a === "rename") {
          await run(() => store.renameGroup(gid, $("conv-rename").value.trim()), "اتغيّر الاسم");
        } else if (a === "remove") {
          if (!confirm(`تشيل ${nameOf(btn.dataset.uid)} من المحادثة؟`)) return;
          await run(() => store.removeGroupMember(gid, btn.dataset.uid), "اتشال من المحادثة");
        } else if (a === "add") {
          await run(() => store.addGroupMember(gid, $("conv-add").value), "اتضاف للمحادثة");
        } else if (a === "leave") {
          if (!confirm("تخرج من المحادثة دي؟ مش هتشوف رسايلها تاني إلا لو حد ضافك.")) return;
          const ok = await run(() => store.removeGroupMember(gid, me.user_id), "خرجت من المحادثة");
          if (ok) {
            closeModal();
            await reloadChatMeta();
            return go({ view: "chat" });
          }
          return;
        } else return;
        await reloadChatMeta();
        if (groupById(gid)) openConvInfo(gid);
        else closeModal();
      });
  }

  function openForward(ctx, m) {
    const where = groupTitle(groupById(ctx.id));
    const results = (q) => {
      const s = q.trim().toLowerCase().replace("#", "");
      return [...issues]
        .sort((a, b) => (isOpen(b) - isOpen(a)) || new Date(b.created_at) - new Date(a.created_at))
        .filter((x) => !s || String(x.id) === s || x.title.toLowerCase().includes(s))
        .slice(0, 8)
        .map((x) => `
          <li class="link-row">
            <span class="dot${x.status === "solved" ? " solved" : x.status === "in_progress" ? " working" : ""}"></span>
            <span class="ref">#${x.id}</span><span class="link-title">${esc(x.title)}</span>
            <span class="link-btns"><button type="button" class="btn btn-secondary btn-sm" data-modal="fwd" data-id="${x.id}">انقلها هنا</button></span>
          </li>`).join("") || `<li class="none">مفيش مشاكل مطابقة.</li>`;
    };
    openModal(`
      <h2>${icon("link")} انقل الرسالة لنقاش مشكلة</h2>
      <p>هتتنسخ في نقاش المشكلة اللي تختارها، ومعاها اسم اللي كتبها.</p>
      <input id="fwd-search" class="input" type="search" placeholder="دوّر باسم المشكلة أو رقمها" autocomplete="off" />
      <ul id="fwd-results" class="link-results">${results("")}</ul>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-modal="close">إلغاء</button></div>`,
      async (a, btn) => {
        if (a !== "fwd") return;
        const pid = Number(btn.dataset.id);
        const files = (m.attachments || []).map((x) => x.name).filter(Boolean);
        const body = [`↪️ من ${where}، كتبها ${m.author}:`, m.body, files.length ? `📎 ${files.join("، ")}` : ""]
          .filter(Boolean).join("\n").slice(0, 2000);
        btn.disabled = true;
        const ok = await run(() => store.addComment({ problem_id: pid, author: myName(), body, attachments: [] }), `اتنقلت لنقاش #${pid}`);
        if (ok) { closeModal(); reloadComments(); }
        else btn.disabled = false;
      });
    const search = $("fwd-search");
    search.addEventListener("input", () => { $("fwd-results").innerHTML = results(search.value); });
    setTimeout(() => search.focus(), 50);
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

  // لو حد تاني سبق وحوّل نفس الرسالة، بيرجعلنا النص من الكاش على طول من غير Gemini
  async function transcribeAudio(path) {
    if (transcripts[path]) return;
    transcripts[path] = { loading: true };
    renderChat();
    try {
      const cached = await soft(() => store.getTranscript(path), null);
      if (cached?.text) { transcripts[path] = { text: cached.text }; return renderChat(); }
      const { data } = await db.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch(`${cfg.SUPABASE_URL}/functions/v1/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: "transcribe", path }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.text) {
        const why = {
          no_key: "خاصية التحويل محتاجة مفتاح Gemini يتحط في Supabase الأول.",
          not_member: "إنت مش ضمن الفريق دلوقتي.",
          not_found: "الملف الصوتي ده مش موجود.",
          too_big: "الرسالة الصوتية دي كبيرة زيادة عن اللي ممكن نحوّله.",
          gemini: "Gemini مردّش. جرّب تاني بعد شوية.",
        }[out.error] || "مقدرتش أحوّلها دلوقتي. جرّب تاني بعد شوية.";
        transcripts[path] = { error: why };
      } else {
        transcripts[path] = { text: out.text };
      }
    } catch (e) {
      console.error(e);
      transcripts[path] = { error: "مقدرتش أوصل لخدمة التحويل. اتأكد من النت." };
    }
    renderChat();
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
    await healPush();
    nudgePush();
  }

  // الإذن كان موافق عليه قبل كده على الجهاز ده، بس الاشتراك ضاع (نادر، بيحصل لو المتصفح مسح بيانات قديمة):
  // نرجّعه من غير أي بوب-أب، لأن الإذن نفسه موافق عليه فعلًا
  async function healPush() {
    if (!PUSH_KEY || Notification?.permission !== "granted") return resyncPush();
    try {
      const reg = swReg || (await navigator.serviceWorker.ready);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(PUSH_KEY) });
      await savePushSub(sub);
    } catch (e) { console.warn(e); }
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
  // نفس الحالة اللي سايبها بيها آخر مرة (على أي جهاز)، عشان لو دخل من جهاز جديد نعرف نفكّره
  function savePushWanted(on) {
    if (!me || me.push_wanted === on) return;
    me.push_wanted = on;
    store.updateMe({ push_wanted: on }).catch((e) => console.warn(e));
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
      savePushWanted(true);
      notice("");
      toast("اتفعّلت الإشعارات على الجهاز ده");
    } catch (err) {
      console.error(err);
      toast("مقدرتش أفعّل الإشعارات: " + friendlyError(err));
    }
    updatePushUI();
  }

  // quiet=true بس لما نقفل الاشتراك من غير قرار العضو (تسجيل خروج)، فمش بنلمس رغبته العامة
  async function disablePush({ quiet = false } = {}) {
    const sub = await currentSub().catch(() => null);
    if (sub) {
      try { await db.rpc("delete_push_subscription", { p_endpoint: sub.endpoint }); } catch (e) { console.warn(e); }
      await sub.unsubscribe().catch(() => {});
    }
    if (!quiet) {
      savePushWanted(false);
      toast("وقفت الإشعارات على الجهاز ده");
      updatePushUI();
    }
  }

  // بيفكّر العضو لحد ما يفعّل الإشعارات على كل جهاز بيدخل منه، لو هو أصلًا فعّلها على جهاز تاني
  const NUDGE_AGAIN_MS = 24 * 3600e3;
  async function nudgePush() {
    const st = await pushStatus();
    if (st !== "off" && st !== "ios-install") return;
    const persistent = !!me?.push_wanted;
    if (!persistent && local.get(NUDGE_KEY)) return;
    if (persistent) {
      const last = Number(local.get(NUDGE_AGAIN_KEY) || 0);
      if (Date.now() - last < NUDGE_AGAIN_MS) return;
      local.set(NUDGE_AGAIN_KEY, String(Date.now()));
    }
    notice(persistent
      ? "إنت مفعّل الإشعارات على جهاز تاني بنفس حسابك. فعّلها هنا كمان عشان توصلك على الجهاز ده."
      : "فعّل الإشعارات عشان يوصلك جديد الفريق على الجهاز ده حتى لو الموقع مقفول.", {
      action: "فعّلها",
      onAction: () => go({ view: "settings" }),
      onClose: () => { if (!persistent) local.set(NUDGE_KEY, "dismissed"); },
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
    if (target === "chat" || route.view === "chat") return addChatFiles(list);
    const images = list.filter((f) => /^image\//.test(f.type));
    if (!images.length) return toast("الملف ده مش صورة.");
    if (route.view === "new") addDraftImages(images);
    else if (route.view === "issue" && findIssue(route.id)) addImagesToIssue(images);
  }

  function bindEvents() {
    $("new-btn").addEventListener("click", () => { go({ view: "new" }); $("title")?.focus(); });
    // 3 دوسات ورا بعض (بتشتغل على الموبايل كمان)
    let brandTaps = [];
    document.querySelector(".sb-head .brand").addEventListener("click", () => {
      const now = Date.now();
      brandTaps = [...brandTaps.filter((t) => now - t < 900), now];
      if (brandTaps.length < 3 || !isAdmin) return;
      brandTaps = [];
      adminMode = !adminMode;
      try { sessionStorage.setItem("tp_x", adminMode ? "1" : ""); } catch {}
      toast(adminMode ? "✓" : "✕");
      renderView(true);
    });
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
        const ctx = currentCtx();
        if (ctx && composeMode[ctx.key]?.kind !== "edit") chatDrafts[ctx.key] = t.value;
        autoGrow(t);
        updateSendMode();
        updateMentionPop();
        if (t.value.trim()) noteTyping();
        else stopTyping();
      }
      if (id === "chat-search") {
        chatQuery = t.value;
        renderConvList();
      }
      if (id === "sound-vol") {
        soundVol = Number(t.value) || 0;
        local.set(SOUND_VOL_KEY, String(soundVol));
        unlockAudio();
        previewDing();
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
      if (t.id === "sound-on") {
        soundOn = t.checked;
        local.set(SOUND_KEY, soundOn ? "on" : "off");
        $("sound-vol-field").hidden = !soundOn;
        if (soundOn) { unlockAudio(); lastDing = 0; ding(); }
      }
      if (t.id === "mute-on") saveSetting({ muted: t.checked }, t.checked ? "قفلت كل الإشعارات دلوقتي" : "رجّعت الإشعارات تاني");
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
        if (e.key === "Escape" && currentCtx() && composeMode[currentCtx().key]) {
          e.preventDefault();
          return setComposeMode(currentCtx(), null);
        }
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
      }
    });

    view.addEventListener("submit", (e) => {
      e.preventDefault();
      if (e.target.id === "issue-form") createIssue();
      if (e.target.id === "resolve-form") resolveIssue(e.target);
      if (e.target.id === "edit-form") saveEdit();
      if (e.target.id === "chat-form") sendMessage();
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
        case "avatar-pick": return $("avatar-input").click();
        case "avatar-remove": return removeAvatar();
        case "unpick": return removeDraftImage(btn.dataset.key);
        case "view-image":
          return openLightbox({ srcs: imagesOf(i).map(imageUrl), refs: imagesOf(i), index: Number(btn.dataset.index), issueId: route.id, deletable: true });
        case "chat-image": {
          const ctx = currentCtx();
          const c = ctx && findMsg(ctx, btn.dataset.mid);
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
        case "transcribe": return transcribeAudio(btn.dataset.path);
        case "ai-close": delete aiCache[route.id]; $("ai-card").hidden = true; return;
        case "chat-attach": return $("chat-file-input").click();
        case "remove-pending": return removePending(btn.dataset.key);
        case "record": return startRecording();
        case "rec-cancel": return stopRecording(false);
        case "rec-send": return stopRecording(true);
        case "react-open": return toggleReactPicker(btn.dataset.mid);
        case "react": return toggleReaction(btn.dataset.mid, btn.dataset.emoji);
        // أوامر الرسالة
        case "msg-menu": return openMsgMenu(btn.dataset.mid);
        case "msg-act": return msgAction(btn.dataset.act, btn.dataset.mid);
        case "compose-cancel": return currentCtx() && setComposeMode(currentCtx(), null);
        case "ticks": {
          const ctx = currentCtx();
          const m = ctx && findMsg(ctx, btn.dataset.mid);
          return m && toast(seenInfo(ctx, m));
        }
        case "jump": return jumpToMessage(btn.dataset.mid);
        // الشات
        case "open-conv": chatQuery = ""; return go({ view: "chat", gid: Number(btn.dataset.gid) });
        case "open-hit":
          pendingJump = btn.dataset.mid;
          return go({ view: "chat", gid: Number(btn.dataset.gid) });
        case "conv-back": return go({ view: "chat" });
        case "conv-info": return openConvInfo(route.gid);
        case "new-conv": return openNewConv();
        case "jump-pin": {
          const gid = Number(btn.dataset.gid);
          const pins = pinnedOf(gid);
          if (!pins.length) return;
          const k = (pinIndex[gid] || 0) % pins.length;
          jumpToMessage(pins[k].id);
          pinIndex[gid] = k + 1;
          return renderConvChrome();
        }
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
      if (!e.target.closest(".react-add-wrap")) {
        document.querySelectorAll(".react-pick").forEach((p) => p.remove());
        closeMsgMenus();
      }
      if (!e.target.closest(".chat-compose")) closeMentionPop();
    });

    $("file-input").addEventListener("change", (e) => {
      const files = [...e.target.files];
      e.target.value = "";
      handleFiles(files, "problem");
    });
    $("avatar-input").addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) pickAvatar(file);
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
        closeMsgMenus();
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
      trackPresence();
      if (document.visibilityState === "visible") maybeMarkRead();
    });
    window.addEventListener("focus", trackPresence);
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, unlockAudio, { passive: true }));
    window.addEventListener("blur", trackPresence);

    setInterval(() => {
      if ($("now")) $("now").textContent = dateTime(new Date().toISOString());
      if (["issue", "team"].includes(route.view) && $("lightbox").hidden && !$("modal").open) renderView();
      if (route.view === "chat") renderConvList();
    }, 30e3);
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
    subscribeAll();
    startPresence();
    loadAll().catch((e) => {
      console.error(e);
      notice(friendlyError(e), { error: true });
      $("list").innerHTML = '<p class="sb-empty">مقدرناش نحمّل المشاكل.</p>';
    });
    if (isNew) openWelcome(1);
    initServiceWorker();
    startHealing();
  }

  // ============ الاتصال اللحظي: بيرجع لوحده لو وقع ============
  let dataChannels = [];
  let dataHandlers = {};
  function subscribeAll() {
    dataHandlers = {
      [TABLE]: onProblemsChange,
      problem_comments: reloadComments,
      members: recheckMembership,
      team_settings: recheckMembership,
      comment_reactions: reloadReactions,
      problem_reads: reloadReads,
      problem_links: reloadLinks,
      reminders: reloadReminders,
      problem_events: () => { if (route.view === "issue" && detailTab === "history") loadHistory(route.id); },
      comment_hides: reloadCommentHides,
      member_presence: onPresenceChange,
      chat_groups: reloadChatMeta,
      chat_group_members: reloadChatMeta,
      chat_messages: reloadChatMessages,
      chat_message_hides: reloadChatHides,
      chat_reads: reloadChatReads,
      chat_reactions: reloadChatReactions,
    };
    dataChannels = store.subscribe(dataHandlers);
  }

  const channelDead = (ch) => !ch || !["joined", "joining"].includes(ch.state);
  let healing = false;
  async function healRealtime() {
    if (!started || healing || !me) return;
    healing = true;
    try {
      // مين فاتح: لو القناة وقعت نعملها من جديد
      if (channelDead(presenceCh)) {
        try { await db.removeChannel(presenceCh); } catch {}
        presenceCh = null;
        startPresence();
      } else {
        trackPresence();
      }
      // التحديث اللحظي للبيانات: لو أي قناة وقعت، نرجّعها ونجيب اللي فاتنا
      const tables = Object.keys(dataHandlers);
      const dead = tables.filter((t, i) => channelDead(dataChannels[i]));
      if (dead.length) {
        for (const t of dead) {
          const i = tables.indexOf(t);
          try { await db.removeChannel(dataChannels[i]); } catch {}
          [dataChannels[i]] = store.subscribe({ [t]: dataHandlers[t] });
        }
        await loadAll().catch((e) => console.warn(e));
      }
    } finally {
      healing = false;
    }
  }
  // ساعة بتدق كل 10 ثواني من Web Worker: كروم مبيبطّأهاش لما التاب يبقى في الخلفية
  function everyTick(fn) {
    try {
      const url = URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 10000);"], { type: "text/javascript" }));
      const w = new Worker(url);
      w.onmessage = fn;
      return;
    } catch {}
    setInterval(fn, 10e3);
  }

  let hiddenAt = 0;
  let lastHeal = 0;
  function comeBack() {
    if (!started || !me) return;
    // أول حاجة: نقول للكل إني رجعت، ونشوف مين موجود
    ping(true);
    loadPresence();
    // لو كنت غايب أكتر من دقيقتين، ممكن يكون فاتني تحديثات وأنا متصغّر
    if (hiddenAt && Date.now() - hiddenAt > 120e3) loadAll().catch((e) => console.warn(e));
    hiddenAt = 0;
    healRealtime();
  }
  function startHealing() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") comeBack();
      else hiddenAt = hiddenAt || Date.now();
    });
    window.addEventListener("online", comeBack);
    window.addEventListener("focus", () => healRealtime());
    window.addEventListener("pageshow", (e) => { if (e.persisted) comeBack(); });
    window.addEventListener("pagehide", leaveNow);
    ping(true);
    loadPresence();
    everyTick(() => {
      if (!started || !me) return;
      ping();
      if (document.visibilityState !== "visible") return;
      // احتياطي: حتى لو الاتصال اللحظي واقع، القايمة بتتحدث كل 15 ثانية
      if (presenceDirty || Date.now() - presenceLoadAt > 15e3) loadPresence();
      else { buildOnline(); renderPresence(); }
      if (Date.now() - lastHeal > 20e3) { lastHeal = Date.now(); healRealtime(); }
    });
  }

  boot();
})();
