// --- Load env first ---
import dotenv from "dotenv";
dotenv.config();

// --- Deps ---
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { getJson } from "serpapi";
import * as cheerio from "cheerio";

import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

app.get("/privacy", (_req, res) => {
  const html = readFileSync(join(__dirname, "privacy.html"), "utf8");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});


// Optional: sanity log
console.log("Loaded SerpAPI key?", process.env.SERPAPI_API_KEY ? "YES" : "NO");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health check
app.get("/healthCheck", (_req, res) => res.json({ status: "ok" }));

// Main endpoint
app.post("/fetchCode", async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing query" });

    // 1) Search the web via SerpAPI
    const serp = await getJson({
      engine: "google",
      q: query,
      api_key: process.env.SERPAPI_API_KEY,
      num: 10,
      hl: "en",
      gl: "us"
    });

    // Candidate links: take first 3 organic results (plus answer box link if present)
    const candidateLinks = [
      serp?.answer_box?.link,
      serp?.organic_results?.[0]?.link,
      serp?.organic_results?.[1]?.link,
      serp?.organic_results?.[2]?.link
    ].filter(Boolean);

    // 2) Try each link until we extract code
    let codeSnippets = [];
    let fetchedUrl = null;

    for (const url of candidateLinks) {
      try {
        const html = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" }
        }).then(r => r.text());

        const found = extractCode(html);
        if (found.length) {
          codeSnippets = found;
          fetchedUrl = url;
          break;
        }
      } catch (e) {
        console.warn("Scrape failed for", url, e?.message || e);
      }
    }

    // 3) Response
    return res.json({
      query,
      topUrl: fetchedUrl || candidateLinks[0] || null,
      codeSnippets,
      serpMeta: {
        query: serp?.search_parameters?.q ?? null,
        totalResults: serp?.search_information?.total_results ?? null,
        topTitle: serp?.organic_results?.[0]?.title ?? null,
        topLink: serp?.organic_results?.[0]?.link ?? null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scraper failed" });
  }
});

// ---- Helpers ----
function extractCode(html) {
  const $ = cheerio.load(html);
  const blocks = new Set();

  // 1) Common code containers
  const selectors = [
    "pre code",
    "pre",
    "code",
    ".code",
    ".codesample",
    ".highlight",
    ".hljs",
    ".prettyprint",
    ".language-js",
    ".language-html",
    ".language-css",
    "[class*='code']",
    "[class*='snippet']",
    "[class*='example']",
    ".w3-code",
    ".w3-example"
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const text = $(el).text().trim();
      if (looksLikeCode(text)) blocks.add(text);
    });
  }

  // 2) Fenced code blocks in raw HTML (markdown-ish)
  const fenced = html.match(/```[\s\S]*?```/g) || [];
  for (const b of fenced) {
    const cleaned = b.replace(/^```[a-zA-Z0-9-]*\s*/, "").replace(/```$/, "").trim();
    if (looksLikeCode(cleaned)) blocks.add(cleaned);
  }

  // Dedup + cap
  return Array.from(blocks).slice(0, 20);
}

function looksLikeCode(t) {
  if (!t) return false;
  const lines = t.split(/\r?\n/);
  const codey = /[{;}<>\[\]()]|function\s|\b(const|let|var|class|return)\b|<\/?[a-z][^>]*>/i;
  const codeLines = lines.filter(l => codey.test(l)).length;
  return codeLines >= Math.max(2, Math.ceil(lines.length * 0.25)); // at least 2 lines or ~25%
}

// --- Start server ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on :${port}`));
