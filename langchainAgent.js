import { ChatOpenAI } from "@langchain/openai";
import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio";
import { getJson } from "serpapi";

export async function callLangchainAgent(query) {
  // 1) Web search via SerpAPI (direct SDK, future-proof)
  const serpResults = await getJson({
    engine: "google",
    q: query,
    api_key: process.env.SERPAPI_API_KEY,
    num: 10,
    hl: "en",
    gl: "us"
  });

  const topUrl =
    serpResults?.organic_results?.[0]?.link ??
    serpResults?.answer_box?.link ??
    null;

  // 2) (Optional) LLM available for future summarization/ranking if you want
  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY
  });

  // 3) Try scraping the top URL and extract code blocks
  let codeSnippets = [];
  try {
    if (topUrl) {
      const loader = new CheerioWebBaseLoader(topUrl);
      const docs = await loader.load();

      codeSnippets = docs
        .map((doc) => {
          const html = doc.pageContent || "";
          // Grab <code> blocks
          const rawBlocks = html.match(/<code[\s\S]*?<\/code>/gi) || [];
          // Also try fenced code blocks if it’s a markdown-ish page
          const fenced = html.match(/```[\s\S]*?```/g) || [];
          const all = [...rawBlocks, ...fenced];

          // Clean each block to plain text
          return all.map(cleanCodeBlock);
        })
        .flat();
    }
  } catch (err) {
    console.warn("Scrape failed:", err?.message || err);
  }

  return {
    query,
    topUrl,
    codeSnippets,
    // Keeping a small subset of SERP for debugging; remove if too chatty
    serpMeta: {
      query: serpResults?.search_parameters?.q,
      totalResults: serpResults?.search_information?.total_results,
      topTitle: serpResults?.organic_results?.[0]?.title,
      topLink: serpResults?.organic_results?.[0]?.link
    }
  };
}

// --- helpers ---
function cleanCodeBlock(block) {
  if (!block) return "";
  // Strip fenced blocks
  if (block.startsWith("```")) {
    return block.replace(/^```[a-zA-Z0-9]*\s*/,'').replace(/```$/,'').trim();
  }
  // Strip <code> tags and decode common entities
  const noTags = block
    .replace(/<\/?code[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return noTags.trim();
}
