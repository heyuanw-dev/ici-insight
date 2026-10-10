import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

// Never print matched values. Check current source and the actual browser build,
// including configured credentials and recognizable Supabase privileged keys.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const configuredKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const source = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
for (const path of tracked) {
  if (
    /^\.env(?:\.|$)/.test(basename(path)) &&
    basename(path) !== ".env.example"
  )
    throw new Error(`Environment file must not be tracked: ${path}`);
}
const assets = ".next/static";
if (!existsSync(assets))
  throw new Error(
    "Build the production application before running test:security.",
  );
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
function hasPrivilegedKey(contents) {
  if (
    configuredKey &&
    configuredKey.length > 20 &&
    contents.includes(configuredKey)
  )
    return true;
  if (/sb_secret_[A-Za-z0-9_-]{25,}/.test(contents)) return true;
  for (const match of contents.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      if (
        JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")).role ===
        "service_role"
      )
        return true;
    } catch {
      /* Non-JWT source text is not a credential. */
    }
  }
  return false;
}
for (const path of new Set([...source, ...files(assets)])) {
  if (!existsSync(path)) continue;
  const contents = readFileSync(path, "utf8");
  if (hasPrivilegedKey(contents))
    throw new Error(`Privileged credential detected in ${path}`);
  if (path.startsWith(assets) && contents.includes("SUPABASE_SERVICE_ROLE_KEY"))
    throw new Error(
      `Server credential reference detected in browser asset ${path}`,
    );
}
console.log(
  "Current source and production browser assets contain no detected privileged Supabase keys; local environment files are untracked.",
);
