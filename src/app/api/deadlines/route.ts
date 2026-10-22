import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getGlobalSettings, getAllUsers } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ItemStatus = "sudah" | "belum" | "draft" | "tertinggal";

export interface DeadlineEvent {
  id: string;
  title: string;
  course: string;
  type: "tugas" | "kuis" | "forum" | "kelompok";
  due: string;
  openTime?: string;
  link?: string;
  desc?: string;
  status: ItemStatus;
  cmid?: string;
  timelineMatch?: boolean;
}

export interface EvaluatedStatusResult {
  status: ItemStatus;
  timelineMatch: boolean;
}

const TYPE_RULES: [string, "kelompok" | "kuis" | "forum"][] = [
  ["kelompok", "kelompok"],
  ["group", "kelompok"],
  ["quiz", "kuis"],
  ["kuis", "kuis"],
  ["ujian", "kuis"],
  ["uts", "kuis"],
  ["uas", "kuis"],
  ["forum", "forum"],
  ["diskusi", "forum"],
];

function classify(text: string): "tugas" | "kuis" | "forum" | "kelompok" {
  const t = text.toLowerCase();

  for (const [kw, typ] of TYPE_RULES) {
    if (t.includes(kw)) {
      return typ;
    }
  }

  return "tugas";
}

function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDt(v: string): string | null {
  const raw = v.trim();

  try {
    if (raw.endsWith("Z")) {
      const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);

      if (match) {
        const [, Y, M, D, h, m, s] = match;
        const d = new Date(Date.UTC(+Y, +M - 1, +D, +h, +m, +s));

        return d.toISOString();
      }
    }

    if (raw.includes("T")) {
      const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);

      if (match) {
        const [, Y, M, D, h, m, s] = match;
        const d = new Date(Date.UTC(+Y, +M - 1, +D, +h - 7, +m, +s));

        return d.toISOString();
      }
    }

    const matchDateOnly = raw.match(/^(\d{4})(\d{2})(\d{2})$/);

    if (matchDateOnly) {
      const [, Y, M, D] = matchDateOnly;
      const d = new Date(Date.UTC(+Y, +M - 1, +D, 23 - 7, 59, 0));

      return d.toISOString();
    }

    return null;
  } catch {
    return null;
  }
}

function extractCmid(url?: string): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(/[?&]id=(\d+)/);

  return match ? match[1] : null;
}

function evaluateStatus(dueIso: string): EvaluatedStatusResult {
  const now = Date.now();
  const dueMs = new Date(dueIso).getTime();

  if (dueMs < now) {
    return {
      status: "tertinggal",
      timelineMatch: false,
    } satisfies EvaluatedStatusResult;
  }

  return {
    status: "belum",
    timelineMatch: false,
  } satisfies EvaluatedStatusResult;
}

function resolveCourseName(cat: string, title: string, desc: string): string {
  const unescaped = unescapeIcs(cat).trim();
  const fullText = `${unescaped} ${title} ${desc}`.toLowerCase();

  if (fullText.includes("cdk3aab3") || fullText.includes("manpro") || fullText.includes("time management")) {
    return "Manajemen Proyek";
  }

  if (
    fullText.includes("cdk3eab3") ||
    fullText.includes("deret waktu") ||
    fullText.includes("arima") ||
    fullText.includes("arma") ||
    fullText.includes("kuis minggu")
  ) {
    return "Analisis Deret Waktu";
  }

  if (
    fullText.includes("cdk3fab3") ||
    fullText.includes("mis") ||
    fullText.includes("eis") ||
    fullText.includes("organisasi")
  ) {
    return "Sistem Informasi Manajemen";
  }

  if (fullText.includes("cdk3gab1") || fullText.includes("sdum")) {
    return "Sosio Digital untuk Masyarakat";
  }

  if (
    fullText.includes("cdk3bab4") ||
    fullText.includes("uml") ||
    fullText.includes("tubes final") ||
    fullText.includes("class diagram") ||
    fullText.includes("quiz minggu ke-")
  ) {
    return "Pemrograman Berorientasi Objek";
  }

  if (fullText.includes("cdk4cab3") || fullText.includes("essay") || fullText.includes("feedback")) {
    return "Bahasa Inggris / Academic Writing";
  }

  return unescaped || "Umum / LMS";
}

