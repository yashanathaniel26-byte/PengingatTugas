"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Bell,
  BellOff,
  RefreshCw,
  Search,
  Plus,
  Settings,
  ExternalLink,
  Trash2,
  Sun,
  Moon,
  Sparkles,
  BookOpen,
  User,
  LogOut,
  LogIn,
  FileText,
  Pin,
  Tag,
  Send,
} from "lucide-react";

export type ItemStatus = "sudah" | "belum" | "draft" | "tertinggal";

export interface DeadlineItem {
  id: string;
  title: string;
  course: string;
  type: "tugas" | "kuis" | "forum" | "kelompok" | "manual";
  due: string;
  link?: string;
  desc?: string;
  isManual?: boolean;
  status?: ItemStatus;
  cmid?: string;
  timelineMatch?: boolean;
}

export interface NoteItem {
  id: string;
  title: string;
  category: "matkul" | "evaluasi" | "kerjaan" | "umum";
  course?: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  icalUrl?: string;
}

export interface TelegramStatusFeedback {
  type: "success" | "error";
  message: string;
}

export interface FonnteDeviceState {
  device?: string;
  device_status?: string;
  name?: string;
  quota?: string | number;
}

const TYPE_LABELS = {
  semua: "Semua",
  tertinggal: "Tertinggal",
  belum: "Belum Selesai",
  sudah: "Sudah Selesai",
  tugas: "Tugas",
  kuis: "Kuis",
  forum: "Forum",
  kelompok: "Kelompok",
  manual: "Manual",
} as const;

type FilterKey = keyof typeof TYPE_LABELS;

const FILTER_KEYS: readonly FilterKey[] = [
  "semua",
  "tertinggal",
  "belum",
  "sudah",
  "tugas",
  "kuis",
  "forum",
  "kelompok",
  "manual",
];

const NOTE_CATEGORIES = {
  semua: "Semua Catatan",
  matkul: "Catatan Matkul",
  evaluasi: "Evaluasi",
  kerjaan: "Kerjaan / Proyek",
  umum: "Umum",
} as const;

type NoteCategoryKey = keyof typeof NOTE_CATEGORIES;

const NOTE_CATEGORY_KEYS: readonly NoteCategoryKey[] = ["semua", "matkul", "evaluasi", "kerjaan", "umum"];

// Web Audio API chime with clean typing without chained assertions
interface WindowWithAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function playSuccessChime(): void {
  try {
    // SAFETY: Browser Web Audio standard implementation check
    const win = window as WindowWithAudioContext;
    const AudioCtor = window.AudioContext || win.webkitAudioContext;

    if (!AudioCtor) {
      return;
    }

    const ctx = new AudioCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.3);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // Abaikan jika audio dibatasi oleh kebijakan autoplay browser
  }
}

