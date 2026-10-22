import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  icalUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramAlertsEnabled?: boolean;
  notifiedAlerts?: Record<string, string[]>;
  whatsappToken?: string;
  whatsappTargetPhone?: string;
  whatsappAlertsEnabled?: boolean;
  notifiedWhatsAppAlerts?: Record<string, string[]>;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  userId: string;
  title: string;
  course: string;
  type: "tugas" | "kuis" | "forum" | "kelompok" | "manual";
  due: string;
  desc?: string;
  done: boolean;
  isManual: boolean;
  createdAt: string;
}

export interface NoteRecord {
  id: string;
  userId: string;
  title: string;
  category: "matkul" | "evaluasi" | "kerjaan" | "umum";
  course?: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface PasswordHashResult {
  hash: string;
  salt: string;
}

export interface GlobalSettings {
  icalUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  telegramAlertsEnabled?: boolean;
  notifiedAlerts?: Record<string, string[]>;
  whatsappToken?: string;
  whatsappTargetPhone?: string;
  whatsappAlertsEnabled?: boolean;
  notifiedWhatsAppAlerts?: Record<string, string[]>;
}

interface DatabaseSchema {
  users: UserRecord[];
  tasks: TaskRecord[];
  notes: NoteRecord[];
  sessions: SessionRecord[];
  settings?: GlobalSettings;
}

const SEED_DB_PATH = resolve(process.cwd(), "data", "database.json");

const DB_PATH = process.env.VERCEL
  ? resolve("/tmp", "database.json")
  : SEED_DB_PATH;

function getInitialSchema(): DatabaseSchema {
  return {
    users: [],
    tasks: [],
    notes: [],
    sessions: [],
    settings: {
      telegramAlertsEnabled: true,
      notifiedAlerts: {},
    },
  };
}

function ensureDatabase(): DatabaseSchema {
  const dir = dirname(DB_PATH);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(DB_PATH)) {
    if (existsSync(SEED_DB_PATH)) {
      try {
        const seedRaw = readFileSync(SEED_DB_PATH, "utf-8");

        writeFileSync(DB_PATH, seedRaw, "utf-8");
      } catch {
        const initial = getInitialSchema();

        writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), "utf-8");
      }
    } else {
      const initial = getInitialSchema();

      writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), "utf-8");
    }
  }

  try {
    const raw = readFileSync(DB_PATH, "utf-8");

    // SAFETY: Validated parsed schema fields below with Array.isArray checks
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;

    const defaultSettings: GlobalSettings = {
      telegramAlertsEnabled: true,
      notifiedAlerts: {},
    };

    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      settings: parsed.settings ?? defaultSettings,
    };
  } catch {
    const fallback = getInitialSchema();

    writeFileSync(DB_PATH, JSON.stringify(fallback, null, 2), "utf-8");

    return fallback;
  }
}

