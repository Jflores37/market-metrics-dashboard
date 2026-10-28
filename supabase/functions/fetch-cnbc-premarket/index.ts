// fetch-cnbc-premarket
// CNBC "Stocks making the biggest moves premarket" -> cnbc_premarket_raw
// (company, ticker, news) rows.
//
// 2026-10-28 (edge-b-02 / ops-security-live-4 / sit-04): the old source
// (cnbc.com/pre-markets/ -> 301 /markets/pre-markets/) became a quotes page
// with no dated article links, so the scraper never inserted a row while
// reporting 'ok'. New source: the Market Insider RSS feed lists the daily
// premarket-movers article. Its body is "registeredOnly" (no <p>/<strong>
// markup), but the page embeds the plain text as JSON `articleBodyText`
// ("Company — news. Company — news ...") plus security tags
// {"symbol":"HOOD","tagName":"Robinhood Markets Inc"} used to map names to
// tickers. Status: non-trading day -> ok/skipped; no article for today ET or 0
// parsed rows on a trading day -> 'error' (never a silent ok).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { redact } from "../_shared/redact.ts";
import { requireCronSecret } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CNBC public RSS: 20409666 = Market Insider (carries the premarket movers
// franchise same-morning), 10000664 = Finance (fallback).
const RSS_URLS = [
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20409666",
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664",
];
// e.g. /2026/10/28/stocks-making-the-biggest-moves-premarket-ulbi-slhy-hood-enph.html
const ARTICLE_RE =
  /https?:\/\/www\.cnbc\.com\/(\d{4})\/(\d{2})\/(\d{2})\/([a-z0-9\-]*mov[a-z]*-[a-z0-9\-]*pre-?market[a-z0-9\-]*)\.html/gi;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// Fallback map for the most common premarket-movers names (used only when the
// article's own security tags don't resolve the company).
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
  "verizon": "VZ", "at&t": "T", "spacex": "SPCX",
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

// Loose key for matching body names against security tag names
// ("AT & T" ~ "AT&T Inc", "Danaher Corporation" ~ "Danaher Corp").
function nameKey(s: string): string {
  return decodeEntities(s).toLowerCase()
    .replace(/\s*&\s*/g, "&")
    .replace(/[^a-z0-9&]+/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|co|company|plc|ltd|sa|nv|ag)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function etToday(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

async function getText(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xml" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return await r.text();
}

// Plain article text: JSON articleBodyText first, hidden xyz-data span second.
function extractBodyText(html: string): string | null {
  const j = /"articleBodyText":("(?:[^"\\]|\\.)*")/.exec(html);
  if (j) {
    try {
      const t = JSON.parse(j[1]);
      if (typeof t === "string" && t.trim()) return decodeEntities(t).replace(/\s+/g, " ").trim();
    } catch (_) { /* fall through */ }
  }
  const span = /class="xyz-data">([\s\S]*?)<\/span>/.exec(html);
  if (span) {
    const t = stripHtml(span[1]);
    if (t) return t;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const denied = requireCronSecret(req); if (denied) return denied;
  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: jobRow, error: jobErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-cnbc-premarket", status: "running" })
    .select("id")
    .single();
  if (jobErr || !jobRow) {
    return new Response(
      JSON.stringify({ ok: false, error: "job_runs insert failed: " + redact(jobErr?.message ?? "unknown") }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const jobId: number = jobRow.id;

  const finishJob = async (
    status: "ok" | "partial" | "error",
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

  try {
    const today = etToday();

    // Non-trading day: nothing is published, not a failure.
    const { data: isTrading, error: tdErr } = await supabase.rpc("is_trading_day", { d: today });
    if (tdErr) throw new Error(`is_trading_day rpc failed: ${tdErr.message}`);
    if (isTrading !== true) {
      const summary = { rows_written: 0, skipped: "non-trading day", et_date: today };
      await finishJob("ok", summary);
      return new Response(JSON.stringify({ ok: true, ...summary }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 1: find today's premarket-movers article in the RSS feeds
    const found = new Map<string, { url: string; date: string }>();
    const feedErrors: string[] = [];
    for (const feed of RSS_URLS) {
      try {
        const xml = await getText(feed);
        let m: RegExpExecArray | null;
        ARTICLE_RE.lastIndex = 0;
        while ((m = ARTICLE_RE.exec(xml)) !== null) {
          const url = m[0];
          const date = `${m[1]}-${m[2]}-${m[3]}`;
          if (!found.has(url)) found.set(url, { url, date });
        }
      } catch (e) {
        feedErrors.push(redact(e));
      }
      if (Array.from(found.values()).some((a) => a.date === today)) break;
    }
    const todays = Array.from(found.values()).filter((a) => a.date === today);
    if (todays.length === 0) {
      throw new Error(
        `No premarket-movers article dated ${today} in CNBC RSS` +
          (feedErrors.length ? ` (feed errors: ${feedErrors.join("; ")})` : ` (${found.size} older found)`),
      );
    }
    const article = todays[0];

    // Step 2: fetch the article and pull body text + security tags
    const articleHtml = await getText(article.url);
    const body = extractBodyText(articleHtml);
    if (!body) throw new Error(`Article body text not found (page layout changed?): ${article.url}`);

    const tags: Array<{ symbol: string; key: string }> = [];
    const tagRe = /"symbol":"([A-Z][A-Z0-9.\-]{0,6})","tagName":"([^"]+)"/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(articleHtml)) !== null) {
      tags.push({ symbol: tm[1], key: nameKey(tm[2]) });
    }
    const resolveTicker = (company: string): string | null => {
      const k = nameKey(company);
      if (k.length < 2) return null;
      for (const t of tags) {
        if (t.key === k || t.key.startsWith(k + " ") || k.startsWith(t.key + " ")) return t.symbol;
      }
      return COMPANY_MAP[normalizeCompany(company)] ?? null;
    };

    // Step 3: "Company — news" segments. Every head bounds the previous news;
    // only heads whose name(s) resolve to a ticker produce rows ("Dell
    // Technologies, Hewlett Packard Enterprise — ..." yields both).
    const headRe = /(?:^|[.:!?)"”]\s+)([A-Z0-9][^.:!?—–]{0,58}?)\s+[—–]\s+/g;
    const heads: Array<{ parts: Array<{ company: string; ticker: string }>; start: number; end: number }> = [];
    let hm: RegExpExecArray | null;
    while ((hm = headRe.exec(body)) !== null) {
      const name = hm[1].trim();
      const whole = name.includes(",") ? null : resolveTicker(name);
      const parts = /^(also read|read more|more from|cnbc pro|don't miss|watch)/i.test(name)
        ? []
        : whole
        ? [{ company: name, ticker: whole }]
        : name.split(/\s*,\s*|\s+and\s+/)
          .map((c) => ({ company: c.trim(), ticker: resolveTicker(c.trim()) }))
          .filter((p): p is { company: string; ticker: string } => p.ticker != null);
      heads.push({ parts, start: hm.index + hm[0].indexOf(hm[1]), end: hm.index + hm[0].length });
    }

    const rows: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    const fetchedAt = new Date().toISOString();
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i];
      if (h.parts.length === 0) continue;
      let news = body.slice(h.end, i + 1 < heads.length ? heads[i + 1].start : body.length).trim();
      news = news.replace(/\s*[—–]\s*CNBC['’]s[\s\S]*$/, "").trim();
      if (!news) continue;
      if (news.length > 1000) news = news.slice(0, 1000);
      for (const p of h.parts) {
        if (seen.has(p.ticker)) continue;
        seen.add(p.ticker);
        rows.push({
          article_url: article.url,
          article_date: article.date,
          ticker: p.ticker,
          company: p.company,
          news,
          fetched_at: fetchedAt,
        });
      }
    }

    if (rows.length === 0) {
      throw new Error(
        `Parsed 0 movers from ${article.url} (heads=${heads.length}, tags=${tags.length}, body_chars=${body.length})`,
      );
    }

    // Step 4: replace this article's rows (clean re-run semantics), only after
    // a successful parse so a bad run never empties good data.
    const { error: delErr } = await supabase.from("cnbc_premarket_raw").delete().eq("article_url", article.url);
    if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
    const { error: insErr } = await supabase.from("cnbc_premarket_raw").insert(rows);
    if (insErr) throw new Error(`Insert failed: ${insErr.message}`);

    const summary = {
      rows_written: rows.length,
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
    const errMsg = redact(err);
    await finishJob("error", { rows_written: 0 }, errMsg);
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