function getItemEffectiveStatus(item: DeadlineItem, isDone: boolean, nowMs: number): ItemStatus {
  if (isDone) {
    return "sudah";
  }

  const dueMs = new Date(item.due).getTime();

  if (dueMs < nowMs) {
    return "tertinggal";
  }

  return "belum";
}

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeView, setActiveView] = useState<"tasks" | "notes">("tasks");
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Tasks state
  const [lmsItems, setLmsItems] = useState<DeadlineItem[]>([]);
  const [manualItems, setManualItems] = useState<DeadlineItem[]>([]);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});
  const [icalUrl, setIcalUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Notes state
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [activeNoteCategory, setActiveNoteCategory] = useState<NoteCategoryKey>("semua");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");

  // Filters & controls
  const [activeFilter, setActiveFilter] = useState<FilterKey>("semua");
  const [searchQuery, setSearchQuery] = useState("");
  const [notifGranted, setNotifGranted] = useState(false);

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [inputUrl, setInputUrl] = useState("");

  // Telegram Bot integration state
  const [settingsTab, setSettingsTab] = useState<"ical" | "telegram" | "whatsapp">("ical");
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramAlertsEnabled, setTelegramAlertsEnabled] = useState(true);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestStatus, setTelegramTestStatus] = useState<TelegramStatusFeedback | null>(null);
  const [telegramWebhookUrl, setTelegramWebhookUrl] = useState<string>("");
  const [telegramWebhookLoading, setTelegramWebhookLoading] = useState(false);
  const [telegramWebhookStatus, setTelegramWebhookStatus] = useState<TelegramStatusFeedback | null>(null);

  // WhatsApp Fonnte integration state
  const [whatsappToken, setWhatsappToken] = useState("r1D5UfhNuNSigZz1jWZE");
  const [whatsappPhone, setWhatsappPhone] = useState("6281931905436");
  const [whatsappAlertsEnabled, setWhatsappAlertsEnabled] = useState(true);
  const [whatsappDevice, setWhatsappDevice] = useState<FonnteDeviceState | null>(null);
  const [whatsappTesting, setWhatsappTesting] = useState(false);
  const [whatsappTestStatus, setWhatsappTestStatus] = useState<TelegramStatusFeedback | null>(null);

  // Auth form state
  const [authUsername, setAuthUsername] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newType, setNewType] = useState<"tugas" | "kuis" | "forum" | "kelompok" | "manual">("tugas");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDueTime, setNewDueTime] = useState("23:59");
  const [newDesc, setNewDesc] = useState("");

  // Note form state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteCategory, setNoteCategory] = useState<"matkul" | "evaluasi" | "kerjaan" | "umum">("matkul");
  const [noteCourse, setNoteCourse] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [notePinned, setNotePinned] = useState(false);

  // Live timer tick for countdown
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Register service worker for PWA
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
  }, []);

  // Check auth session
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();

      if (data.user) {
        setCurrentUser(data.user);

        if (data.user.icalUrl) {
          setIcalUrl(data.user.icalUrl);
          setInputUrl(data.user.icalUrl);
        }

        const tasksRes = await fetch("/api/tasks");
        const tasksData = await tasksRes.json();

        if (Array.isArray(tasksData.tasks)) {
          // SAFETY: Tasks from database are validated
          const dbTasks = tasksData.tasks as DeadlineItem[];

          setManualItems(dbTasks);

          const newDoneMap: Record<string, boolean> = {};

          tasksData.tasks.forEach((t: { id: string; done?: boolean }) => {
            if (t.done) {
              newDoneMap[t.id] = true;
            }
          });

          setDoneMap((prev) => ({ ...prev, ...newDoneMap }));
        }

        const notesRes = await fetch("/api/notes");
        const notesData = await notesRes.json();

        if (Array.isArray(notesData.notes)) {
          // SAFETY: Notes from database are validated
          const dbNotes = notesData.notes as NoteItem[];

          setNotes(dbNotes);
        }
      } else {
        setCurrentUser(null);
      }
    } catch {
      // Abaikan jika request gagal
    }
  }, []);

  // Fetch Webhook Info
  const fetchWebhookStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/set-webhook");
      const data = await res.json();

      if (data.ok && data.webhook) {
        setTelegramWebhookUrl(data.webhook.url || "");
      }
    } catch {
      // Abaikan jika request gagal
    }
  }, []);

  // Fetch Telegram Integration Settings
  const fetchTelegramSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/settings");
      const data = await res.json();

      if (data.ok) {
        if (data.token) {
          setTelegramToken(String(data.token));
        }

        if (data.chatId) {
          setTelegramChatId(String(data.chatId));
        }

        if (data.enabled !== undefined) {
          setTelegramAlertsEnabled(Boolean(data.enabled));
        }

        if (data.token) {
          fetchWebhookStatus();
        }
      }
    } catch {
      // Abaikan jika request gagal
    }
  }, [fetchWebhookStatus]);

  // Fetch WhatsApp Settings
  const fetchWhatsAppSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/settings");
      const data = await res.json();

      if (data.ok) {
        if (data.token) {
          setWhatsappToken(String(data.token));
        }

        if (data.targetPhone) {
          setWhatsappPhone(String(data.targetPhone));
        }

        if (data.enabled !== undefined) {
          setWhatsappAlertsEnabled(Boolean(data.enabled));
        }

        if (data.device) {
          setWhatsappDevice(data.device);
        }
      }
    } catch {
      // Abaikan jika request gagal
    }
  }, []);

  // Initialize theme & load persisted states
  useEffect(() => {
    const savedTheme = localStorage.getItem("pt_theme");
    const initialTheme: "dark" | "light" = savedTheme === "light" ? "light" : "dark";

    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);

    const savedDone = localStorage.getItem("pt_done");

    if (savedDone) {
      try {
        const parsed = JSON.parse(savedDone);
        setDoneMap(parsed);
      } catch {}
    }

    const savedManual = localStorage.getItem("pt_manual");

    if (savedManual) {
      try {
        const parsed = JSON.parse(savedManual);
        setManualItems(parsed);
      } catch {}
    }

    const savedNotes = localStorage.getItem("pt_notes");

    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes);
        setNotes(parsed);
      } catch {}
    }

    const savedUrl = localStorage.getItem("pt_ical_url") || "";

    setIcalUrl(savedUrl);
    setInputUrl(savedUrl);

    if ("Notification" in window && Notification.permission === "granted") {
      setNotifGranted(true);
    }

    checkSession();
    fetchTelegramSettings();
    fetchWhatsAppSettings();
  }, [checkSession, fetchTelegramSettings, fetchWhatsAppSettings]);

  const toggleTheme = () => {
    const next: "dark" | "light" = theme === "dark" ? "light" : "dark";

    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pt_theme", next);
  };

  // Fetch LMS Deadlines
  const fetchDeadlines = useCallback(async (urlToUse?: string) => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const activeUrl = urlToUse !== undefined ? urlToUse : icalUrl;
      const endpoint = activeUrl ? `/api/deadlines?url=${encodeURIComponent(activeUrl)}` : "/api/deadlines";
      const res = await fetch(endpoint);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal memuat jadwal deadline.");
      }

      setLmsItems(data.items || []);
      setLastUpdated(data.updated || Math.floor(Date.now() / 1000));

      if (!data.configured && !activeUrl) {
        setErrorMsg("Belum ada URL iCal LMS. Silakan atur di menu Pengaturan.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  }, [icalUrl]);

  useEffect(() => {
    fetchDeadlines();

    const interval = setInterval(() => {
      fetchDeadlines();
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchDeadlines]);

  // Clock ticker every second for countdowns
  useEffect(() => {
    const ticker = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(ticker);
  }, []);

  // Periodic background evaluation for Telegram deadline alerts
  useEffect(() => {
    const runAlertCheck = async () => {
      try {
        await fetch("/api/telegram/check-alerts");
      } catch {}
    };

    const initialTimeout = setTimeout(runAlertCheck, 4000);
    const interval = setInterval(runAlertCheck, 10 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []);

  // Combine LMS + Manual items
  const allItems = useMemo(() => {
    const combined = [...lmsItems, ...manualItems];

    return combined.sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  }, [lmsItems, manualItems]);

  // Toggle done checkbox
  const toggleDone = async (id: string) => {
    const nextVal = !doneMap[id];

    setDoneMap((prev) => {
      const updated = { ...prev, [id]: nextVal };

      if (nextVal) {
        playSuccessChime();
      }

      localStorage.setItem("pt_done", JSON.stringify(updated));

      return updated;
    });

    if (currentUser) {
      try {
        await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
        });
      } catch {}
    }
  };

  // Delete manual item
  const deleteManual = async (id: string) => {
    const next = manualItems.filter((m) => m.id !== id);

    setManualItems(next);
    localStorage.setItem("pt_manual", JSON.stringify(next));

    if (currentUser) {
      try {
        await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {}
    }
  };

  // Add manual task
  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTitle.trim() || !newDueDate) {
      return;
    }

    const dueIso = new Date(`${newDueDate}T${newDueTime || "23:59"}:00`).toISOString();

    const newItem: DeadlineItem = {
      id: `manual-${Date.now()}`,
      title: newTitle.trim(),
      course: newCourse.trim() || "Pribadi / Umum",
      type: newType,
      due: dueIso,
      desc: newDesc.trim(),
      isManual: true,
      status: "belum",
    };

    if (currentUser) {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newItem.title,
            course: newItem.course,
            type: newItem.type,
            due: newItem.due,
            desc: newItem.desc,
          }),
        });

        const data = await res.json();

        if (data.task) {
          newItem.id = data.task.id;
        }
      } catch {}
    }

    const next = [...manualItems, newItem];

    setManualItems(next);
    localStorage.setItem("pt_manual", JSON.stringify(next));

    setNewTitle("");
    setNewCourse("");
    setNewDueDate("");
    setNewDesc("");
    setShowAddModal(false);
  };

  // Note CRUD operations
  const openNewNoteModal = () => {
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteCategory("matkul");
    setNoteCourse("");
    setNoteContent("");
    setNotePinned(false);
    setShowNoteModal(true);
  };

  const openEditNoteModal = (note: NoteItem) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteCategory(note.category);
    setNoteCourse(note.course || "");
    setNoteContent(note.content);
    setNotePinned(note.pinned);
    setShowNoteModal(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!noteTitle.trim()) {
      return;
    }

    const now = new Date().toISOString();

    if (editingNoteId) {
      const updatedNotes = notes.map((n) => {
        if (n.id === editingNoteId) {
          return {
            ...n,
            title: noteTitle.trim(),
            category: noteCategory,
            course: noteCourse.trim() || undefined,
            content: noteContent.trim(),
            pinned: notePinned,
            updatedAt: now,
          };
        }

        return n;
      });

      setNotes(updatedNotes);
      localStorage.setItem("pt_notes", JSON.stringify(updatedNotes));

      if (currentUser) {
        try {
          await fetch(`/api/notes?id=${encodeURIComponent(editingNoteId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: noteTitle.trim(),
              category: noteCategory,
              course: noteCourse.trim() || undefined,
              content: noteContent.trim(),
              pinned: notePinned,
            }),
          });
        } catch {}
      }
    } else {
      const newNote: NoteItem = {
        id: `note-${Date.now()}`,
        title: noteTitle.trim(),
        category: noteCategory,
        course: noteCourse.trim() || undefined,
        content: noteContent.trim(),
        pinned: notePinned,
        createdAt: now,
        updatedAt: now,
      };

      if (currentUser) {
        try {
          const res = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: newNote.title,
              category: newNote.category,
              course: newNote.course,
              content: newNote.content,
              pinned: newNote.pinned,
            }),
          });

          const data = await res.json();

          if (data.note) {
            newNote.id = data.note.id;
          }
        } catch {}
      }

      const updatedNotes = [newNote, ...notes];

      setNotes(updatedNotes);
      localStorage.setItem("pt_notes", JSON.stringify(updatedNotes));
    }

    setShowNoteModal(false);
  };

  const handleDeleteNote = async (id: string) => {
    const next = notes.filter((n) => n.id !== id);

    setNotes(next);
    localStorage.setItem("pt_notes", JSON.stringify(next));

    if (currentUser) {
      try {
        await fetch(`/api/notes?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {}
    }
  };

  const handleTogglePinNote = async (id: string, currentPin: boolean) => {
    const next = notes.map((n) => (n.id === id ? { ...n, pinned: !currentPin } : n));

    setNotes(next);
    localStorage.setItem("pt_notes", JSON.stringify(next));

    if (currentUser) {
      try {
        await fetch(`/api/notes?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !currentPin }),
        });
      } catch {}
    }
  };

  // Filtered Notes
  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        if (activeNoteCategory !== "semua" && note.category !== activeNoteCategory) {
          return false;
        }

        if (noteSearchQuery.trim()) {
          const q = noteSearchQuery.toLowerCase();
          const matchTitle = note.title.toLowerCase().includes(q);
          const matchContent = note.content.toLowerCase().includes(q);
          const matchCourse = note.course?.toLowerCase().includes(q) ?? false;

          if (!matchTitle && !matchContent && !matchCourse) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [notes, activeNoteCategory, noteSearchQuery]);

  // Test Telegram Bot Connection
  const handleTestTelegram = async () => {
    const cleanToken = telegramToken.trim();
    const cleanChatId = telegramChatId.trim();

    if (!cleanToken || !cleanChatId) {
      setTelegramTestStatus({
        type: "error",
        message: "Bot Token dan Chat ID wajib diisi terlebih dahulu.",
      });

      return;
    }

    setTelegramTesting(true);
    setTelegramTestStatus(null);

    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleanToken, chatId: cleanChatId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal mengirim pesan uji coba ke Telegram.");
      }

      setTelegramTestStatus({
        type: "success",
        message: data.message || "Pesan uji coba berhasil terkirim ke Telegram Anda!",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      setTelegramTestStatus({
        type: "error",
        message,
      });
    } finally {
      setTelegramTesting(false);
    }
  };

  // Sync Telegram Webhook
  const handleSyncWebhook = async () => {
    const cleanToken = telegramToken.trim();

    if (!cleanToken) {
      setTelegramWebhookStatus({
        type: "error",
        message: "Bot Token wajib diisi terlebih dahulu sebelum mendaftarkan webhook.",
      });

      return;
    }

    setTelegramWebhookLoading(true);
    setTelegramWebhookStatus(null);

    try {
      const origin = window.location.origin;
      const targetUrl = `${origin}/api/telegram/webhook`;

      const res = await fetch("/api/telegram/set-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: targetUrl }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal mendaftarkan webhook.");
      }

      setTelegramWebhookUrl(data.url || targetUrl);
      setTelegramWebhookStatus({
        type: "success",
        message: data.message || "Webhook Telegram berhasil didaftarkan!",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      setTelegramWebhookStatus({
        type: "error",
        message,
      });
    } finally {
      setTelegramWebhookLoading(false);
    }
  };

  // Test WhatsApp Connection
  const handleTestWhatsApp = async () => {
    const cleanToken = whatsappToken.trim();
    const cleanPhone = whatsappPhone.trim();

    if (!cleanToken || !cleanPhone) {
      setWhatsappTestStatus({
        type: "error",
        message: "Fonnte API Token dan Nomor WhatsApp wajib diisi terlebih dahulu.",
      });

      return;
    }

    setWhatsappTesting(true);
    setWhatsappTestStatus(null);

    try {
      const res = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cleanToken, targetPhone: cleanPhone }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal mengirim pesan uji coba WhatsApp.");
      }

      setWhatsappTestStatus({
        type: "success",
        message: data.message || "Pesan uji coba berhasil terkirim ke WhatsApp Anda!",
      });

      fetchWhatsAppSettings();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      setWhatsappTestStatus({
        type: "error",
        message,
      });
    } finally {
      setWhatsappTesting(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = inputUrl.trim();

    setIcalUrl(cleanUrl);
    localStorage.setItem("pt_ical_url", cleanUrl);

    if (currentUser) {
      try {
        await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icalUrl: cleanUrl }),
        });
      } catch {}
    }

    try {
      await fetch("/api/telegram/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: telegramToken.trim(),
          chatId: telegramChatId.trim(),
          enabled: telegramAlertsEnabled,
        }),
      });
    } catch {}

    try {
      await fetch("/api/whatsapp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: whatsappToken.trim(),
          targetPhone: whatsappPhone.trim(),
          enabled: whatsappAlertsEnabled,
        }),
      });
    } catch {}

    setShowSettings(false);
    fetchDeadlines(cleanUrl);
  };

  // Auth handler: Login & Register
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";

      const payload =
        authMode === "login"
          ? { identifier: authEmail || authUsername, password: authPassword }
          : { username: authUsername, email: authEmail, password: authPassword };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Gagal melakukan autentikasi");
      }

      setCurrentUser(data.user);
      setShowAuthModal(false);
      setAuthPassword("");

      if (data.user.icalUrl) {
        setIcalUrl(data.user.icalUrl);
        setInputUrl(data.user.icalUrl);
        fetchDeadlines(data.user.icalUrl);
      }

      checkSession();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setCurrentUser(null);
    } catch {}
  };

  // Request browser notification
  const handleRequestNotif = async () => {
    if (!("Notification" in window)) {
      alert("Browser tidak mendukung notifikasi desktop.");

      return;
    }

    const perm = await Notification.requestPermission();

    if (perm === "granted") {
      setNotifGranted(true);
      new Notification("Tenggat Kuliah Aktif", {
        body: "Pengingat tugas otomatis akan memberi tahu sebelum waktu tenggat berakhir.",
      });
    }
  };

  // Countdown string helper
  const formatCountdown = (dueMs: number) => {
    const diff = dueMs - currentTime;

    if (diff <= 0) {
      return "Waktu habis";
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}h ${hours}j ${mins}m ${secs}d`;
    }

    return `${hours}j ${mins}m ${secs}d`;
  };

  // Relative time helper
  const getRelativeText = (dueMs: number, effectiveStatus: ItemStatus) => {
    const diff = dueMs - currentTime;

    if (effectiveStatus === "sudah") {
      return { text: "Sudah Selesai", statusClass: "normal" };
    }

    if (effectiveStatus === "tertinggal" || diff < 0) {
      const pastDays = Math.floor(Math.abs(diff) / 864e5);
      const pastHours = Math.floor((Math.abs(diff) % 864e5) / 36e5);
      const pastText = pastDays > 0 ? `${pastDays} hari` : `${pastHours} jam`;

      return { text: `Tertinggal ${pastText}`, statusClass: "late" };
    }

    const d = Math.floor(diff / 864e5);
    const h = Math.floor((diff % 864e5) / 36e5);
    const m = Math.floor((diff % 36e5) / 6e4);

    if (diff < 24 * 3600 * 1000) {
      const text = h > 0 ? `${h} jam ${m} mnt lagi` : `${m} mnt lagi`;

      return { text, statusClass: "urgent" };
    }

    const text = d > 0 ? `${d} hari ${h} jam lagi` : `${h} jam lagi`;

    return { text, statusClass: "normal" };
  };

  // Filtered Tasks
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const isDone = Boolean(doneMap[item.id]);
      const effStatus = getItemEffectiveStatus(item, isDone, currentTime);

      if (activeFilter === "tertinggal" && effStatus !== "tertinggal") {
        return false;
      }

      if (activeFilter === "belum" && effStatus !== "belum" && effStatus !== "draft") {
        return false;
      }

      if (activeFilter === "sudah" && effStatus !== "sudah") {
        return false;
      }

      if (activeFilter === "manual" && !item.isManual) {
        return false;
      }

      if (
        activeFilter !== "semua" &&
        activeFilter !== "manual" &&
        activeFilter !== "tertinggal" &&
        activeFilter !== "belum" &&
        activeFilter !== "sudah" &&
        item.type !== activeFilter
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchCourse = item.course.toLowerCase().includes(q);

        if (!matchTitle && !matchCourse) {
          return false;
        }
      }

      return true;
    });
  }, [allItems, activeFilter, searchQuery, doneMap, currentTime]);

  // List of items that are TERTINGGAL (overdue and not completed)
  const tertinggalItems = useMemo(() => {
    return allItems.filter((item) => {
      const isDone = Boolean(doneMap[item.id]);
      const eff = getItemEffectiveStatus(item, isDone, currentTime);

      return eff === "tertinggal";
    });
  }, [allItems, doneMap, currentTime]);

  // Next Closest Urgent Incomplete Item (Only for items that are not finished)
  const nextUrgentItem = useMemo(() => {
    return allItems.find((item) => {
      const isDone = Boolean(doneMap[item.id]);
      const eff = getItemEffectiveStatus(item, isDone, currentTime);

      return eff !== "sudah" && new Date(item.due).getTime() > currentTime;
    });
  }, [allItems, doneMap, currentTime]);

  // Stats
  const stats = useMemo(() => {
    const total = allItems.length;
    let completed = 0;
    let urgent24h = 0;
    let overdue = 0;

    allItems.forEach((i) => {
      const isDone = Boolean(doneMap[i.id]);
      const eff = getItemEffectiveStatus(i, isDone, currentTime);

      if (eff === "sudah") {
        completed++;
      } else if (eff === "tertinggal") {
        overdue++;
      } else {
        const ms = new Date(i.due).getTime() - currentTime;

        if (ms <= 24 * 3600 * 1000 && ms > 0) {
          urgent24h++;
        }
      }
    });

    return { total, completed, urgent24h, overdue };
  }, [allItems, doneMap, currentTime]);

  // Group items by date (Excludes completed items in the main list to keep focus, or includes them with opacity)
  const groupedItems = useMemo(() => {
    const groups: Record<string, DeadlineItem[]> = {};

    filteredItems.forEach((item) => {
      const d = new Date(item.due);
      const today = new Date();
      const tomorrow = new Date();

      tomorrow.setDate(today.getDate() + 1);

      let key = d.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      if (d.toDateString() === today.toDateString()) {
        key = `Hari Ini — ${key}`;
      } else if (d.toDateString() === tomorrow.toDateString()) {
        key = `Besok — ${key}`;
      }

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(item);
    });

    return groups;
  }, [filteredItems]);

  return (
    <>
      {/* Vercel Header */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="logo-icon">T</div>
            <div>
              <div className="brand-title">
                Tenggat Kuliah
                <span className="status-indicator">
                  <span className="pulse-dot"></span>
                  {currentUser ? currentUser.username : lmsItems.length > 0 ? "Tersinkron" : "Tamu"}
                </span>
              </div>
            </div>
          </div>

          <div className="nav-actions">
            {currentUser ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div
                  className="status-indicator"
                  style={{ gap: "4px", padding: "4px 8px", fontWeight: 500 }}
                  title={currentUser.email}
                >
                  <User size={13} />
                  <span className="btn-text-mobile">{currentUser.username}</span>
                </div>
                <button
                  className="btn btn-ghost btn-icon"
                  title="Keluar dari Akun"
                  onClick={handleLogout}
                  aria-label="Logout"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.85rem", gap: "6px" }}
                onClick={() => {
                  setAuthMode("login");
                  setShowAuthModal(true);
                }}
              >
                <LogIn size={15} />
                <span className="btn-text-mobile">Masuk</span>
              </button>
            )}

            <button
              className="btn btn-ghost btn-icon"
              title="Notifikasi"
              onClick={handleRequestNotif}
              aria-label="Toggle Notifikasi"
            >
              {notifGranted ? <Bell size={18} style={{ color: "var(--accent-emerald)" }} /> : <BellOff size={18} />}
            </button>

            <button
              className="btn btn-ghost btn-icon"
              title="Ganti Tema"
              onClick={toggleTheme}
              aria-label="Toggle Tema"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button
              className="btn btn-ghost btn-icon desktop-only-icon"
              title="Pengaturan Kalender LMS"
              onClick={() => setShowSettings(true)}
              aria-label="Pengaturan Kalender"
            >
              <Settings size={18} />
            </button>

            {activeView === "tasks" ? (
              <button
                className="btn btn-primary desktop-add-btn"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={16} />
                <span>Tambah Tugas</span>
              </button>
            ) : (
              <button
                className="btn btn-primary desktop-add-btn"
                onClick={openNewNoteModal}
              >
                <Plus size={16} />
                <span>Tambah Catatan</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        {/* Navigation Switcher: Tenggat Tugas vs Catatan */}
        <div className="view-switcher desktop-only-switcher" role="tablist">
          <button
            role="tab"
            aria-selected={activeView === "tasks"}
            className={`view-btn ${activeView === "tasks" ? "active" : ""}`}
            onClick={() => setActiveView("tasks")}
          >
            <Calendar size={15} />
            <span>Tenggat Tugas</span>
          </button>

          <button
            role="tab"
            aria-selected={activeView === "notes"}
            className={`view-btn ${activeView === "notes" ? "active" : ""}`}
            onClick={() => setActiveView("notes")}
          >
            <FileText size={15} />
            <span>Catatan</span>
            {notes.length > 0 && (
              <span
                style={{
                  fontSize: "0.72rem",
                  background: "var(--border)",
                  padding: "1px 6px",
                  borderRadius: "99px",
                }}
              >
                {notes.length}
              </span>
            )}
          </button>
        </div>

        {activeView === "tasks" ? (
          <>
            {/* Error Alert */}
            {errorMsg && (
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: "12px",
                  background: "var(--danger-bg)",
                  border: "1px solid rgba(238,0,0,0.3)",
                  color: "var(--accent-red)",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "0.9rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <AlertTriangle size={18} />
                  <span>{errorMsg}</span>
                </div>
                <button
                  className="btn"
                  style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                  onClick={() => setShowSettings(true)}
                >
                  Atur Sekarang
                </button>
              </div>
            )}

            {/* Bagian Khusus: Tugas Tertinggal (Paling Atas) */}
            {tertinggalItems.length > 0 && activeFilter !== "sudah" && (
              <section className="tertinggal-container">
                <div className="tertinggal-header">
                  <div className="tertinggal-title">
                    <AlertTriangle size={18} />
                    <span>Perhatian: {tertinggalItems.length} Tugas Tertinggal</span>
                  </div>
                  <span style={{ fontSize: "0.8rem", opacity: 0.85 }}>
                    Belum dikerjakan &amp; lewat tenggat
                  </span>
                </div>

                {tertinggalItems.map((item) => (
                  <article
                    key={`late-${item.id}`}
                    className="task-item is-late"
                    style={{ marginBottom: "8px" }}
                  >
                    <input
                      type="checkbox"
                      className="task-checkbox"
                      checked={Boolean(doneMap[item.id])}
                      onChange={() => toggleDone(item.id)}
                      aria-label="Tandai selesai"
                    />

                    <div className="task-content">
                      <div className="task-badges">
                        <span className="status-pill status-tertinggal">TERTINGGAL</span>
                        <span className={`type-pill type-${item.type}`}>{item.type}</span>
                        <span className="course-tag">{item.course}</span>
                      </div>

                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="task-title"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <span className="task-title">{item.title}</span>
                      )}
                    </div>

                    <div className="task-meta">
                      <div className="time-str">
                        {new Date(item.due).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>

                      <span className="relative-badge late">
                        Lewat {getRelativeText(new Date(item.due).getTime(), "tertinggal").text.replace("Tertinggal ", "")}
                      </span>

                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-icon"
                          style={{ width: "28px", height: "28px" }}
                          title="Buka Link LMS"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            )}

            {/* Hero Urgency Card (Hanya untuk tugas yang BELUM selesai) */}
            {nextUrgentItem && (
              <section className="urgency-card">
                <div className="urgency-badge">
                  <Sparkles size={14} />
                  Tenggat Paling Dekat
                </div>

                <h2 className="urgency-title">{nextUrgentItem.title}</h2>

                <div className="urgency-course">
                  <BookOpen size={14} style={{ display: "inline", marginRight: "6px" }} />
                  {nextUrgentItem.course} ·{" "}
                  <span style={{ textTransform: "capitalize", color: "var(--accent-blue)" }}>
                    {nextUrgentItem.type}
                  </span>
                </div>

                <div className="countdown-box">
                  <div>
                    <div className="countdown-val">
                      {formatCountdown(new Date(nextUrgentItem.due).getTime())}
                    </div>
                    <div className="countdown-label">
                      Waktu tersisa menuju{" "}
                      {new Date(nextUrgentItem.due).toLocaleTimeString("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      WIB
                    </div>
                  </div>
                </div>

                <div className="urgency-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => toggleDone(nextUrgentItem.id)}
                  >
                    <CheckCircle2 size={16} />
                    Tandai Selesai
                  </button>

                  {nextUrgentItem.link && (
                    <a
                      href={nextUrgentItem.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                    >
                      <ExternalLink size={16} />
                      Buka di LMS
                    </a>
                  )}
                </div>
              </section>
            )}

            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">
                  <Calendar size={15} />
                  Total Deadline
                </div>
                <div className="stat-val">{stats.total}</div>
              </div>

              <div className="stat-card">
                <div className="stat-label" style={{ color: "var(--accent-amber)" }}>
                  <Clock size={15} />
                  Kurang dari 24 Jam
                </div>
                <div className="stat-val" style={{ color: "var(--accent-amber)" }}>
                  {stats.urgent24h}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label" style={{ color: "var(--accent-red)" }}>
                  <AlertTriangle size={15} />
                  Tertinggal
                </div>
                <div className="stat-val" style={{ color: "var(--accent-red)" }}>
                  {stats.overdue}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label" style={{ color: "var(--accent-emerald)" }}>
                  <CheckCircle2 size={15} />
                  Tugas Selesai
                </div>
                <div className="stat-val" style={{ color: "var(--accent-emerald)" }}>
                  {stats.completed}
                </div>
              </div>
            </div>

            {/* Controls: Search, Tabs & Refresh */}
            <div className="controls-bar">
              <div className="search-row">
                <div className="search-input-wrapper">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Cari nama mata kuliah atau judul tugas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <button
                  className="btn btn-icon"
                  title="Perbarui data kalender"
                  onClick={() => fetchDeadlines()}
                  disabled={loading}
                  aria-label="Refresh Data"
                >
                  <RefreshCw size={16} className={loading ? "spin" : ""} />
                </button>
              </div>

              <div className="filter-tabs" role="tablist">
                {FILTER_KEYS.map((key) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={activeFilter === key}
                    className={`tab-btn ${activeFilter === key ? "active" : ""}`}
                    onClick={() => setActiveFilter(key)}
                  >
                    {TYPE_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline Grouped List */}
            {Object.keys(groupedItems).length === 0 ? (
              <div className="empty-box">
                <Calendar size={36} className="empty-icon" />
                <div className="empty-title">Tidak ada tugas ditemukan</div>
                <p style={{ fontSize: "0.875rem" }}>
                  {searchQuery ? "Coba ubah kata kunci pencarian Anda." : "Semua tugas pada filter ini telah beres."}
                </p>
              </div>
            ) : (
              Object.entries(groupedItems).map(([dateKey, items]) => (
                <div key={dateKey} className="date-group">
                  <div className="date-header">
                    <span>{dateKey}</span>
                    <div className="date-line"></div>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {items.length} tugas
                    </span>
                  </div>

                  {items.map((item) => {
                    const isDone = Boolean(doneMap[item.id]);
                    const dueTime = new Date(item.due).getTime();
                    const effStatus = getItemEffectiveStatus(item, isDone, currentTime);
                    const rel = getRelativeText(dueTime, effStatus);
                    const isLate = effStatus === "tertinggal";

                    return (
                      <article
                        key={item.id}
                        className={`task-item ${effStatus === "sudah" ? "is-done" : ""} ${isLate ? "is-late" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="task-checkbox"
                          checked={isDone}
                          onChange={() => toggleDone(item.id)}
                          aria-label="Tandai selesai"
                        />

                        <div className="task-content">
                          <div className="task-badges">
                            <span className={`status-pill status-${effStatus}`}>
                              {effStatus === "tertinggal"
                                ? "TERTINGGAL"
                                : effStatus === "sudah"
                                ? "SUDAH"
                                : effStatus === "draft"
                                ? "DRAFT"
                                : "BELUM"}
                            </span>

                            <span className={`type-pill type-${item.type}`}>{item.type}</span>
                            <span className="course-tag">{item.course}</span>
                          </div>

                          {item.link ? (
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="task-title"
                            >
                              {item.title}
                            </a>
                          ) : (
                            <span className="task-title">{item.title}</span>
                          )}

                          {item.desc && <div className="task-desc">{item.desc}</div>}
                        </div>

                        <div className="task-meta">
                          <div className="time-str">
                            {new Date(item.due).toLocaleTimeString("id-ID", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>

                          <span className={`relative-badge ${rel.statusClass}`}>{rel.text}</span>

                          <div className="task-actions">
                            {item.link && (
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-ghost btn-icon"
                                style={{ width: "28px", height: "28px" }}
                                title="Buka Link LMS"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}

                            {item.isManual && (
                              <button
                                className="btn btn-ghost btn-icon"
                                style={{ width: "28px", height: "28px", color: "var(--accent-red)" }}
                                onClick={() => deleteManual(item.id)}
                                title="Hapus Tugas Manual"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))
            )}
          </>
        ) : (
          /* Notes View */
          <div>
            <div className="controls-bar">
              <div className="search-row">
                <div className="search-input-wrapper">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Cari judul catatan, isi materi, atau mata kuliah..."
                    value={noteSearchQuery}
                    onChange={(e) => setNoteSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="filter-tabs" role="tablist">
                {NOTE_CATEGORY_KEYS.map((key) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={activeNoteCategory === key}
                    className={`tab-btn ${activeNoteCategory === key ? "active" : ""}`}
                    onClick={() => setActiveNoteCategory(key)}
                  >
                    {NOTE_CATEGORIES[key]}
                  </button>
                ))}
              </div>
            </div>

            {filteredNotes.length === 0 ? (
              <div className="empty-box">
                <FileText size={36} className="empty-icon" />
                <div className="empty-title">Belum ada catatan</div>
                <p style={{ fontSize: "0.875rem", marginBottom: "16px" }}>
                  Catat evaluasi tugas, kisi-kisi ujian matkul, atau rencana kerjaan kuliah Anda di sini.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={openNewNoteModal}
                >
                  <Plus size={16} />
                  <span>Buat Catatan Pertama</span>
                </button>
              </div>
            ) : (
              <div className="notes-grid">
                {filteredNotes.map((note) => (
                  <article
                    key={note.id}
                    className={`note-card ${note.pinned ? "is-pinned" : ""}`}
                  >
                    <div>
                      <div className="note-card-header">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span className={`type-pill type-${note.category}`}>
                            {note.category === "matkul"
                              ? "Matkul"
                              : note.category === "evaluasi"
                              ? "Evaluasi"
                              : note.category === "kerjaan"
                              ? "Kerjaan"
                              : "Umum"}
                          </span>

                          {note.course && (
                            <span className="course-tag">
                              <Tag size={11} style={{ display: "inline", marginRight: "3px" }} />
                              {note.course}
                            </span>
                          )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                          <button
                            className="btn btn-ghost btn-icon"
                            style={{
                              width: "28px",
                              height: "28px",
                              color: note.pinned ? "var(--accent-blue)" : "var(--text-muted)",
                            }}
                            title={note.pinned ? "Lepas sematan" : "Sematkan ke atas"}
                            onClick={() => handleTogglePinNote(note.id, note.pinned)}
                          >
                            <Pin size={14} />
                          </button>

                          <button
                            className="btn btn-ghost btn-icon"
                            style={{ width: "28px", height: "28px", color: "var(--accent-red)" }}
                            title="Hapus Catatan"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <h3
                        className="note-card-title"
                        style={{ cursor: "pointer", marginTop: "10px" }}
                        onClick={() => openEditNoteModal(note)}
                      >
                        {note.title}
                      </h3>

                      <div
                        className="note-card-body"
                        style={{ cursor: "pointer" }}
                        onClick={() => openEditNoteModal(note)}
                      >
                        {note.content}
                      </div>
                    </div>

                    <div className="note-card-footer">
                      <span>
                        Diperbarui:{" "}
                        {new Date(note.updatedAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>

                      <button
                        className="btn btn-ghost"
                        style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                        onClick={() => openEditNoteModal(note)}
                      >
                        Edit
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer info */}
        {lastUpdated && activeView === "tasks" && (
          <div
            style={{
              textAlign: "center",
              marginTop: "40px",
              fontSize: "0.8rem",
              color: "var(--text-muted)",
            }}
          >
            Terakhir diperbarui: {new Date(lastUpdated * 1000).toLocaleTimeString("id-ID")} WIB
          </div>
        )}
      </main>

      {/* Modal: Tambah / Edit Catatan */}
      {showNoteModal && (
        <div className="modal-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="modal-header">
              <h3 className="modal-title">
                {editingNoteId ? "Edit Catatan" : "Tambah Catatan Khusus"}
              </h3>

              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowNoteModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNote}>
              <div className="form-group">
                <label className="form-label">Judul Catatan</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Contoh: Evaluasi Nilai UTS Pemrograman Web"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Kategori Catatan</label>
                  <select
                    className="form-select"
                    value={noteCategory}
                    onChange={(e) => {
                      const v = e.target.value;

                      if (v === "matkul" || v === "evaluasi" || v === "kerjaan" || v === "umum") {
                        setNoteCategory(v);
                      }
                    }}
                  >
                    <option value="matkul">Catatan Matkul</option>
                    <option value="evaluasi">Evaluasi</option>
                    <option value="kerjaan">Kerjaan / Proyek</option>
                    <option value="umum">Umum</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Mata Kuliah (opsional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: Pemrograman Web"
                    value={noteCourse}
                    onChange={(e) => setNoteCourse(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Isi Catatan</label>
                <textarea
                  required
                  className="form-textarea"
                  rows={5}
                  placeholder="Tuliskan catatan evaluasi tugas, kisi-kisi ujian, atau materi penting..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                ></textarea>
              </div>

              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  id="note-pin"
                  checked={notePinned}
                  onChange={(e) => setNotePinned(e.target.checked)}
                />
                <label htmlFor="note-pin" style={{ fontSize: "0.85rem", cursor: "pointer" }}>
                  Sematkan catatan ini di posisi paling atas
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowNoteModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingNoteId ? "Simpan Perubahan" : "Simpan Catatan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Login & Buat Akun */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="modal-header">
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className={`btn ${authMode === "login" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                  }}
                >
                  Masuk Akun
                </button>
                <button
                  type="button"
                  className={`btn ${authMode === "register" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError(null);
                  }}
                >
                  Daftar Akun
                </button>
              </div>

              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowAuthModal(false)}
              >
                ✕
              </button>
            </div>

            {authError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "var(--danger-bg)",
                  color: "var(--accent-red)",
                  fontSize: "0.85rem",
                  marginBottom: "16px",
                }}
              >
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              {authMode === "register" && (
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Nama pengguna"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  {authMode === "login" ? "Email atau Username" : "Email"}
                </label>
                <input
                  type={authMode === "login" ? "text" : "email"}
                  required
                  className="form-input"
                  placeholder={authMode === "login" ? "contoh@email.com atau username" : "contoh@email.com"}
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  className="form-input"
                  placeholder="Minimal 6 karakter"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowAuthModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={authLoading}>
                  {authLoading ? "Memproses..." : authMode === "login" ? "Masuk" : "Daftar Akun"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah Tugas Manual */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="modal-header">
              <h3 className="modal-title">Tambah Tugas Manual</h3>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddManual}>
              <div className="form-group">
                <label className="form-label">Judul Tugas</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Contoh: Laporan Akhir Praktikum Jaringan"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mata Kuliah / Topik</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Jaringan Komputer"
                  value={newCourse}
                  onChange={(e) => setNewCourse(e.target.value)}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="form-group">
                  <label className="form-label">Tipe Kegiatan</label>
                  <select
                    className="form-select"
                    value={newType}
                    onChange={(e) => {
                      const v = e.target.value;

                      if (v === "tugas" || v === "kuis" || v === "forum" || v === "kelompok" || v === "manual") {
                        setNewType(v);
                      }
                    }}
                  >
                    <option value="tugas">Tugas</option>
                    <option value="kuis">Kuis / Ujian</option>
                    <option value="forum">Forum / Diskusi</option>
                    <option value="kelompok">Kelompok</option>
                    <option value="manual">Manual Pribadi</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Jam Tenggat</label>
                  <input
                    type="time"
                    className="form-input"
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Tanggal Tenggat</label>
                <input
                  type="date"
                  required
                  className="form-input"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Catatan Tambahan (opsional)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Keterangan singkat, petunjuk pengerjaan, atau link referensi..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                ></textarea>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowAddModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pengaturan Kalender iCal */}
      {/* Modal: Pengaturan Kalender iCal & Integrasi Telegram */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="modal-header">
              <h3 className="modal-title">Pengaturan &amp; Integrasi</h3>
              <button
                className="btn btn-ghost btn-icon"
                onClick={() => setShowSettings(false)}
              >
                ✕
              </button>
            </div>

            <div className="settings-tabs">
              <button
                type="button"
                className={`settings-tab-btn ${settingsTab === "ical" ? "active" : ""}`}
                onClick={() => setSettingsTab("ical")}
              >
                Kalender LMS
              </button>
              <button
                type="button"
                className={`settings-tab-btn ${settingsTab === "telegram" ? "active" : ""}`}
                onClick={() => setSettingsTab("telegram")}
              >
                Bot Telegram
                {telegramToken.trim() && telegramChatId.trim() ? (
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "var(--accent-emerald)",
                      display: "inline-block",
                    }}
                  />
                ) : null}
              </button>
              <button
                type="button"
                className={`settings-tab-btn ${settingsTab === "whatsapp" ? "active" : ""}`}
                onClick={() => setSettingsTab("whatsapp")}
              >
                WhatsApp
                {whatsappToken.trim() && whatsappPhone.trim() ? (
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "var(--accent-emerald)",
                      display: "inline-block",
                    }}
                  />
                ) : null}
              </button>
            </div>

            <form onSubmit={handleSaveSettings}>
              {settingsTab === "ical" && (
                <>
                  <div className="form-group">
                    <label className="form-label">Link iCal Moodle / LMS Telkom University</label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://lms.telkomuniversity.ac.id/calendar/export_execute.php?userid=...&authtoken=..."
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                    />
                  </div>

                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-sub)",
                      lineHeight: "1.5",
                      background: "var(--bg)",
                      padding: "12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      marginBottom: "16px",
                    }}
                  >
                    <strong>Cara mendapatkan link iCal:</strong>
                    <ol style={{ paddingLeft: "18px", marginTop: "4px" }}>
                      <li>Buka <code>lms.telkomuniversity.ac.id/calendar/view.php</code></li>
                      <li>Scroll ke paling bawah, klik <strong>Export calendar</strong></li>
                      <li>Pilih: <em>All events</em> &amp; <em>Recent and next 60 days</em></li>
                      <li>Klik <strong>Get calendar URL</strong> dan salin linknya ke sini</li>
                    </ol>
                  </div>
                </>
              )}

              {settingsTab === "telegram" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "14px",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Status Integrasi Bot</span>
                    {telegramToken.trim() && telegramChatId.trim() ? (
                      <span className="telegram-status-badge connected">
                        Terhubung
                      </span>
                    ) : (
                      <span className="telegram-status-badge disconnected">
                        Belum Dikonfigurasi
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bot Token Telegram (dari @BotFather)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: 7123456789:AAHk..."
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Chat ID Telegram (dari @userinfobot)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: 123456789 atau -100..."
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                    />
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={telegramAlertsEnabled}
                        onChange={(e) => setTelegramAlertsEnabled(e.target.checked)}
                      />
                      <span>Kirim pengingat otomatis (H-24 jam &amp; H-3 jam)</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={handleTestTelegram}
                      disabled={telegramTesting}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        width: "100%",
                        justifyContent: "center",
                      }}
                    >
                      <Send size={14} />
                      <span>{telegramTesting ? "Mengirim Pesan Uji Coba..." : "Kirim Pesan Uji Coba ke Telegram"}</span>
                    </button>
                  </div>

                  {telegramTestStatus ? (
                    <div className={`telegram-feedback-box ${telegramTestStatus.type}`}>
                      <span>{telegramTestStatus.type === "success" ? "✓" : "!"}</span>
                      <span>{telegramTestStatus.message}</span>
                    </div>
                  ) : null}

                  {/* Webhook Card */}
                  <div className="telegram-webhook-card">
                    <div className="webhook-header">
                      <strong>🔗 Status Webhook (Interaksi Bot)</strong>
                      {telegramWebhookUrl ? (
                        <span className="telegram-status-badge connected">Aktif</span>
                      ) : (
                        <span className="telegram-status-badge disconnected">Belum Terhubung</span>
                      )}
                    </div>
                    {telegramWebhookUrl ? (
                      <div className="webhook-url">{telegramWebhookUrl}</div>
                    ) : (
                      <p style={{ color: "var(--text-sub)", fontSize: "0.78rem", marginBottom: "8px" }}>
                        Daftarkan webhook agar bot dapat merespons perintah <code>/tugas</code>, <code>/tertinggal</code>, dan tombol centang selesai.
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={handleSyncWebhook}
                      disabled={telegramWebhookLoading || !telegramToken.trim()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        width: "100%",
                        justifyContent: "center",
                        fontSize: "0.8rem",
                      }}
                    >
                      <RefreshCw size={13} className={telegramWebhookLoading ? "spin" : ""} />
                      <span>{telegramWebhookLoading ? "Mendaftarkan Webhook..." : "Sinkronkan Webhook Otomatis"}</span>
                    </button>
                    {telegramWebhookStatus ? (
                      <div
                        className={`telegram-feedback-box ${telegramWebhookStatus.type}`}
                        style={{ marginTop: "10px", marginBottom: "0" }}
                      >
                        <span>{telegramWebhookStatus.type === "success" ? "✓" : "!"}</span>
                        <span>{telegramWebhookStatus.message}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="telegram-guide-box">
                    <strong>Panduan Menghubungkan Bot:</strong>
                    <ol style={{ paddingLeft: "18px", marginTop: "4px" }}>
                      <li>Buka Telegram, cari <code>@BotFather</code>, lalu ketik <code>/newbot</code>. Ikuti instruksi dan salin HTTP API Token ke kolom atas.</li>
                      <li>Buka <code>@userinfobot</code> di Telegram untuk melihat <strong>Id</strong> akun Anda, lalu salin ke Chat ID.</li>
                      <li>Klik <strong>Kirim Pesan Uji Coba ke Telegram</strong> untuk memastikan koneksi aktif.</li>
                      <li>Ketik <code>/tugas</code> di Telegram Anda untuk melihat daftar tugas dan mencentang selesai secara interaktif!</li>
                    </ol>
                  </div>
                </>
              )}

              {settingsTab === "whatsapp" && (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "14px",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Status WhatsApp Gateway</span>
                    {whatsappDevice?.device_status === "connect" || (whatsappToken.trim() && whatsappPhone.trim()) ? (
                      <span className="telegram-status-badge connected">
                        Terhubung ({whatsappDevice?.name || "Fonnte"})
                      </span>
                    ) : (
                      <span className="telegram-status-badge disconnected">
                        Belum Dikonfigurasi
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Fonnte API Token (dari fonnte.com)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: r1D5UfhNuNSigZz1jWZE"
                      value={whatsappToken}
                      onChange={(e) => setWhatsappToken(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Nomor WhatsApp Tujuan (Pribadi / Grup)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: 6281931905436 atau 0819..."
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                    />
                  </div>

                  {whatsappDevice ? (
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-sub)",
                        background: "var(--bg)",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        marginBottom: "14px",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>📱 Nomor Device: <strong>{whatsappDevice.device || "-"}</strong></span>
                      <span>💬 Sisa Kuota: <strong>{whatsappDevice.quota ?? "1000"} pesan</strong></span>
                    </div>
                  ) : null}

                  <div style={{ marginBottom: "14px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={whatsappAlertsEnabled}
                        onChange={(e) => setWhatsappAlertsEnabled(e.target.checked)}
                      />
                      <span>Kirim pengingat WhatsApp otomatis (H-24 jam &amp; H-3 jam)</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={handleTestWhatsApp}
                      disabled={whatsappTesting}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        width: "100%",
                        justifyContent: "center",
                      }}
                    >
                      <Send size={14} />
                      <span>{whatsappTesting ? "Mengirim Pesan Uji Coba WhatsApp..." : "Kirim Pesan Uji Coba ke WhatsApp"}</span>
                    </button>
                  </div>

                  {whatsappTestStatus ? (
                    <div className={`telegram-feedback-box ${whatsappTestStatus.type}`}>
                      <span>{whatsappTestStatus.type === "success" ? "✓" : "!"}</span>
                      <span>{whatsappTestStatus.message}</span>
                    </div>
                  ) : null}

                  <div className="telegram-guide-box">
                    <strong>Panduan Bot WhatsApp (Fonnte):</strong>
                    <ol style={{ paddingLeft: "18px", marginTop: "4px" }}>
                      <li>Buka <code>fonnte.com</code> dan masuk ke akun Anda.</li>
                      <li>Pada menu <strong>Device</strong>, hubungkan nomor WhatsApp Anda dengan melakukan scan QR.</li>
                      <li>Salin API Token perangkat ke form di atas.</li>
                      <li>Masukkan nomor WhatsApp Anda atau nomor grup kelas untuk menerima notifikasi otomatis.</li>
                    </ol>
                  </div>
                </>
              )}

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowSettings(false)}
                >
                  Tutup
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Pengaturan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Navigasi Menu Mobile">
        <button
          type="button"
          className={`mobile-nav-item ${activeView === "tasks" ? "active" : ""}`}
          onClick={() => setActiveView("tasks")}
          aria-label="Daftar Tugas"
        >
          <div className="mobile-nav-icon-wrap">
            <Calendar size={20} />
            {stats.overdue > 0 ? (
              <span className="mobile-nav-badge danger">{stats.overdue}</span>
            ) : stats.urgent24h > 0 ? (
              <span className="mobile-nav-badge warning">{stats.urgent24h}</span>
            ) : null}
          </div>
          <span className="mobile-nav-label">Tugas</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeView === "notes" ? "active" : ""}`}
          onClick={() => setActiveView("notes")}
          aria-label="Catatan Pribadi"
        >
          <div className="mobile-nav-icon-wrap">
            <FileText size={20} />
            {notes.length > 0 && (
              <span className="mobile-nav-badge info">{notes.length}</span>
            )}
          </div>
          <span className="mobile-nav-label">Catatan</span>
        </button>

        <button
          type="button"
          className="mobile-nav-center-action"
          onClick={() => (activeView === "tasks" ? setShowAddModal(true) : openNewNoteModal())}
          title={activeView === "tasks" ? "Tambah Tugas Baru" : "Tambah Catatan Baru"}
          aria-label={activeView === "tasks" ? "Tambah Tugas Baru" : "Tambah Catatan Baru"}
        >
          <Plus size={22} />
        </button>

        <button
          type="button"
          className="mobile-nav-item"
          onClick={() => setShowSettings(true)}
          aria-label="Pengaturan Aplikasi"
        >
          <div className="mobile-nav-icon-wrap">
            <Settings size={20} />
          </div>
          <span className="mobile-nav-label">Setelan</span>
        </button>
      </nav>
    </>
  );
}
