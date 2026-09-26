// دالة السيرفر بتاعة الموقع. بتعمل 3 حاجات:
// 1) إشعارات الموبايل مع كل حدث (قاعدة البيانات بتناديها): مشكلة جديدة، حل، "حصلت تاني"،
//    بدأ الشغل عليها، تعيين مسؤول، رسالة في النقاش، ومنشن @اسم أو @الكل،
//    ورسايل شات الفريق والمجموعات (بتوصل لأعضاء المجموعة بس).
// 2) كل 5 دقايق (pg_cron): "فكّرني بعدين"، وتذكير المسؤول بالمشاكل المتأخرة، والملخص اليومي.
// 3) تلخيص النقاش بالذكاء الاصطناعي (Gemini) لما عضو يدوس "لخّص النقاش".
// المفاتيح بتتقري من جدول push_config، فمش محتاجة أي Secrets.
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI = Deno.env.get("GEMINI_BASE") ?? "https://generativelanguage.googleapis.com";
const LATE_HOURS = 48;
const REMIND_EVERY_HOURS = 20;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------- الوصول لقاعدة البيانات ----------------
function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
async function getJson<T = any>(path: string): Promise<T> {
  const r = await rest(path);
  if (!r.ok) throw new Error(`GET ${path.split("?")[0]} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function patch(path: string, body: unknown) {
  const r = await rest(path, { method: "PATCH", body: JSON.stringify(body), headers: { Prefer: "return=minimal" } });
  if (!r.ok) console.error(`PATCH ${path.split("?")[0]} → ${r.status} ${await r.text()}`);
}
const inList = (ids: (string | number)[]) =>
  `(${ids.map((x) => (typeof x === "number" ? x : `"${String(x).replace(/"/g, '\\"')}"`)).join(",")})`;

// ---------------- الأنواع ----------------
type Config = {
  vapid_public: string; vapid_private: string; vapid_subject: string;
  hook_secret: string; gemini_key?: string | null; gemini_model?: string | null;
};
type Member = {
  user_id: string; display_name: string; removed: boolean; tz: string;
  quiet_start: number | null; quiet_end: number | null; summary_hour: number | null; last_summary_on: string | null;
  muted: boolean;
};
type Sub = { endpoint: string; p256dh: string; auth: string; member: string; user_id: string | null };
type Message = { title: string; body: string; url: string; tag: string };
type Event = {
  type: "new_problem" | "solved" | "recurred" | "started" | "assigned" | "comment" | "chat";
  problem_id?: number; title?: string; actor?: string; assignee?: string; author?: string;
  priority?: string; text?: string; attachment?: string | null; recur_count?: number;
  // رسايل الشات
  group_id?: number; group_name?: string | null; is_team?: boolean; message_id?: number; recipients?: string[];
};

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// @اسم بيذكر الشخص، و@الكل بيذكر كل اللي في المحادثة
const ALL_TAGS = ["@الكل", "@all"];
function mentions(text: string | undefined, name: string) {
  const t = (text ?? "").toLowerCase();
  return ALL_TAGS.some((tag) => t.includes(tag)) || t.includes("@" + name.trim().toLowerCase());
}

// ---------------- الوقت حسب بلد كل عضو ----------------
function localParts(tz: string, d = new Date()): { date: string; hour: number } {
  try {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
  } catch {
    return tz === "Africa/Cairo" ? { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() } : localParts("Africa/Cairo", d);
  }
}

// ساعات الهدوء: من quiet_start لحد quiet_end (ممكن تعدّي نص الليل)
function inQuiet(m: Member | undefined, d = new Date()) {
  if (!m || m.quiet_start == null || m.quiet_end == null || m.quiet_start === m.quiet_end) return false;
  const h = localParts(m.tz, d).hour;
  return m.quiet_start < m.quiet_end ? h >= m.quiet_start && h < m.quiet_end : h >= m.quiet_start || h < m.quiet_end;
}

// ---------------- الإرسال ----------------
class Sender {
  sent = 0;
  gone: string[] = [];
  byUser = new Map<string, Member>();
  constructor(public cfg: Config, public members: Member[], public subs: Sub[]) {
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
    for (const m of members) this.byUser.set(m.user_id, m);
  }
  // كل جهاز مشترك ومعاه اسم صاحبه الحالي (لو غيّر اسمه، الإشعار بيوصله برضو)
  targets() {
    return this.subs
      .map((s) => {
        const member = s.user_id ? this.byUser.get(s.user_id) : undefined;
        return { sub: s, member, name: member?.display_name ?? s.member };
      })
      .filter((t) => !t.member?.removed && !t.member?.muted);
  }
  async send(sub: Sub, msg: Message, urgent = false) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(msg),
        { TTL: 60 * 60 * 24, urgency: urgent ? "high" : "normal" },
      );
      this.sent++;
      return true;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // الاشتراك انتهى (الموبايل لغى الإشعارات أو اتمسح الموقع): نشيله
      if (code === 404 || code === 410) this.gone.push(sub.endpoint);
      else console.error("push failed", code, (e as Error).message);
      return false;
    }
  }
  async flush() {
    if (this.gone.length) {
      await rest(`push_subscriptions?endpoint=in.${encodeURIComponent(inList(this.gone))}`, { method: "DELETE" });
    }
    return { sent: this.sent, removed: this.gone.length };
  }
}

// ---------------- رسالة كل حدث لكل عضو ----------------
const ATTACH_LABEL: Record<string, string> = { audio: "🎤 رسالة صوتية", image: "📷 صورة", file: "📎 ملف" };

function messageFor(ev: Event, name: string): Message | null {
  const url = `#p${ev.problem_id}`;
  const tag = `p${ev.problem_id}-${ev.type}`;
  const title = ev.title ?? "";
  const urgent = ev.priority === "urgent" ? "عاجلة: " : "";

  switch (ev.type) {
    case "new_problem":
      if (same(name, ev.actor)) return null;
      if (same(name, ev.assignee)) {
        return { title: `${urgent}بقيت مسؤول عن مشكلة جديدة`, body: `${title} — سجّلها ${ev.actor}`, url, tag };
      }
      return { title: `${urgent}مشكلة جديدة`, body: `${title} — سجّلها ${ev.actor}`, url, tag };
    case "solved":
      if (same(name, ev.actor)) return null;
      return { title: "مشكلة اتحلت", body: `${title} — حلّها ${ev.actor ?? "حد من الفريق"}`, url, tag };
    case "recurred":
      if (same(name, ev.actor)) return null;
      return { title: `${urgent}مشكلة رجعت تاني`, body: `${title} — ${ev.actor} قال إنها حصلت تاني`, url, tag };
    case "started":
      if (!same(name, ev.author) || same(name, ev.actor)) return null;
      return { title: "بدأ الشغل على مشكلتك", body: `${ev.actor} بيشتغل على «${title}»`, url, tag };
    case "assigned":
      if (!same(name, ev.assignee) || same(name, ev.actor)) return null;
      return { title: `${urgent}بقيت مسؤول عن مشكلة`, body: ev.actor ? `${title} — من ${ev.actor}` : title, url, tag };
    case "comment": {
      if (same(name, ev.actor)) return null;
      const text = (ev.text ?? "").trim() || ATTACH_LABEL[ev.attachment ?? ""] || "";
      return {
        title: mentions(ev.text, name) ? `${ev.actor} ذكرك في «${title}»` : `${ev.actor} في «${title}»`,
        body: text,
        url,
        tag: `p${ev.problem_id}-chat`,
      };
    }
    case "chat": {
      if (same(name, ev.actor)) return null;
      const who = ev.actor || "حد من الفريق";
      const text = (ev.text ?? "").trim() || ATTACH_LABEL[ev.attachment ?? ""] || "";
      const where = ev.is_team ? "شات الفريق" : ev.group_name ? `«${ev.group_name}»` : "";
      const mentioned = mentions(ev.text, name);
      // شات خاص من غير اسم: زي واتساب، العنوان اسم اللي بعت بس
      const head = where
        ? mentioned ? `${who} ذكرك في ${where}` : `${who} في ${where}`
        : mentioned ? `${who} ذكرك` : who;
      return { title: head, body: text, url: `#c${ev.group_id}`, tag: `c${ev.group_id}-chat` };
    }
  }
  return null;
}

async function handleEvent(s: Sender, ev: Event) {
  const urgent = ev.priority === "urgent";
  // رسايل الشات بتوصل بس للي في المحادثة (القايمة بتيجي من قاعدة البيانات)
  const only = ev.type === "chat" ? new Set(ev.recipients ?? []) : null;
  await Promise.all(
    s.targets().filter((t) => !only || (!!t.sub.user_id && only.has(t.sub.user_id))).map(async (t) => {
      const msg = messageFor(ev, t.name);
      if (!msg) return;
      // ساعات الهدوء: مفيش إشعار إلا للعاجل
      if (!urgent && inQuiet(t.member)) return;
      await s.send(t.sub, msg, urgent);
    }),
  );
  return s.flush();
}

// ---------------- كل 5 دقايق ----------------
async function tick(s: Sender) {
  const now = new Date();
  const stats = { reminders: 0, late: 0, summaries: 0 };
  const forUser = (uid: string) => s.targets().filter((t) => t.sub.user_id === uid);
  const forName = (name: string) => s.targets().filter((t) => same(t.name, name));

  // 1) "فكّرني بعدين"
  const due = await getJson<{ id: number; user_id: string; problem_id: number }[]>(
    `reminders?sent_at=is.null&remind_at=lte.${encodeURIComponent(now.toISOString())}&select=id,user_id,problem_id`,
  );
  if (due.length) {
    const ids = [...new Set(due.map((r) => r.problem_id))];
    const probs = await getJson<{ id: number; title: string }[]>(`team_problems?id=in.${inList(ids)}&select=id,title`);
    const titleOf = new Map(probs.map((p) => [p.id, p.title]));
    for (const r of due) {
      for (const t of forUser(r.user_id)) {
        await s.send(t.sub, {
          title: "تذكير",
          body: `كنت عايز تفتكر «${titleOf.get(r.problem_id) ?? "مشكلة"}»`,
          url: `#p${r.problem_id}`,
          tag: `p${r.problem_id}-remind`,
        }, true);
      }
      stats.reminders++;
    }
    await patch(`reminders?id=in.${inList(due.map((r) => r.id))}`, { sent_at: now.toISOString() });
  }

  // 2) المسؤول عن مشكلة متأخرة أو عدّى ميعادها (مرة كل يوم تقريبًا)
  const open = await getJson<{
    id: number; title: string; assignee: string; created_at: string; due_at: string | null;
    last_reminded_at: string | null; priority: string;
  }[]>(`team_problems?status=neq.solved&assignee=not.is.null&select=id,title,assignee,created_at,due_at,last_reminded_at,priority`);
  for (const p of open) {
    const ageH = (now.getTime() - new Date(p.created_at).getTime()) / 3600e3;
    const overdue = !!p.due_at && new Date(p.due_at) < now;
    if (ageH < LATE_HOURS && !overdue) continue;
    if (p.last_reminded_at && now.getTime() - new Date(p.last_reminded_at).getTime() < REMIND_EVERY_HOURS * 3600e3) continue;
    const urgent = p.priority === "urgent";
    const targets = forName(p.assignee).filter((t) => urgent || !inQuiet(t.member));
    if (!targets.length) continue; // هيتبعت بعد ساعات الهدوء
    const days = Math.max(2, Math.round(ageH / 24));
    const msg = overdue
      ? { title: "عدّى الميعاد النهائي", body: `«${p.title}» لسه متحلتش`, url: `#p${p.id}`, tag: `p${p.id}-late` }
      : { title: "مشكلة متأخرة عليك", body: `«${p.title}» مفتوحة من ${days} أيام`, url: `#p${p.id}`, tag: `p${p.id}-late` };
    for (const t of targets) await s.send(t.sub, msg, urgent);
    await patch(`team_problems?id=eq.${p.id}`, { last_reminded_at: now.toISOString() });
    stats.late++;
  }

  // 3) الملخص اليومي في الساعة اللي كل عضو اختارها
  const wanting = s.members.filter((m) => !m.removed && m.summary_hour != null);
  const ready = wanting.filter((m) => {
    const lp = localParts(m.tz, now);
    return lp.hour === m.summary_hour && m.last_summary_on !== lp.date;
  });
  if (ready.length) {
    const all = await getJson<{
      status: string; priority: string; assignee: string | null; created_at: string;
      solved_at: string | null; due_at: string | null;
    }[]>(`team_problems?select=status,priority,assignee,created_at,solved_at,due_at`);
    const openList = all.filter((p) => p.status !== "solved");
    const late = openList.filter((p) =>
      (now.getTime() - new Date(p.created_at).getTime()) / 3600e3 > LATE_HOURS || (p.due_at && new Date(p.due_at) < now)
    ).length;
    const urgentCount = openList.filter((p) => p.priority === "urgent").length;
    const solved24 = all.filter((p) => p.solved_at && now.getTime() - new Date(p.solved_at).getTime() < 24 * 3600e3).length;
    for (const m of ready) {
      const mine = openList.filter((p) => same(p.assignee, m.display_name)).length;
      const body = openList.length
        ? `${openList.length} مفتوحة (${urgentCount} عاجلة، ${late} متأخرة) · اتحل ${solved24} في آخر 24 ساعة${mine ? ` · عليك ${mine}` : ""}`
        : `مفيش مشاكل مفتوحة 🎉 · اتحل ${solved24} في آخر 24 ساعة`;
      for (const t of forUser(m.user_id)) {
        await s.send(t.sub, { title: "ملخص النهارده", body, url: "", tag: "daily-summary" });
      }
      await patch(`members?user_id=eq.${m.user_id}`, { last_summary_on: localParts(m.tz, now).date });
      stats.summaries++;
    }
  }

  return { ...stats, ...(await s.flush()) };
}

// ---------------- تلخيص النقاش ----------------
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function summarize(req: Request, body: { problem_id?: number }) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: authHeader } });
  if (!u.ok) return json({ error: "unauthorized" }, 401);
  const user = await u.json();
  const okRes = await rest("rpc/is_active_member", { method: "POST", body: JSON.stringify({ p_uid: user.id }) });
  if (!okRes.ok || (await okRes.json()) !== true) return json({ error: "not_member" }, 403);

  const id = Number(body.problem_id);
  if (!Number.isFinite(id)) return json({ error: "bad_request" }, 400);
  const [cfg] = await getJson<Config[]>("push_config?id=eq.1&select=gemini_key,gemini_model");
  if (!cfg?.gemini_key) return json({ error: "no_key" }, 400);

  const [p] = await getJson<any[]>(`team_problems?id=eq.${id}&select=title,details,note,status,assignee,solution`);
  if (!p) return json({ error: "not_found" }, 404);
  const cs = await getJson<{ author: string; body: string; attachments: { kind?: string }[]; created_at: string }[]>(
    `problem_comments?problem_id=eq.${id}&deleted_at=is.null&select=author,body,attachments,created_at&order=created_at`,
  );
  if (!cs.length) return json({ error: "empty" }, 400);

  const status = { open: "متحلتش", in_progress: "بيتشتغل عليها", solved: "اتحلت" }[p.status as string] ?? p.status;
  let transcript = cs
    .slice(-150)
    .map((c) => {
      const att = (c.attachments ?? []).map((a) => `[${ATTACH_LABEL[a.kind ?? ""] ?? "مرفق"}]`).join(" ");
      return `${c.author}: ${[c.body, att].filter(Boolean).join(" ")}`;
    })
    .join("\n");
  if (transcript.length > 12000) transcript = transcript.slice(-12000);

  const prompt =
    `إنت بتلخّص نقاش فريق شغل على مشكلة. اكتب ملخص قصير بالعامية المصرية في 3 نقط بالظبط، ` +
    `كل نقطة سطر واحد بيبدأ بـ "• ":\n` +
    `• المشكلة إيه باختصار.\n• الفريق وصل لإيه لحد دلوقتي.\n• الخطوة الجاية ومين مستني إيه (لو مش واضح قول كده).\n` +
    `متضيفش أي معلومة مش موجودة في النقاش.\n\n` +
    `اسم المشكلة: ${p.title}\nالوصف: ${p.details ?? "مفيش"}\nملاحظة: ${p.note ?? "مفيش"}\n` +
    `الحالة: ${status}\nالمسؤول: ${p.assignee ?? "مش متعيّن"}\n${p.solution ? `الحل المكتوب: ${p.solution}\n` : ""}\n` +
    `النقاش:\n${transcript}`;

  const model = cfg.gemini_model || "gemini-3.8-flash";
  const r = await fetch(`${GEMINI}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.gemini_key },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error("gemini", r.status, detail);
    return json({ error: "gemini", status: r.status, detail }, 502);
  }
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("").trim();
  if (!text) return json({ error: "gemini_empty" }, 502);
  return json({ summary: text });
}

// حوّل رسالة صوتية لكلام مكتوب. النتيجة بتتخزن بمسار الملف، فلو حد تاني دوس الزرار على نفس
// الرسالة بيرجع من الكاش على طول من غير ما نتصل بـ Gemini تاني (ومن غير ما نتحاسب تاني).
const AUDIO_MIME: Record<string, string> = { webm: "audio/webm", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac" };

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function transcribe(req: Request, body: { path?: string }) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: authHeader } });
  if (!u.ok) return json({ error: "unauthorized" }, 401);
  const user = await u.json();
  const okRes = await rest("rpc/is_active_member", { method: "POST", body: JSON.stringify({ p_uid: user.id }) });
  if (!okRes.ok || (await okRes.json()) !== true) return json({ error: "not_member" }, 403);

  const path = String(body.path ?? "").trim();
  if (!path || path.includes("..")) return json({ error: "bad_request" }, 400);

  const cached = await getJson<{ text: string }[]>(`voice_transcripts?att_path=eq.${encodeURIComponent(path)}&select=text`);
  if (cached[0]?.text) return json({ text: cached[0].text, cached: true });

  const [cfg] = await getJson<Config[]>("push_config?id=eq.1&select=gemini_key,gemini_model");
  if (!cfg?.gemini_key) return json({ error: "no_key" }, 400);

  const audioRes = await fetch(`${SB_URL}/storage/v1/object/public/chat-files/${path}`);
  if (!audioRes.ok) return json({ error: "not_found" }, 404);
  const buf = await audioRes.arrayBuffer();
  if (buf.byteLength > 10 * 1024 * 1024) return json({ error: "too_big" }, 400);
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = AUDIO_MIME[ext] || audioRes.headers.get("content-type") || "audio/webm";

  const model = cfg.gemini_model || "gemini-3.8-flash";
  const r = await fetch(`${GEMINI}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.gemini_key },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: "دي رسالة صوتية بالعربي المصري. اكتبها كلام مكتوب بالظبط زي ما قالها الشخص، من غير أي تعليق أو مقدمة. لو الصوت مش واضح أو مفيش كلام، اكتب [مفيش كلام واضح] بس." },
          { inlineData: { mimeType, data: toBase64(buf) } },
        ],
      }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    console.error("gemini transcribe", r.status, detail);
    return json({ error: "gemini", status: r.status, detail }, 502);
  }
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("").trim();
  if (!text) return json({ error: "gemini_empty" }, 502);

  await rest("voice_transcripts", { method: "POST", body: JSON.stringify({ att_path: path, text }), headers: { Prefer: "resolution=ignore-duplicates" } });
  return json({ text });
}

// ---------------- البداية ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("ok");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // مفيش body
  }

  try {
    if (body.type === "summarize") return await summarize(req, body);
    if (body.type === "transcribe") return await transcribe(req, body);

    const [cfg] = await getJson<Config[]>("push_config?id=eq.1&select=*");
    if (!cfg || req.headers.get("x-hook-secret") !== cfg.hook_secret) {
      return new Response("forbidden", { status: 403 });
    }
    const [members, subs] = await Promise.all([
      getJson<Member[]>("members?select=user_id,display_name,removed,tz,quiet_start,quiet_end,summary_hour,last_summary_on,muted"),
      getJson<Sub[]>("push_subscriptions?select=endpoint,p256dh,auth,member,user_id"),
    ]);
    const sender = new Sender(cfg, members, subs);
    if (body.type === "tick") return Response.json(await tick(sender));
    return Response.json(await handleEvent(sender, body as Event));
  } catch (e) {
    console.error(e);
    const res = { error: String((e as Error)?.message ?? e) };
    return body.type === "summarize" || body.type === "transcribe" ? json(res, 500) : Response.json(res, { status: 500 });
  }
});
