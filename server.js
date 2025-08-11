import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { getJson } from "serpapi";
import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";

const app = express();
app.use(express.json());

// Normalize accidental double slashes like //fetchCode
app.use((req, _res, next) => {
  if (req.url.includes("//")) req.url = req.url.replace(/\/{2,}/g, "/");
  next();
});

// 2-minute cold-start gate, but DO NOT block health/privacy
const bootAt = Date.now();
const warmupMs = 120000; // 2 minutes
app.use((req, res, next) => {
  if (req.path === "/healthCheck" || req.path === "/privacy") return next();
  const left = warmupMs - (Date.now() - bootAt);
  if (left > 0) {
    const retry = Math.ceil(left / 1000);
    res.setHeader("Retry-After", String(retry));
    return res.status(503).json({ error: "warming_up", retryAfterSeconds: retry });
  }
  next();
});

// Health check (always available)
app.get("/healthCheck", (_req, res) => res.json({ status: "ok" }));

// Serve privacy page from repo root
app.get("/privacy", async (_req, res) => {
  try {
    const html = await readFile(new URL("./privacy.html", import.meta.url), "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch {
    res.status(500).send("Privacy page not found");
  }
});

// Main action endpoint
app.post("/fetchCode", async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ error: "Missing query" });

    // 1) Search
    const serp = await getJson({
      engine: "google",
      q: query,
      api_key: process.env.SERPAPI_API_KEY,
      num: 10,
      hl: "en",
      gl: "us"
    });

    // 2) Try first few results for code
    const candidates = [
      serp?.answer_box?.link,
      ...(serp?.organic_results ?? []).map(r => r?.link)
    ].filter(Boolean).slice(0, 3);

    let topUrl = null;
    let codeSnippets = [];

    for (const url of candidates) {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      const html = await r.text();

      const $ = cheerio.load(html);
      const blocks = new Set();
      $("pre code, pre, code, .w3-code, .highlight, .hljs").each((_, el) => {
        const t = $(el).text().trim();
        if (t) blocks.add(t);
      });
      const fenced = html.match(/```[\s\S]*?```/g) || [];
      for (const b of fenced) {
        const cleaned = b.replace(/^```[a-zA-Z0-9-]*\s*/, "").replace(/```$/, "").trim();
        if (cleaned) blocks.add(cleaned);
      }

      if (blocks.size) {
        topUrl = url;
        codeSnippets = Array.from(blocks).slice(0, 12);
        break;
      }
    }

    return res.json({ query, topUrl, codeSnippets });
  } catch {
    return res.status(500).json({ error: "scraper_failed" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on :${port}`));
