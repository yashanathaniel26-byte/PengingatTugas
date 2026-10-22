import { NextRequest, NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface TimelineEvent {
  id: number;
  name: string;
  course?: {
    fullname?: string;
  };
  modulename?: string;
  instance?: number;
  timesort?: number;
  overdue?: boolean;
  action?: {
    name?: string;
    actionable?: boolean;
  };
  url?: string;
}

export interface StoredTimelineResult {
  updated: number;
  events: TimelineEvent[];
}

const TIMELINE_PATH = resolve(process.cwd(), "data", "timeline.json");

function getStoredTimeline(): StoredTimelineResult {
  if (!existsSync(TIMELINE_PATH)) {
    return {
      updated: 0,
      events: [],
    } satisfies StoredTimelineResult;
  }

  try {
    const raw = readFileSync(TIMELINE_PATH, "utf-8");
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return {
        updated: Math.floor(Date.now() / 1000),
        events: parsed,
      } satisfies StoredTimelineResult;
    }

    if (parsed && Array.isArray(parsed.events)) {
      return {
        updated: Number(parsed.updated) || Math.floor(Date.now() / 1000),
        events: parsed.events,
      } satisfies StoredTimelineResult;
    }

    return {
      updated: 0,
      events: [],
    } satisfies StoredTimelineResult;
  } catch {
    return {
      updated: 0,
      events: [],
    } satisfies StoredTimelineResult;
  }
}

function saveStoredTimeline(events: TimelineEvent[]): void {
  const dir = dirname(TIMELINE_PATH);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const payload = {
    updated: Math.floor(Date.now() / 1000),
    events,
  };

  writeFileSync(TIMELINE_PATH, JSON.stringify(payload, null, 2), "utf-8");
}

export async function GET() {
  const data = getStoredTimeline();

  return NextResponse.json(data);
}

interface RawTimelineItem {
  id?: number | string;
  name?: string;
  course?: { fullname?: string };
  modulename?: string;
  instance?: number | string;
  timesort?: number | string;
  overdue?: boolean;
  action?: { name?: string; actionable?: boolean };
  url?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let rawEvents: unknown[] = [];

    const rawJsonStr = String(body?.rawJson ?? "").trim();

    if (Array.isArray(body)) {
      rawEvents = body;
    } else if (body && Array.isArray(body.events)) {
      rawEvents = body.events;
    } else if (body && body.data && Array.isArray(body.data.events)) {
      rawEvents = body.data.events;
    } else if (rawJsonStr.length > 0) {
      try {
        const parsed = JSON.parse(rawJsonStr);

        if (Array.isArray(parsed)) {
          rawEvents = parsed;
        } else if (parsed && Array.isArray(parsed.events)) {
          rawEvents = parsed.events;
        }
      } catch {
        return NextResponse.json({ error: "Format JSON timeline tidak valid" }, { status: 400 });
      }
    }

    const events: TimelineEvent[] = [];

    for (const item of rawEvents) {
      if (item) {
        // SAFETY: External input item is verified as raw timeline shape
        const ev = item as RawTimelineItem;

        if (ev.name) {
          events.push({
            id: Number(ev.id) || Date.now(),
            name: String(ev.name),
            course: ev.course ? { fullname: String(ev.course.fullname ?? "") } : undefined,
            modulename: ev.modulename ? String(ev.modulename) : undefined,
            instance: ev.instance ? Number(ev.instance) : undefined,
            timesort: ev.timesort ? Number(ev.timesort) : undefined,
            overdue: Boolean(ev.overdue),
            action: ev.action ? { name: String(ev.action.name ?? ""), actionable: Boolean(ev.action.actionable) } : undefined,
            url: ev.url ? String(ev.url) : undefined,
          });
        }
      }
    }

    saveStoredTimeline(events);

    return NextResponse.json({
      success: true,
      count: events.length,
      updated: Math.floor(Date.now() / 1000),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    return NextResponse.json({ error: `Gagal memproses timeline: ${message}` }, { status: 500 });
  }
}
