const DATABASE_URL_KEYS = ["DATABASE_URL", "POSTGRES_URL", "POSTGRESQL_URL"] as const;

const PG_PART_KEYS = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"] as const;

const clean = (value: string | undefined): string => {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
};

const buildFromPgParts = (env: NodeJS.ProcessEnv): string => {
  const host = clean(env.PGHOST);
  const user = clean(env.PGUSER);
  const database = clean(env.PGDATABASE);
  if (!host || !user || !database) {
    return "";
  }

  const port = clean(env.PGPORT) || "5432";
  const password = clean(env.PGPASSWORD);
  const sslmode = clean(env.PGSSLMODE);

  const url = new URL("postgresql://localhost");
  url.hostname = host;
  url.port = port;
  url.username = user;
  if (password) {
    url.password = password;
  }
  url.pathname = `/${database}`;
  if (sslmode) {
    url.searchParams.set("sslmode", sslmode);
  }

  return url.toString();
};

export const databaseEnvHint =
  "Set DATABASE_URL (preferred), POSTGRES_URL, POSTGRESQL_URL, or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.";

export const resolveDatabaseUrlFromEnv = (env: NodeJS.ProcessEnv = process.env): string => {
  for (const key of DATABASE_URL_KEYS) {
    const value = clean(env[key]);
    if (value) {
      return value;
    }
  }
  return buildFromPgParts(env);
};

export const hasAnyDatabaseEnv = (env: NodeJS.ProcessEnv = process.env): boolean => {
  if (resolveDatabaseUrlFromEnv(env)) {
    return true;
  }
  return PG_PART_KEYS.some((key) => Boolean(clean(env[key])));
};
