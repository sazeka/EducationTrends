// server/summarize.js  (Requires: "type": "module" in package.json)
import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

dayjs.extend(utc);
dayjs.extend(timezone);

// ---------------- CONFIG ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TZ = "America/New_York";
const PORT = 5174;

const MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b"; // try "mistral:7b"
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const FEEDS = [path.join(__dirname, "../public/data/education_all.json")];
const SUM_DIR = path.join(__dirname, "../public/summaries");

const PARALLEL = 3;
const MAX_ARTICLE_CHARS = 8000;
const HTTP_TIMEOUT_MS = 15000;
const GEN_TIMEOUT_MS = 30000;
// ----------------------------------------

// ---------------- APP -------------------
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  next();
});

// Root message (nice DX; avoids "Cannot GET /")
app.get("/", (_req, res) => {
  res
    .type("text/plain")
    .send("Summarizer is running.\nTry /api/health or /api/summarize/today");
});

// ---------------- HELPERS ---------------
const todayYMD = () => dayjs().tz(TZ).format("YYYY-MM-DD");
const toISO = (d) => dayjs(d).tz(TZ).toISOString();
const sameDay = (d, ymd) => dayjs(d).tz(TZ).format("YYYY-MM-DD") === ymd;

async function safeJsonRead(p) {
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function coerceToArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const k of ["items", "articles", "entries", "data", "feed"]) {
    if (Array.isArray(data[k])) return data[k];
  }
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

async function loadArticlesFor(ymd) {
  const items = [];
  for (const file of FEEDS) {
    if (!existsSync(file)) continue;
    const data = await safeJsonRead(file);
    const arr = coerceToArray(data);
    if (!Array.isArray(arr)) continue;

    for (const a of arr) {
      const dateField =
        a?.date || a?.published || a?.pubDate || a?.isoDate || a?.updated;
      if (!dateField || !sameDay(dateField, ymd)) continue;

      items.push({
        title: a?.title ?? "",
        url: a?.link || a?.url || "",
        source: a?.source || a?.site || a?.outlet || a?.feed || "unknown",
        date: toISO(dateField),
        fallback: a?.description || a?.summary || "",
      });
    }
  }
  return items;
}

async function fetchArticleText(url) {
  if (!url) return "";
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    clearTimeout(t);
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript").remove();
    const selectors = ["article", "main", "[role=main]", ".article", ".story", ".post", "#content", "body"];
    for (const sel of selectors) {
      const node = $(sel).first();
      if (node.length) {
        const text = node.text().replace(/\s+/g, " ").trim();
        if (text.split(" ").length > 120) return text;
      }
    }
    return $("body").text().replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

async function ensureOllama() {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { method: "GET", signal: controller.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

async function ollamaSummarize(text, meta) {
  const prompt = `
You are a concise education-news summarizer.
Return STRICT JSON with keys: title, source, url, date, summary, bullets, tags.
Rules:
- summary: <= 120 words
- bullets: 3–5 short lines
- tags: 3–6 lowercase slugs (e.g., "literacy", "policy", "higher-ed")
- Focus on findings, impact, equity, and stakeholders.

TITLE: ${meta.title}
SOURCE: ${meta.source}
URL: ${meta.url}
DATE: ${meta.date}

ARTICLE:
${(text || "").slice(0, MAX_ARTICLE_CHARS)}
  `.trim();

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.3 } }),
      signal: controller.signal,
    });
    clearTimeout(t);
    const data = await res.json();
    try {
      return JSON.parse(data.response);
    } catch {
      return {
        title: meta.title,
        source: meta.source,
        url: meta.url,
        date: meta.date,
        summary: (data.response || "").trim().slice(0, 800),
        bullets: [],
        tags: [],
      };
    }
  } catch {
    // Friendly fallback when Ollama is unreachable mid-request
    return {
      title: meta.title,
      source: meta.source,
      url: meta.url,
      date: meta.date,
      summary: "Ollama is not reachable right now. Placeholder summary.",
      bullets: [],
      tags: [],
    };
  }
}