function saveDatabase(data: DatabaseSchema): void {
  const dir = dirname(DB_PATH);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function hashPassword(password: string): PasswordHashResult {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);

  return {
    hash: derivedKey.toString("hex"),
    salt,
  } satisfies PasswordHashResult;
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const keyBuffer = Buffer.from(hash, "hex");
    const derivedKey = scryptSync(password, salt, 64);

    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

// User methods
export function getAllUsers(): UserRecord[] {
  const db = ensureDatabase();

  return db.users;
}

export function findUserByEmailOrUsername(identifier: string): UserRecord | null {
  const db = ensureDatabase();
  const lower = identifier.toLowerCase().trim();

  for (const user of db.users) {
    if (user.email.toLowerCase() === lower || user.username.toLowerCase() === lower) {
      return user;
    }
  }

  return null;
}

export function findUserById(id: string): UserRecord | null {
  const db = ensureDatabase();

  for (const user of db.users) {
    if (user.id === id) {
      return user;
    }
  }

  return null;
}

export function createUser(username: string, email: string, passwordHash: string, salt: string): UserRecord {
  const db = ensureDatabase();

  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${randomBytes(4).toString("hex")}`,
    username: username.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  saveDatabase(db);

  return newUser;
}

export function updateUserIcalUrl(userId: string, icalUrl: string): boolean {
  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return false;
  }

  user.icalUrl = icalUrl.trim();
  saveDatabase(db);

  return true;
}

// Session methods
export function createSession(userId: string): string {
  const db = ensureDatabase();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const session: SessionRecord = {
    token,
    userId,
    expiresAt: expires.toISOString(),
  };

  const now = new Date().toISOString();

  db.sessions = db.sessions.filter((s) => s.expiresAt > now);
  db.sessions.push(session);

  saveDatabase(db);

  return token;
}

export function getSessionUser(token: string): UserRecord | null {
  if (!token) {
    return null;
  }

  const db = ensureDatabase();
  const now = new Date().toISOString();
  const session = db.sessions.find((s) => s.token === token && s.expiresAt > now);

  if (!session) {
    return null;
  }

  return findUserById(session.userId);
}

export function deleteSession(token: string): void {
  const db = ensureDatabase();

  db.sessions = db.sessions.filter((s) => s.token !== token);
  saveDatabase(db);
}

// Tasks methods
export function getAllTasks(): TaskRecord[] {
  const db = ensureDatabase();

  return db.tasks;
}

export function getUserTasks(userId: string): TaskRecord[] {
  const db = ensureDatabase();

  return db.tasks.filter((t) => t.userId === userId);
}

export function addTask(taskData: Omit<TaskRecord, "id" | "createdAt">): TaskRecord {
  const db = ensureDatabase();

  const newTask: TaskRecord = {
    ...taskData,
    id: `task_${Date.now()}_${randomBytes(4).toString("hex")}`,
    createdAt: new Date().toISOString(),
  };

  db.tasks.push(newTask);
  saveDatabase(db);

  return newTask;
}

export function toggleTaskDone(userId: string, taskId: string): boolean {
  const db = ensureDatabase();
  const task = db.tasks.find((t) => t.id === taskId && t.userId === userId);

  if (!task) {
    return false;
  }

  task.done = !task.done;
  saveDatabase(db);

  return true;
}

export function deleteTask(userId: string, taskId: string): boolean {
  const db = ensureDatabase();
  const prevCount = db.tasks.length;

  db.tasks = db.tasks.filter((t) => !(t.id === taskId && t.userId === userId));

  if (db.tasks.length !== prevCount) {
    saveDatabase(db);

    return true;
  }

  return false;
}

// Notes methods
export function getAllNotes(): NoteRecord[] {
  const db = ensureDatabase();

  return db.notes.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function getUserNotes(userId: string): NoteRecord[] {
  const db = ensureDatabase();

  return db.notes
    .filter((n) => n.userId === userId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

export function addNote(noteData: Omit<NoteRecord, "id" | "createdAt" | "updatedAt">): NoteRecord {
  const db = ensureDatabase();
  const now = new Date().toISOString();

  const newNote: NoteRecord = {
    ...noteData,
    id: `note_${Date.now()}_${randomBytes(4).toString("hex")}`,
    createdAt: now,
    updatedAt: now,
  };

  db.notes.push(newNote);
  saveDatabase(db);

  return newNote;
}

export function updateNote(
  userId: string,
  noteId: string,
  updates: Partial<Pick<NoteRecord, "title" | "category" | "course" | "content" | "pinned">>
): NoteRecord | null {
  const db = ensureDatabase();
  const note = db.notes.find((n) => n.id === noteId && n.userId === userId);

  if (!note) {
    return null;
  }

  if (updates.title !== undefined) {
    note.title = updates.title;
  }

  if (updates.category !== undefined) {
    note.category = updates.category;
  }

  if (updates.course !== undefined) {
    note.course = updates.course;
  }

  if (updates.content !== undefined) {
    note.content = updates.content;
  }

  if (updates.pinned !== undefined) {
    note.pinned = updates.pinned;
  }

  note.updatedAt = new Date().toISOString();
  saveDatabase(db);

  return note;
}

export function deleteNote(userId: string, noteId: string): boolean {
  const db = ensureDatabase();
  const prevCount = db.notes.length;

  db.notes = db.notes.filter((n) => !(n.id === noteId && n.userId === userId));

  if (db.notes.length !== prevCount) {
    saveDatabase(db);

    return true;
  }

  return false;
}

// Settings & Telegram methods
export function getGlobalSettings(): GlobalSettings {
  const db = ensureDatabase();

  return (
    db.settings ?? {
      telegramAlertsEnabled: true,
      notifiedAlerts: {},
    }
  );
}

export function updateGlobalSettings(updates: Partial<GlobalSettings>): GlobalSettings {
  const db = ensureDatabase();

  const current = db.settings ?? {
    telegramAlertsEnabled: true,
    notifiedAlerts: {},
  };

  const updated: GlobalSettings = {
    ...current,
    ...updates,
  };

  db.settings = updated;
  saveDatabase(db);

  return updated;
}

export function updateUserTelegram(
  userId: string,
  token?: string,
  chatId?: string,
  enabled?: boolean
): boolean {
  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return false;
  }

  if (token !== undefined) {
    user.telegramBotToken = token.trim();
  }

  if (chatId !== undefined) {
    user.telegramChatId = chatId.trim();
  }

  if (enabled !== undefined) {
    user.telegramAlertsEnabled = enabled;
  }

  saveDatabase(db);

  return true;
}

export function updateUserWhatsApp(
  userId: string,
  token?: string,
  targetPhone?: string,
  enabled?: boolean
): boolean {
  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return false;
  }

  if (token !== undefined) {
    user.whatsappToken = token.trim();
  }

  if (targetPhone !== undefined) {
    user.whatsappTargetPhone = targetPhone.trim();
  }

  if (enabled !== undefined) {
    user.whatsappAlertsEnabled = enabled;
  }

  saveDatabase(db);

  return true;
}

export function isAlertAlreadyNotified(taskId: string, alertLevel: string): boolean {
  const settings = getGlobalSettings();
  const alertsMap = settings.notifiedAlerts ?? {};
  const levels = alertsMap[taskId] ?? [];

  return levels.includes(alertLevel);
}

export function markAlertNotified(taskId: string, alertLevel: string): void {
  const db = ensureDatabase();

  const settings = db.settings ?? {
    telegramAlertsEnabled: true,
    notifiedAlerts: {},
  };

  const alertsMap = settings.notifiedAlerts ?? {};
  const currentLevels = alertsMap[taskId] ?? [];

  if (!currentLevels.includes(alertLevel)) {
    alertsMap[taskId] = [...currentLevels, alertLevel];
  }

  settings.notifiedAlerts = alertsMap;
  db.settings = settings;
  saveDatabase(db);
}

export function isWhatsAppAlertAlreadyNotified(taskId: string, alertLevel: string): boolean {
  const settings = getGlobalSettings();
  const alertsMap = settings.notifiedWhatsAppAlerts ?? {};
  const levels = alertsMap[taskId] ?? [];

  return levels.includes(alertLevel);
}

export function markWhatsAppAlertNotified(taskId: string, alertLevel: string): void {
  const db = ensureDatabase();

  const settings = db.settings ?? {
    telegramAlertsEnabled: true,
    notifiedAlerts: {},
    whatsappAlertsEnabled: true,
    notifiedWhatsAppAlerts: {},
  };

  const alertsMap = settings.notifiedWhatsAppAlerts ?? {};
  const currentLevels = alertsMap[taskId] ?? [];

  if (!currentLevels.includes(alertLevel)) {
    alertsMap[taskId] = [...currentLevels, alertLevel];
  }

  settings.notifiedWhatsAppAlerts = alertsMap;
  db.settings = settings;
  saveDatabase(db);
}

export function isUserAlertAlreadyNotified(
  userId: string,
  taskId: string,
  alertLevel: string
): boolean {
  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return isAlertAlreadyNotified(taskId, alertLevel);
  }

  const alertsMap = user.notifiedAlerts ?? {};
  const levels = alertsMap[taskId] ?? [];

  return levels.includes(alertLevel);
}

export function markUserAlertNotified(
  userId: string,
  taskId: string,
  alertLevel: string
): void {
  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    markAlertNotified(taskId, alertLevel);

    return;
  }

  const alertsMap = user.notifiedAlerts ?? {};
  const currentLevels = alertsMap[taskId] ?? [];

  if (!currentLevels.includes(alertLevel)) {
    alertsMap[taskId] = [...currentLevels, alertLevel];
  }

  user.notifiedAlerts = alertsMap;
  saveDatabase(db);
}

export function isUserWhatsAppAlertAlreadyNotified(
  userId: string,
  taskId: string,
  alertLevel: string
): boolean {
  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    return isWhatsAppAlertAlreadyNotified(taskId, alertLevel);
  }

  const alertsMap = user.notifiedWhatsAppAlerts ?? {};
  const levels = alertsMap[taskId] ?? [];

  return levels.includes(alertLevel);
}

export function markUserWhatsAppAlertNotified(
  userId: string,
  taskId: string,
  alertLevel: string
): void {
  const db = ensureDatabase();
  const user = db.users.find((u) => u.id === userId);

  if (!user) {
    markWhatsAppAlertNotified(taskId, alertLevel);

    return;
  }

  const alertsMap = user.notifiedWhatsAppAlerts ?? {};
  const currentLevels = alertsMap[taskId] ?? [];

  if (!currentLevels.includes(alertLevel)) {
    alertsMap[taskId] = [...currentLevels, alertLevel];
  }

  user.notifiedWhatsAppAlerts = alertsMap;
  saveDatabase(db);
}

export function markTaskDoneByTitleOrId(identifier: string): boolean {
  const db = ensureDatabase();
  const lower = identifier.toLowerCase().trim();

  // Try finding in manual tasks
  for (const t of db.tasks) {
    if (t.id === identifier || t.title.toLowerCase().includes(lower)) {
      t.done = true;
      saveDatabase(db);

      return true;
    }
  }

  return false;
}