interface RawEventItem {
  id: string;
  rawTitle: string;
  baseTitle: string;
  suffix: "opens" | "closes" | "is_due" | "other";
  course: string;
  type: "tugas" | "kuis" | "forum" | "kelompok";
  dueIso: string;
  link?: string;
  desc: string;
  cmid?: string;
}

export function parseIcs(text: string): DeadlineEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const rawEvents: RawEventItem[] = [];
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;

  let match: RegExpExecArray | null;

  while ((match = veventRegex.exec(unfolded)) !== null) {
    const block = match[1];
    const fields: Record<string, string> = {};
    const lines = block.split(/\r?\n/);

    for (const line of lines) {
      const colonIdx = line.indexOf(":");

      if (colonIdx === -1) {
        continue;
      }

      const keyPart = line.substring(0, colonIdx);
      const val = line.substring(colonIdx + 1);
      const mainKey = keyPart.split(";")[0].toUpperCase().trim();

      fields[mainKey] = val;
    }

    const dtStartRaw = fields["DTSTART"] || "";
    const dueIso = parseDt(dtStartRaw);

    if (!dueIso) {
      continue;
    }

    const rawTitle = unescapeIcs(fields["SUMMARY"] || "(Tanpa Judul)").trim();
    const desc = unescapeIcs(fields["DESCRIPTION"] || "").trim();
    const cat = fields["CATEGORIES"] || "";
    const link = (fields["URL"] || "").trim();
    const id = fields["UID"] || `${rawTitle}-${dueIso}`;
    const cmid = extractCmid(link) || undefined;
    const course = resolveCourseName(cat, rawTitle, desc);
    const itemType = classify(`${rawTitle} ${desc}`);

    let suffix: "opens" | "closes" | "is_due" | "other" = "other";
    let baseTitle = rawTitle;

    const closesMatch = rawTitle.match(/^(.*?)\s+closes$/i);
    const opensMatch = rawTitle.match(/^(.*?)\s+opens$/i);
    const isDueMatch = rawTitle.match(/^(.*?)\s+is due$/i);

    if (closesMatch) {
      suffix = "closes";
      baseTitle = closesMatch[1].trim();
    } else if (opensMatch) {
      suffix = "opens";
      baseTitle = opensMatch[1].trim();
    } else if (isDueMatch) {
      suffix = "is_due";
      baseTitle = isDueMatch[1].trim();
    }

    rawEvents.push({
      id,
      rawTitle,
      baseTitle,
      suffix,
      course,
      type: itemType,
      dueIso,
      link,
      desc: desc.substring(0, 300),
      cmid,
    });
  }

  // Map opens events by baseTitle so we can pair with closes events
  const opensMap = new Map<string, RawEventItem>();
  const pairedOpenIds = new Set<string>();

  for (const item of rawEvents) {
    if (item.suffix === "opens") {
      opensMap.set(item.baseTitle.toLowerCase(), item);
    }
  }

  const events: DeadlineEvent[] = [];

  // 1. Process closes events (the genuine deadline for quizzes)
  for (const item of rawEvents) {
    if (item.suffix === "closes") {
      const openCounterpart = opensMap.get(item.baseTitle.toLowerCase());

      if (openCounterpart) {
        pairedOpenIds.add(openCounterpart.id);
      }

      const { status, timelineMatch } = evaluateStatus(item.dueIso);

      events.push({
        id: item.id,
        title: item.baseTitle,
        course: item.course,
        type: "kuis",
        due: item.dueIso,
        openTime: openCounterpart ? openCounterpart.dueIso : undefined,
        link: item.link || openCounterpart?.link,
        desc: item.desc || openCounterpart?.desc,
        status,
        cmid: item.cmid || openCounterpart?.cmid,
        timelineMatch,
      });
    }
  }

  // 2. Process opens events that have no closes counterpart (announcements without closing deadline)
  for (const item of rawEvents) {
    if (item.suffix === "opens" && !pairedOpenIds.has(item.id)) {
      events.push({
        id: item.id,
        title: item.baseTitle,
        course: item.course,
        type: "kuis",
        due: item.dueIso,
        link: item.link,
        desc: item.desc,
        status: "belum",
        cmid: item.cmid,
        timelineMatch: false,
      });
    }
  }

  // 3. Process is_due (assignment submissions) and standard events
  for (const item of rawEvents) {
    if (item.suffix === "is_due" || item.suffix === "other") {
      const { status, timelineMatch } = evaluateStatus(item.dueIso);

      events.push({
        id: item.id,
        title: item.baseTitle,
        course: item.course,
        type: item.type,
        due: item.dueIso,
        link: item.link,
        desc: item.desc,
        status,
        cmid: item.cmid,
        timelineMatch,
      });
    }
  }

  events.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  return events;
}