async function buildOverview(dateYMD, items) {
  // No items -> soft placeholder
  if (!Array.isArray(items) || !items.length) {
    return {
      headline: `No articles found for ${dateYMD}`,
      summary: "",
      bullets: [],
      tags: [],
    };
  }

  // Compact context fed to the model
  const compact = items.map((it) => ({
    title: it.title || "",
    source: it.source || "",
    url: it.url || "",
    tags: Array.isArray(it.tags) ? it.tags.slice(0, 6) : [],
    summary: (it.summary || "").slice(0, 300),
  }));

  const prompt = `
You are an editor summarizing a single day of education news.
Write a GRAND DAILY SUMMARY in STRICT JSON with keys:
headline (<= 12 words), summary (150–220 words), bullets (5–7 short points), tags (5–10 lowercase slugs).
Emphasize: what's new, policy/regulatory shifts, equity/impact, notable data points, geography.
Avoid repetition; be specific and concrete.

INPUT:
${JSON.stringify(compact, null, 2)}
  `.trim();

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt, stream: false, options: { temperature: 0.2 } }),
      signal: controller.signal,
    });
    clearTimeout(t);
    const data = await r.json();
    try {
      const out = JSON.parse(data.response);
      return {
        headline: out?.headline || "Daily Education Brief",
        summary: typeof out?.summary === "string" ? out.summary : "",
        bullets: Array.isArray(out?.bullets) ? out.bullets : [],
        tags: Array.isArray(out?.tags) ? out.tags : [],
      };
    } catch {
      return {
        headline: "Daily Education Brief",
        summary: (data.response || "").slice(0, 1200),
        bullets: [],
        tags: [],
      };
    }
  } catch {
    // Fallback overview without Ollama
    const bullets = compact.slice(0, 7).map((a) => `${a.source}: ${a.title}`);
    return {
      headline: "Daily Education Brief",
      summary:
        `Highlights for ${dateYMD}: ` +
        compact
          .slice(0, 6)
          .map((a) => `${a.title} — ${a.source}`)
          .join(" | "),
      bullets,
      tags: ["daily-brief", "education", "policy", "k-12", "higher-ed"],
    };
  }
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    });
  await Promise.all(workers);
  return results;
}

// ---------------- ROUTES ----------------
app.get("/api/debug", async (_req, res) => {
  const feeds = [];
  for (const file of FEEDS) {
    const exists = existsSync(file);
    let type = "missing";
    let keys = [];
    if (exists) {
      const data = await safeJsonRead(file);
      type = Array.isArray(data) ? "array" : typeof data;
      keys = data && !Array.isArray(data) ? Object.keys(data) : [];
    }
    feeds.push({ file, exists, type, keys });
  }
  res.json({ TZ, today: todayYMD(), ollama_url: OLLAMA_URL, model: MODEL, feeds });
});

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: await ensureOllama(),
    tz: TZ,
    today: todayYMD(),
    model: MODEL,
    ollama_url: OLLAMA_URL,
  });
});

// GET /api/summarize/:date  (YYYY-MM-DD or "today")
// Optional query: ?rebuild=1  (ignore cache and rebuild)
app.get("/api/summarize/:date", async (req, res) => {
  const ymd = req.params.date === "today" ? todayYMD() : req.params.date;
  const rebuild = req.query.rebuild === "1";
  try {
    await mkdir(SUM_DIR, { recursive: true });
    const outPath = path.join(SUM_DIR, `${ymd}.json`);

    // Serve cache unless explicitly rebuilding
    if (!rebuild && existsSync(outPath)) {
      const cached = await safeJsonRead(outPath);
      if (cached && Array.isArray(cached.items)) {
        // If old cache lacks overview, compute it once and upgrade cache
        if (!cached.overview) {
          const upgradedOverview = await buildOverview(ymd, cached.items);
          const upgraded = { ...cached, overview: upgradedOverview };
          await writeFile(outPath, JSON.stringify(upgraded, null, 2), "utf8");
          return res.json(upgraded);
        }
        return res.json(cached);
      }
    }

    // If no cache, ensure Ollama is reachable before heavy work
    const canGen = await ensureOllama();
    if (!canGen) {
      // Still try to serve cache if present but malformed
      if (existsSync(outPath)) {
        const cached = await safeJsonRead(outPath);
        if (cached && Array.isArray(cached.items)) return res.json(cached);
      }
      return res
        .status(503)
        .json({ date: ymd, overview: null, items: [], error: `Cannot reach Ollama at ${OLLAMA_URL}. Start it with 'ollama serve' (or set OLLAMA_URL).` });
    }

    const articles = await loadArticlesFor(ymd);

    const items = await mapPool(articles, PARALLEL, async (a) => {
      const text = (await fetchArticleText(a.url)) || a.fallback || a.title;
      const sum = await ollamaSummarize(text, a);
      return {
        title: sum?.title ?? a.title,
        source: sum?.source ?? a.source,
        url: sum?.url ?? a.url,
        date: sum?.date ?? a.date,
        summary: typeof sum?.summary === "string" ? sum.summary : "",
        bullets: Array.isArray(sum?.bullets) ? sum.bullets : [],
        tags: Array.isArray(sum?.tags) ? sum.tags : [],
      };
    });

    const overview = await buildOverview(ymd, items);

    const payload = { date: ymd, overview, items: Array.isArray(items) ? items : [] };
    await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
    res.json(payload);
  } catch (e) {
    res.status(500).json({ date: ymd, overview: null, items: [], error: e.message || "summarization failed" });
  }
});

// --------------- START ------------------
app.listen(PORT, () => {
  console.log(`🚀 Summarizer running at http://localhost:${PORT}`);
  console.log(`   Debug:      http://localhost:${PORT}/api/debug`);
  console.log(`   Health:     http://localhost:${PORT}/api/health`);
  console.log(`   Summaries:  http://localhost:${PORT}/api/summarize/today`);
});
