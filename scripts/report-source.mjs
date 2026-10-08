import { readFile } from "node:fs/promises";
import path from "node:path";

// New reports retain their old public path as historical lineage. The route,
// feed key and fingerprint normalization always remain the public HTML path.
export function reportSourcePaths(relativePath) {
  return relativePath === "vulnerabilities.html"
    ? ["reports/vulnerabilities.source.html", "public/vulnerabilities.html"]
    : [`public/${relativePath}`];
}

export async function authoredReportSource(root, relativePath, publicSource) {
  const [preferred] = reportSourcePaths(relativePath);
  if (preferred === `public/${relativePath}`) return publicSource;
  try { return await readFile(path.join(root, preferred), "utf8"); }
  catch (error) { if (error.code === "ENOENT") return publicSource; throw error; }
}

export function committedReportSource(git, relativePath, sha) {
  for (const sourcePath of reportSourcePaths(relativePath)) {
    try { return git(["show", `${sha}:${sourcePath}`]); }
    catch { /* Pre-migration commits only have the old public source. */ }
  }
  throw new Error(`No authored source for ${relativePath} at ${sha}.`);
}