const DEFAULT_LMS_PROXY = "https://lms-proxy.yashanathaniel26.workers.dev/?url=";

export function normalizeIcalUrl(url: string): string {
  const trimmed = url.trim();

  // Support Google Calendar embed URLs
  if (trimmed.includes("calendar.google.com/calendar/embed")) {
    try {
      const parsedUrl = new URL(trimmed);
      const srcParam = parsedUrl.searchParams.get("src");

      if (srcParam) {
        return `https://calendar.google.com/calendar/ical/${encodeURIComponent(srcParam)}/public/basic.ics`;
      }
    } catch {}
  }

  if (trimmed.includes("?url=")) {
    const splitIdx = trimmed.indexOf("?url=");
    const base = trimmed.substring(0, splitIdx);
    let inner = trimmed.substring(splitIdx + 5);

    try {
      while (inner.includes("%25") || inner.includes("%3A") || inner.includes("%2F") || inner.includes("%3F")) {
        const decoded = decodeURIComponent(inner);

        if (decoded === inner) {
          break;
        }

        inner = decoded;
      }
    } catch {}

    return `${base}?url=${encodeURIComponent(inner)}`;
  }

  if (trimmed.includes("lms.telkomuniversity.ac.id") && !trimmed.includes("workers.dev")) {
    return `${DEFAULT_LMS_PROXY}${encodeURIComponent(trimmed)}`;
  }

  return trimmed;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customUrl = searchParams.get("url");

  // 1. Session user icalUrl
  const token = req.cookies.get("pt_session")?.value;
  const user = token ? getSessionUser(token) : null;
  const userIcal = user?.icalUrl;

  // 2. Global settings icalUrl
  const settings = getGlobalSettings();
  const globalIcal = settings.icalUrl;

  // 3. Fallback to default user (e.g. yasir) in database
  let fallbackUserIcal: string | undefined;

  if (!userIcal && !globalIcal) {
    const allUsers = getAllUsers();
    const yasir = allUsers.find((u) => u.username === "yasir") || allUsers[0];
    fallbackUserIcal = yasir?.icalUrl;
  }

  const envUrl = process.env.ICAL_URL;
  let targetUrl = customUrl || userIcal || globalIcal || fallbackUserIcal || envUrl;

  if (!targetUrl) {
    return NextResponse.json(
      {
        configured: false,
        error: "Link iCal belum diatur. Masukkan URL kalender LMS Anda di menu Pengaturan.",
        updated: Math.floor(Date.now() / 1000),
        items: [],
      },
      { status: 200 }
    );
  }

  targetUrl = normalizeIcalUrl(targetUrl);

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/calendar, text/plain, */*",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let detail = `LMS merespon dengan status ${res.status} (${res.statusText})`;

      if (res.status === 403) {
        detail = "LMS merespon 403 Forbidden. Pastikan link kalender berasal dari tombol 'Get Calendar URL' di menu Export Calendar Moodle dan bukan link halaman biasa.";
      }

      return NextResponse.json(
        {
          configured: true,
          error: detail,
          updated: Math.floor(Date.now() / 1000),
          items: [],
        },
        { status: 502 }
      );
    }

    const icsText = await res.text();

    if (icsText.includes("<title>Just a moment...</title>") || icsText.includes("<!DOCTYPE html>")) {
      const fallbackUrl = "https://calendar.google.com/calendar/ical/1us8oin2kmeakb6a0i4m19hgcbbcada8%40import.calendar.google.com/public/basic.ics";
      const fallbackRes = await fetch(fallbackUrl, { cache: "no-store" });

      if (fallbackRes.ok) {
        const fallbackText = await fallbackRes.text();
        const fallbackItems = parseIcs(fallbackText);

        return NextResponse.json({
          configured: true,
          updated: Math.floor(Date.now() / 1000),
          items: fallbackItems,
          count: fallbackItems.length,
        });
      }
    }

    const items = parseIcs(icsText);

    return NextResponse.json({
      configured: true,
      updated: Math.floor(Date.now() / 1000),
      items,
      count: items.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json(
      {
        configured: true,
        error: `Gagal mengambil data iCal: ${message}`,
        updated: Math.floor(Date.now() / 1000),
        items: [],
      },
      { status: 500 }
    );
  }
}
