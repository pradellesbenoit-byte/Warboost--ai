import {createHash} from "node:crypto";
import {posix} from "node:path";

const LOCAL_JS_IMPORT_SOURCE =
  String.raw`\b(?:from\s*|import\s*(?:\(\s*)?)(["'])(\.{1,2}\/[^"'?#]+\.js)(\?[^"']*)?\1`;

export function collectLocalJsImports(source) {
  const references = [];
  for (const match of String(source || "").matchAll(new RegExp(LOCAL_JS_IMPORT_SOURCE, "g"))) {
    const quote = match[1];
    const modulePath = match[2];
    const query = match[3] || "";
    const prefixLength = match[0].length - quote.length * 2 - modulePath.length - query.length;
    const start = match.index + prefixLength + quote.length;
    references.push({
      start,
      end: start + modulePath.length + query.length,
      path: modulePath,
      query,
      specifier: `${modulePath}${query}`,
    });
  }
  return references;
}

export function rewriteLocalJsImports(source, resolveSpecifier) {
  let rewritten = String(source || "");
  const references = collectLocalJsImports(rewritten);
  for (const reference of references.reverse()) {
    const resolved = resolveSpecifier(reference);
    if (typeof resolved !== "string" || !resolved) {
      throw new Error(`Invalid local JS module rewrite for ${reference.specifier}`);
    }
    rewritten = `${rewritten.slice(0, reference.start)}${resolved}${rewritten.slice(reference.end)}`;
  }
  return rewritten;
}

export function versionedLocalJsPath(file, query = "") {
  if (!query) return file;
  if (!file.endsWith(".js")) throw new Error(`Cannot version non-JS asset: ${file}`);
  const digest = createHash("sha256").update(query).digest("hex").slice(0, 12);
  return `${file.slice(0, -3)}.v-${digest}.js`;
}

export function relativeOutputSpecifier(importerOutputPath, targetOutputPath) {
  const relative = posix.relative(posix.dirname(importerOutputPath), targetOutputPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

const SERVICE_WORKER_MODULE_URL_SOURCE =
  String.raw`(["'])\/(lib\/[^"'?#]+\.js)(\?[^"']*)?\1`;

export function collectServiceWorkerModuleUrls(source) {
  return [...String(source || "").matchAll(new RegExp(SERVICE_WORKER_MODULE_URL_SOURCE, "g"))]
    .map((match) => ({path: match[2], query: match[3] || ""}));
}

export function rewriteServiceWorkerModuleUrls(source) {
  return String(source || "").replace(
    new RegExp(SERVICE_WORKER_MODULE_URL_SOURCE, "g"),
    (_whole, quote, modulePath, query = "") =>
      `${quote}/${versionedLocalJsPath(modulePath, query)}${quote}`,
  );
}
