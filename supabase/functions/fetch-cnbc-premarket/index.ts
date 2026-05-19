// fetch-cnbc-premarket
// Defensive CNBC scrape: pre-markets section -> latest premarket movers article
// -> parsed (company, ticker, news) rows. Designed to fail gracefully when
// CNBC's HTML changes: returns status='ok' with rows_inserted=0 and a 'note'
// in summary explaining what wasn't found.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SECTION_URLS = [
  "https://www.cnbc.com/pre-markets/",
  "https://www.cnbc.com/markets/pre-markets/",
];

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Fallback map for the most common premarket-movers names (used only when no
// ticker is found in the article HTML itself).
const COMPANY_MAP: Record<string, string> = {
  "apple": "AAPL", "tesla": "TSLA", "nvidia": "NVDA", "microsoft": "MSFT",
  "alphabet": "GOOGL", "google": "GOOGL", "meta": "META", "meta platforms": "META",
  "amazon": "AMZN", "netflix": "NFLX", "amd": "AMD", "advanced micro devices": "AMD",
  "intel": "INTC", "broadcom": "AVGO", "qualcomm": "QCOM", "oracle": "ORCL",
  "salesforce": "CRM", "ibm": "IBM", "cisco": "CSCO", "adobe": "ADBE",
  "paypal": "PYPL", "uber": "UBER", "lyft": "LYFT", "airbnb": "ABNB",
  "doordash": "DASH", "snap": "SNAP", "pinterest": "PINS", "roblox": "RBLX",
  "shopify": "SHOP", "block": "SQ", "robinhood": "HOOD", "coinbase": "COIN",
  "palantir": "PLTR", "snowflake": "SNOW", "datadog": "DDOG", "mongodb": "MDB",
  "crowdstrike": "CRWD", "zscaler": "ZS", "okta": "OKTA", "cloudflare": "NET",
  "jpmorgan": "JPM", "jpmorgan chase": "JPM", "bank of america": "BAC",
  "wells fargo": "WFC", "citigroup": "C", "goldman sachs": "GS",
  "morgan stanley": "MS", "blackrock": "BLK", "berkshire hathaway": "BRK.B",
  "visa": "V", "mastercard": "MA",
  "walmart": "WMT", "target": "TGT", "costco": "COST", "home depot": "HD",
  "lowes": "LOW", "lowe's": "LOW", "starbucks": "SBUX",
  "mcdonald's": "MCD", "mcdonalds": "MCD", "nike": "NKE", "lululemon": "LULU",
  "boeing": "BA", "caterpillar": "CAT", "general electric": "GE",
  "ford": "F", "general motors": "GM", "rivian": "RIVN", "lucid": "LCID",
  "exxon mobil": "XOM", "chevron": "CVX", "occidental petroleum": "OXY",
  "johnson & johnson": "JNJ", "johnson and johnson": "JNJ",
  "pfizer": "PFE", "moderna": "MRNA", "eli lilly": "LLY",
  "merck": "MRK", "abbvie": "ABBV", "unitedhealth": "UNH",
  "disney": "DIS", "warner bros. discovery": "WBD", "comcast": "CMCSA",
  "verizon": "VZ", "at&t": "T",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeCompany(s: string): string {
  return decodeEntities(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: jobRow, error: jobErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-cnbc-premarket", status: "running" })
    .select("id")
    .single();
  if (jobErr || !jobRow) {
    return new Response(
      JSON.stringify({ ok: false, error: "job_runs insert failed: " + (jobErr?.message ?? "unknown") }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const jobId: number = jobRow.id;

  const finishJob = async (
    status: "ok" | "error",
    summary: Record<string, unknown> | null,
    error?: string,
  ) => {
    await supabase
      .from("job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        elapsed_ms: Date.now() - startedAt,
        summary,
        error: error ?? null,
      })
      .eq("id", jobId);
  };

  const note = (n: string) =>
    finishJob("ok", { rows_inserted: 0, note: n }).then(() =>
      new Response(JSON.stringify({ ok: true, rows_inserted: 0, note: n }), {
        headers: { "Content-Type": "application/json" },
      }),
    );

  try {
    // Step 1: try each section URL until one returns 200
    let sectionHtml = "";
    let sectionUrlUsed = "";
    for (const url of SECTION_URLS) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
        });
        if (r.ok) {
          sectionHtml = await r.text();
          sectionUrlUsed = url;
          break;
        }
      } catch (_) {
        // try next
      }
    }
    if (!sectionHtml) return await note("All section URLs failed or returned non-200");

    // Step 2: regex for article URLs matching premarket movers pattern
    const articleRegex =
      /https?:\/\/www\.cnbc\.com\/(\d{4})\/(\d{2})\/(\d{2})\/([a-z0-9\-]*(?:premarket|pre-market)[a-z0-9\-]*)\.html/gi;
    const found = new Map<string, { url: string; date: string }>();
    let m: RegExpExecArray | null;
    while ((m = articleRegex.exec(sectionHtml)) !== null) {
      const url = m[0];
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      if (!found.has(url)) found.set(url, { url, date });
    }
    if (found.size === 0) {
      return await note(`No premarket article URLs found on ${sectionUrlUsed}`);
    }

    // Sort by date desc, pick most recent
    const articles = Array.from(found.values()).sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
    const article = articles[0];

    // Step 3: fetch the article
    const articleResp = await fetch(article.url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    });
    if (!articleResp.ok) {
      return await note(`Article HTTP ${articleResp.status}: ${article.url}`);
    }
    const articleHtml = await articleResp.text();

    // Step 4: parse paragraphs with structure <p>...<strong|b>Company</strong|b>...em-dash...rest</p>
    // Multiple dash chars CNBC uses: — (em), – (en), - (hyphen with surrounding spaces)
    const paraRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    const rows: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    let p: RegExpExecArray | null;
    while ((p = paraRegex.exec(articleHtml)) !== null) {
      const innerHtml = p[1];
      // Find first bold/strong text
      const boldMatch = /<(?:strong|b)[^>]*>\s*([^<]+?)\s*<\/(?:strong|b)>/.exec(innerHtml);
      if (!boldMatch) continue;

      const company = normalizeCompany(boldMatch[1]);
      if (!company || company.length < 2 || company.length > 60) continue;
      // Filter obvious non-company bold phrases
      if (/^(also read|read more|more from|cnbc pro|don't miss|watch:)/i.test(company)) continue;
      if (seen.has(company)) continue;

      // Must contain a dash separator somewhere after the bold close tag
      const afterBold = innerHtml.slice(boldMatch.index + boldMatch[0].length);
      const dashMatch = /^\s*[—–\-]+\s*([\s\S]+)$/.exec(afterBold);
      if (!dashMatch) continue;

      seen.add(company);

      // Try to extract ticker
      let ticker: string | null = null;
      const fullPara = p[0];
      const quoteHref = /\/quotes\/([A-Z][A-Z0-9.\-]{0,5})(?:[\/"?#])/i.exec(fullPara);
      if (quoteHref) ticker = quoteHref[1].toUpperCase();
      if (!ticker) {
        const inParens = /\((?:NASDAQ|NYSE|AMEX|CBOE):\s*([A-Z][A-Z0-9.\-]{0,5})\s*\)/i.exec(fullPara);
        if (inParens) ticker = inParens[1].toUpperCase();
      }
      if (!ticker) {
        const mapped = COMPANY_MAP[company];
        if (mapped) ticker = mapped;
      }
      if (!ticker) continue;

      let news = stripHtml(dashMatch[1]);
      if (!news) continue;
      if (news.length > 1000) news = news.slice(0, 1000);

      rows.push({
        article_url: article.url,
        article_date: article.date,
        ticker,
        company: decodeEntities(boldMatch[1]).trim(),
        news,
        fetched_at: new Date().toISOString(),
      });
    }

    // Step 5: replace this article's rows (clean re-run semantics)
    await supabase.from("cnbc_premarket_raw").delete().eq("article_url", article.url);

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("cnbc_premarket_raw").insert(rows);
      if (insErr) throw new Error(`Insert failed: ${insErr.message}`);
    }

    const summary = {
      section_url: sectionUrlUsed,
      article_url: article.url,
      article_date: article.date,
      rows_inserted: rows.length,
      sample: rows.slice(0, 5).map((r) => ({ ticker: r.ticker, company: r.company })),
    };
    await finishJob("ok", summary);

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await finishJob("error", null, errMsg);
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
