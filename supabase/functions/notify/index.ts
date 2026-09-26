// دالة الإشعارات: قاعدة البيانات بتناديها مع كل مشكلة جديدة أو حل أو تعيين مسؤول أو رسالة،
// وهي بتبعت إشعار لموبايلات الفريق (Web Push).
// الإعدادات والمفاتيح بتتقري من جدول push_config، فمش محتاجة أي Secrets.
import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

type Event = {
  type: "new_problem" | "solved" | "assigned" | "comment";
  problem_id: number;
  title?: string;
  actor?: string;
  assignee?: string;
  priority?: string;
  text?: string;
};
type Message = { title: string; body: string; url: string; tag: string };

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// بترجع الرسالة المناسبة لكل عضو، أو null لو ملوش إشعار
function messageFor(ev: Event, member: string): Message | null {
  const url = `#p${ev.problem_id}`;
  const tag = `p${ev.problem_id}-${ev.type}`;
  const title = ev.title ?? "";
  const urgent = ev.priority === "urgent" ? "عاجلة: " : "";

  if (ev.type === "new_problem") {
    if (same(member, ev.actor)) return null;
    if (same(member, ev.assignee)) {
      return { title: `${urgent}بقيت مسؤول عن مشكلة جديدة`, body: `${title} — سجّلها ${ev.actor}`, url, tag };
    }
    return { title: `${urgent}مشكلة جديدة`, body: `${title} — سجّلها ${ev.actor}`, url, tag };
  }
  if (ev.type === "solved") {
    if (same(member, ev.actor)) return null;
    return { title: "مشكلة اتحلت", body: `${title} — حلّها ${ev.actor ?? "حد من الفريق"}`, url, tag };
  }
  if (ev.type === "assigned") {
    if (!same(member, ev.assignee)) return null;
    return { title: `${urgent}بقيت مسؤول عن مشكلة`, body: title, url, tag };
  }
  if (ev.type === "comment") {
    if (same(member, ev.actor)) return null;
    return { title: `${ev.actor} في «${title}»`, body: ev.text ?? "", url, tag: `p${ev.problem_id}-chat` };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  const cfgRes = await rest("push_config?id=eq.1&select=*");
  const [cfg] = cfgRes.ok ? await cfgRes.json() : [];
  if (!cfg || req.headers.get("x-hook-secret") !== cfg.hook_secret) {
    return new Response("forbidden", { status: 403 });
  }

  const ev = (await req.json()) as Event;
  const subsRes = await rest("push_subscriptions?select=endpoint,p256dh,auth,member");
  const subs: { endpoint: string; p256dh: string; auth: string; member: string }[] = subsRes.ok
    ? await subsRes.json()
    : [];

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const msg = messageFor(ev, s.member);
      if (!msg) return;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(msg),
          { TTL: 60 * 60 * 24, urgency: ev.priority === "urgent" ? "high" : "normal" },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // الاشتراك انتهى (الموبايل لغى الإشعارات أو اتمسح الموقع): نشيله
        if (code === 404 || code === 410) gone.push(s.endpoint);
        else console.error("push failed", code, (e as Error).message);
      }
    }),
  );

  if (gone.length) {
    const list = gone.map((g) => `"${g.replace(/"/g, '\\"')}"`).join(",");
    await rest(`push_subscriptions?endpoint=in.(${encodeURIComponent(list)})`, { method: "DELETE" });
  }

  return Response.json({ sent, removed: gone.length });
});
