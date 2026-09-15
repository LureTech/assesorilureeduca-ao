import type { createClient } from "@supabase/supabase-js";

/**
 * Supabase "de mentira", pra rodar o app sem banco enquanto o projeto não
 * existe. Imita só o pedaço da API que o app usa: tabelas, auth, storage,
 * functions e realtime.
 *
 * Os dados ficam no localStorage — cada navegador tem o seu banco, e limpar os
 * dados do site zera tudo. Qualquer e-mail e senha entram; e-mail que ainda não
 * existe vira admin, pra todas as telas ficarem acessíveis.
 */

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Result = {
  data: unknown;
  error: { message: string; code: string; details: string; hint: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};

const DB_KEY = "lure-demo-db";
const SESSION_KEY = "lure-demo-session";

/** Valores que o banco preencheria sozinho (default de coluna). */
const DEFAULTS: Record<string, Row> = {
  community_posts: { likes_count: 0, comments_count: 0 },
  profiles: { role: "member", active: true, avatar_url: null },
};

/** Chaves únicas do banco real que o app conta que existam. */
const UNIQUE: Record<string, string[]> = {
  community_post_likes: ["post_id", "user_id"],
  lesson_progress: ["user_id", "course_slug", "lesson_n"],
  lesson_videos: ["course_slug", "lesson_n"],
  notification_prefs: ["user_id"],
  push_subscriptions: ["endpoint"],
};

/** `on delete cascade`: apagar o pai leva junto as linhas filhas. */
const CASCADE: Record<string, [table: string, column: string][]> = {
  community_posts: [
    ["community_post_likes", "post_id"],
    ["community_post_comments", "post_id"],
  ],
  modules: [["module_lessons", "module_id"]],
};

/* ───────────────────────── armazenamento ───────────────────────── */

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function loadDb(): Db {
  try {
    return JSON.parse(storage()?.getItem(DB_KEY) ?? "{}") as Db;
  } catch {
    return {};
  }
}

function saveDb(db: Db) {
  try {
    storage()?.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    // Quase sempre é a cota estourada por imagem. A tela segue, só não persiste.
    console.warn("[demo] não deu pra salvar no localStorage:", e);
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const ok = (data: unknown, count: number | null = null): Result => ({
  data,
  error: null,
  count,
  status: 200,
  statusText: "OK",
});

const fail = (message: string, code: string): Result => ({
  data: null,
  error: { message, code, details: "", hint: "" },
  count: null,
  status: 400,
  statusText: "Bad Request",
});

/* ───────────────────────── consultas ───────────────────────── */

const isNull = (v: unknown) => v === null || v === undefined;

function same(a: unknown, b: unknown): boolean {
  if (isNull(a) || isNull(b)) return isNull(a) && isNull(b);
  // Id da URL chega como texto; número no banco continua batendo.
  return String(a) === String(b);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" || typeof b === "number" || typeof a === "boolean") {
    return Number(a) - Number(b);
  }
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function likeToRegex(pattern: string, flags: string): RegExp {
  const src = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${src}$`, flags);
}

/** Faz o papel dos gatilhos que mantêm os contadores da comunidade. */
function recountCommunity(db: Db) {
  const likes = db.community_post_likes ?? [];
  const comments = db.community_post_comments ?? [];
  for (const post of db.community_posts ?? []) {
    post.likes_count = likes.filter((l) => same(l.post_id, post.id)).length;
    post.comments_count = comments.filter((c) => same(c.post_id, post.id)).length;
  }
}

type Order = { column: string; ascending: boolean; nullsFirst: boolean };

class Query implements PromiseLike<Result> {
  private filters: ((row: Row) => boolean)[] = [];
  private orders: Order[] = [];
  private offset = 0;
  private max: number | null = null;
  private action: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private conflictKeys: string[] | null = null;
  private columns = "*";
  private returning = false;
  private wantsCount = false;
  private head = false;
  private cardinality: "many" | "single" | "maybe" = "many";

  private table: string;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*", opts: { count?: string; head?: boolean } = {}) {
    this.columns = columns;
    if (this.action !== "select") this.returning = true;
    this.wantsCount = !!opts.count;
    this.head = !!opts.head;
    return this;
  }

  insert(values: Row | Row[]) {
    this.action = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(values: Row | Row[], opts: { onConflict?: string } = {}) {
    this.action = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    this.conflictKeys = opts.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
    return this;
  }

  update(patch: Row) {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  private where(fn: (row: Row) => boolean) {
    this.filters.push(fn);
    return this;
  }

  eq(column: string, value: unknown) {
    return this.where((r) => same(r[column], value));
  }
  neq(column: string, value: unknown) {
    return this.where((r) => !same(r[column], value));
  }
  gt(column: string, value: unknown) {
    return this.where((r) => !isNull(r[column]) && compare(r[column], value) > 0);
  }
  gte(column: string, value: unknown) {
    return this.where((r) => !isNull(r[column]) && compare(r[column], value) >= 0);
  }
  lt(column: string, value: unknown) {
    return this.where((r) => !isNull(r[column]) && compare(r[column], value) < 0);
  }
  lte(column: string, value: unknown) {
    return this.where((r) => !isNull(r[column]) && compare(r[column], value) <= 0);
  }
  in(column: string, values: unknown[]) {
    return this.where((r) => values.some((v) => same(r[column], v)));
  }
  is(column: string, value: unknown) {
    return this.where((r) => (r[column] ?? null) === value);
  }
  like(column: string, pattern: string) {
    const re = likeToRegex(pattern, "");
    return this.where((r) => re.test(String(r[column] ?? "")));
  }
  ilike(column: string, pattern: string) {
    const re = likeToRegex(pattern, "i");
    return this.where((r) => re.test(String(r[column] ?? "")));
  }
  match(query: Row) {
    for (const [k, v] of Object.entries(query)) this.eq(k, v);
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is") return this.where((r) => (r[column] ?? null) !== value);
    if (operator === "eq") return this.neq(column, value);
    return this;
  }

  order(column: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const ascending = opts.ascending ?? true;
    // Igual ao Postgres: nulos no fim quando sobe, no começo quando desce.
    this.orders.push({ column, ascending, nullsFirst: opts.nullsFirst ?? !ascending });
    return this;
  }

  limit(count: number) {
    this.max = count;
    return this;
  }

  range(from: number, to: number) {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }

  single() {
    this.cardinality = "single";
    return this;
  }

  maybeSingle() {
    this.cardinality = "maybe";
    return this;
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every((fn) => fn(row));
  }

  private conflictKeysFor(): string[] {
    return this.conflictKeys ?? UNIQUE[this.table] ?? ["id"];
  }

  private newRow(values: Row): Row {
    return { id: uuid(), created_at: new Date().toISOString(), ...DEFAULTS[this.table], ...values };
  }

  private run(): Result {
    const db = loadDb();
    const rows = (db[this.table] ??= []);
    let affected: Row[];

    switch (this.action) {
      case "select":
        affected = rows.filter((r) => this.matches(r));
        break;

      case "insert":
        affected = [];
        for (const values of this.payload) {
          const row = this.newRow(values);
          const keys = UNIQUE[this.table];
          const dup = rows.some(
            (r) => same(r.id, row.id) || (keys && keys.every((k) => same(r[k], row[k]))),
          );
          // Nada foi salvo ainda, então falhar aqui não deixa inserção pela metade.
          if (dup) {
            return fail(`duplicate key value violates unique constraint "${this.table}_key"`, "23505");
          }
          rows.push(row);
          affected.push(row);
        }
        break;

      case "upsert":
        affected = [];
        for (const values of this.payload) {
          const keys = this.conflictKeysFor();
          const existing = keys.every((k) => !isNull(values[k]))
            ? rows.find((r) => keys.every((k) => same(r[k], values[k])))
            : undefined;
          if (existing) {
            Object.assign(existing, values);
            affected.push(existing);
          } else {
            const row = this.newRow(values);
            rows.push(row);
            affected.push(row);
          }
        }
        break;

      case "update":
        affected = rows.filter((r) => this.matches(r));
        for (const r of affected) Object.assign(r, this.patch);
        break;

      case "delete": {
        affected = rows.filter((r) => this.matches(r));
        db[this.table] = rows.filter((r) => !affected.includes(r));
        for (const [child, column] of CASCADE[this.table] ?? []) {
          if (!db[child]) continue;
          db[child] = db[child].filter((c) => !affected.some((p) => same(c[column], p.id)));
        }
        break;
      }
    }

    if (this.action !== "select") {
      recountCommunity(db);
      saveDb(db);
      if (!this.returning) return ok(null);
    }

    const total = affected.length;
    let data = this.action === "select" ? this.sorted(affected) : affected;
    if (this.action === "select" && (this.offset || this.max !== null)) {
      data = data.slice(this.offset, this.max === null ? undefined : this.offset + this.max);
    }
    data = data.map((r) => this.withRelations(db, r));

    const count = this.wantsCount ? total : null;
    if (this.head) return ok(null, count);

    if (this.cardinality === "many") return ok(data, count);
    if (data.length === 1) return ok(data[0], count);
    if (data.length === 0 && this.cardinality === "maybe") return ok(null, count);
    return fail("JSON object requested, multiple (or no) rows returned", "PGRST116");
  }

  private sorted(rows: Row[]): Row[] {
    if (!this.orders.length) return rows;
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const x = a[o.column];
        const y = b[o.column];
        if (isNull(x) || isNull(y)) {
          if (isNull(x) && isNull(y)) continue;
          return (isNull(x) ? -1 : 1) * (o.nullsFirst ? 1 : -1);
        }
        const c = compare(x, y);
        if (c !== 0) return o.ascending ? c : -c;
      }
      return 0;
    });
  }

  /** Resolve `tabela_filha(count)` do select, ex.: `module_lessons(count)`. */
  private withRelations(db: Db, row: Row): Row {
    const out: Row = { ...row };
    const foreignKey = `${this.table.replace(/s$/, "")}_id`;
    for (const [, rel] of this.columns.matchAll(/(\w+)\s*\(\s*count\s*\)/g)) {
      const n = (db[rel] ?? []).filter((c) => same(c[foreignKey], row.id)).length;
      out[rel] = [{ count: n }];
    }
    return out;
  }
}

const avisados = new Set<string>();

function from(table: string) {
  // Método que o demo não conhece vira no-op, em vez de quebrar a tela.
  return new Proxy(new Query(table), {
    get(target, prop, receiver) {
      if (typeof prop !== "string" || prop in target) return Reflect.get(target, prop, receiver);
      if (!avisados.has(prop)) {
        avisados.add(prop);
        console.warn(`[demo] .${prop}() não é imitado no modo demo; ignorando.`);
      }
      return () => receiver;
    },
  });
}

/* ───────────────────────── auth ───────────────────────── */

type DemoSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: {
    id: string;
    email: string;
    aud: string;
    role: string;
    app_metadata: Row;
    user_metadata: Row;
    created_at: string;
  };
};

type AuthListener = (event: string, session: DemoSession | null) => void;

function nameFromEmail(email: string): string {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function makeSession(profile: Row): DemoSession {
  const ano = 60 * 60 * 24 * 365;
  return {
    access_token: `demo-${String(profile.id)}`,
    refresh_token: "demo",
    token_type: "bearer",
    expires_in: ano,
    expires_at: Math.floor(Date.now() / 1000) + ano,
    user: {
      id: String(profile.id),
      email: String(profile.email),
      aud: "authenticated",
      role: "authenticated",
      app_metadata: { provider: "email" },
      user_metadata: { full_name: profile.full_name ?? null },
      created_at: String(profile.created_at),
    },
  };
}

function readSession(): DemoSession | null {
  try {
    return JSON.parse(storage()?.getItem(SESSION_KEY) ?? "null") as DemoSession | null;
  } catch {
    return null;
  }
}

function createAuth() {
  const listeners = new Set<AuthListener>();
  const emit = (event: string, session: DemoSession | null) => {
    for (const fn of listeners) fn(event, session);
  };

  return {
    async getSession() {
      return { data: { session: readSession() }, error: null };
    },

    async getUser() {
      return { data: { user: readSession()?.user ?? null }, error: null };
    },

    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      return {
        data: {
          subscription: { id: uuid(), callback, unsubscribe: () => listeners.delete(callback) },
        },
      };
    },

    /** Qualquer senha serve. Conta nova nasce admin. */
    async signInWithPassword({ email }: { email: string; password: string }) {
      const clean = email.trim().toLowerCase();
      const db = loadDb();
      const profiles = (db.profiles ??= []);
      let profile = profiles.find((p) => p.email === clean);
      if (!profile) {
        profile = {
          id: uuid(),
          email: clean,
          full_name: nameFromEmail(clean),
          avatar_url: null,
          role: "admin",
          active: true,
          created_at: new Date().toISOString(),
        };
        profiles.push(profile);
        saveDb(db);
      }

      const session = makeSession(profile);
      try {
        storage()?.setItem(SESSION_KEY, JSON.stringify(session));
      } catch {
        /* sem localStorage a sessão dura só até recarregar */
      }
      emit("SIGNED_IN", session);
      return { data: { user: session.user, session }, error: null };
    },

    async signOut() {
      try {
        storage()?.removeItem(SESSION_KEY);
      } catch {
        /* nada pra limpar */
      }
      emit("SIGNED_OUT", null);
      return { error: null };
    },
  };
}

/* ───────────────────────── storage, functions, realtime ───────────────────────── */

/** Imagem pequena vira data URL (sobrevive ao recarregar); grande fica só na memória. */
function fileToUrl(file: Blob): Promise<string> {
  if (file.size > 700_000 || typeof FileReader === "undefined") {
    return Promise.resolve(URL.createObjectURL(file));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function createStorage() {
  const files = new Map<string, string>();
  return {
    from(bucket: string) {
      return {
        async upload(path: string, file: Blob) {
          files.set(`${bucket}/${path}`, await fileToUrl(file));
          return { data: { id: uuid(), path, fullPath: `${bucket}/${path}` }, error: null };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: files.get(`${bucket}/${path}`) ?? "" } };
        },
        async remove(paths: string[]) {
          for (const p of paths) files.delete(`${bucket}/${p}`);
          return { data: [], error: null };
        },
      };
    },
  };
}

const functions = {
  async invoke(name: string, opts: { body?: Row } = {}) {
    if (name !== "admin-create-user") {
      return { data: null, error: { message: `A função "${name}" não existe no modo demo.` } };
    }

    const body = opts.body ?? {};
    const email = String(body.email ?? "").trim().toLowerCase();
    const db = loadDb();
    const profiles = (db.profiles ??= []);
    if (profiles.some((p) => p.email === email)) {
      return { data: { error: "Já existe uma conta com esse e-mail." }, error: null };
    }

    const id = uuid();
    profiles.push({
      id,
      email,
      full_name: body.full_name || null,
      avatar_url: null,
      role: body.role === "admin" ? "admin" : "member",
      active: true,
      created_at: new Date().toISOString(),
    });
    saveDb(db);
    return { data: { user: { id, email } }, error: null };
  },
};

function channel(topic: string) {
  const ch = {
    topic,
    on: () => ch,
    subscribe: () => ch,
    unsubscribe: async () => "ok" as const,
  };
  return ch;
}

export function createDemoClient(): ReturnType<typeof createClient> {
  const client = {
    from,
    rpc: async () => ok(null),
    auth: createAuth(),
    storage: createStorage(),
    functions,
    channel,
    removeChannel: async () => "ok" as const,
    removeAllChannels: async () => [],
  };
  return client as unknown as ReturnType<typeof createClient>;
}
