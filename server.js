const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3847;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const STOCKS = [
  { symbol: "SPY", name: "标普500 ETF", yahoo: "SPY" },
  { symbol: "QQQ", name: "纳斯达克100 ETF", yahoo: "QQQ" },
  { symbol: "BNC", name: "CEA Industries", yahoo: "BNC" },
];

const CRYPTO = [
  {
    symbol: "BTC",
    name: "比特币",
    coingecko: "bitcoin",
    yahoo: "BTC-USD",
  },
  {
    symbol: "ETH",
    name: "以太坊",
    coingecko: "ethereum",
    yahoo: "ETH-USD",
  },
  {
    symbol: "BNB",
    name: "币安币",
    coingecko: "binancecoin",
    yahoo: "BNB-USD",
  },
  {
    symbol: "PONS",
    name: "Pons",
    coingecko: "pons",
    yahoo: "PONS-USD",
  },
  {
    symbol: "UNI",
    name: "Uniswap",
    coingecko: "uniswap",
    yahoo: "UNI7083-USD",
  },
];

const NEWS_FEEDS = {
  crypto: [
    {
      url: "https://news.google.com/rss/search?q=%E5%8A%A0%E5%AF%86%E8%B4%A7%E5%B8%81+OR+%E6%AF%94%E7%89%B9%E5%B8%81+OR+%E4%BB%A5%E5%A4%AA%E5%9D%8A+OR+bitcoin&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
      source: "Google 新闻",
      lang: "zh",
    },
    {
      url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
      source: "CoinDesk",
    },
    { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
    { url: "https://decrypt.co/feed", source: "Decrypt" },
    {
      url: "https://news.google.com/rss/search?q=cryptocurrency+OR+bitcoin+OR+ethereum&hl=en-US&gl=US&ceid=US:en",
      source: "Google News",
    },
  ],
  politics: [
    {
      url: "https://news.google.com/rss/search?q=%E7%BE%8E%E5%9B%BD%E6%94%BF%E6%B2%BB+OR+%E7%89%B9%E6%9C%97%E6%99%AE&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
      source: "Google 新闻",
      lang: "zh",
    },
    {
      url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml",
      source: "NYTimes",
    },
    {
      url: "https://www.politico.com/rss/politicopicks.xml",
      source: "Politico",
    },
    {
      url: "https://news.google.com/rss/search?q=US+politics&hl=en-US&gl=US&ceid=US:en",
      source: "Google News",
    },
  ],
  economy: [
    {
      url: "https://news.google.com/rss/search?q=%E7%BE%8E%E5%9B%BD%E7%BB%8F%E6%B5%8E+OR+%E7%BE%8E%E8%81%94%E5%82%A8+OR+%E9%80%9A%E8%83%80&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
      source: "Google 新闻",
      lang: "zh",
    },
    {
      url: "https://www.cnbc.com/id/20910258/device/rss/rss.html",
      source: "CNBC Economy",
    },
    {
      url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",
      source: "CNBC Finance",
    },
    {
      url: "https://news.google.com/rss/search?q=US+economy+OR+Federal+Reserve+OR+inflation&hl=en-US&gl=US&ceid=US:en",
      source: "Google News",
    },
  ],
};

const CATEGORY_META = {
  crypto: { id: "crypto", label: "数字货币", emphasis: true },
  politics: { id: "politics", label: "美国政治", emphasis: false },
  economy: { id: "economy", label: "美国经济", emphasis: false },
};

const newsCache = { at: 0, data: null, ttlMs: 2 * 60 * 1000 };

async function fetchJson(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, text };
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

const CANDLE_MAX = 40;

function extractCandles(result) {
  const ts = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    if (
      typeof o !== "number" ||
      typeof h !== "number" ||
      typeof l !== "number" ||
      typeof c !== "number" ||
      Number.isNaN(o) ||
      Number.isNaN(h) ||
      Number.isNaN(l) ||
      Number.isNaN(c)
    ) {
      continue;
    }
    candles.push({
      t: ts[i],
      o,
      h,
      l,
      c,
    });
  }
  return candles.slice(-CANDLE_MAX);
}

async function fetchYahooDaily(yahooSymbol) {
  // Daily OHLC — ~1–2 months for ~20–40 bars on cards
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?interval=1d&range=2mo`;
  const { ok, status, data } = await fetchJson(url);
  if (!ok || !data?.chart?.result?.[0]) {
    const msg =
      data?.chart?.error?.description ||
      data?.finance?.error?.description ||
      `Yahoo HTTP ${status}`;
    throw new Error(msg);
  }
  const result = data.chart.result[0];
  const meta = result.meta || {};
  const candles = extractCandles(result);
  const closes = candles.map((x) => x.c);
  const price = meta.regularMarketPrice;
  if (typeof price !== "number") {
    throw new Error("Yahoo: missing regularMarketPrice");
  }
  // US stocks: change vs previous/regular session close.
  // Do NOT use meta.chartPreviousClose — with range=2mo it is ~2 months ago, not yesterday.
  const prev =
    typeof meta.regularMarketPreviousClose === "number"
      ? meta.regularMarketPreviousClose
      : typeof meta.previousClose === "number"
        ? meta.previousClose
        : closes.length >= 2
          ? closes[closes.length - 2]
          : null;
  let change = null;
  let changePercent = null;
  if (prev != null) {
    change = price - prev;
    changePercent = prev !== 0 ? (change / prev) * 100 : 0;
  } else if (typeof meta.regularMarketChange === "number") {
    change = meta.regularMarketChange;
    changePercent =
      typeof meta.regularMarketChangePercent === "number"
        ? meta.regularMarketChangePercent
        : 0;
  } else {
    change = 0;
    changePercent =
      typeof meta.regularMarketChangePercent === "number"
        ? meta.regularMarketChangePercent
        : 0;
  }
  return {
    price,
    change: change ?? 0,
    changePercent: changePercent ?? 0,
    changeBasis: "prev_close",
    previousClose: prev,
    candles,
    candleInterval: "1d",
    candleRange: "2mo",
    updatedAt: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    source: "yahoo",
  };
}

/** True rolling ~24h change from hourly bars (not daily previousClose). */
async function fetchYahooRolling24h(yahooSymbol, currentPrice) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?interval=1h&range=5d`;
  const { ok, status, data } = await fetchJson(url);
  if (!ok || !data?.chart?.result?.[0]) {
    const msg =
      data?.chart?.error?.description ||
      data?.finance?.error?.description ||
      `Yahoo 24h HTTP ${status}`;
    throw new Error(msg);
  }
  const result = data.chart.result[0];
  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const price =
    typeof currentPrice === "number"
      ? currentPrice
      : typeof meta.regularMarketPrice === "number"
        ? meta.regularMarketPrice
        : null;
  if (typeof price !== "number") {
    throw new Error("Yahoo 24h: missing price");
  }
  const points = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && !Number.isNaN(c)) {
      points.push({ t: ts[i], c });
    }
  }
  if (!points.length) throw new Error("Yahoo 24h: no hourly closes");
  const latestT = points[points.length - 1].t;
  const target = latestT - 24 * 3600;
  let best = points[0];
  for (const p of points) {
    if (Math.abs(p.t - target) < Math.abs(best.t - target)) best = p;
  }
  // Require the reference bar to be reasonably near 24h ago (±6h)
  if (Math.abs(best.t - target) > 6 * 3600) {
    throw new Error("Yahoo 24h: no bar near 24h ago");
  }
  const change = price - best.c;
  const changePercent = best.c !== 0 ? (change / best.c) * 100 : 0;
  return {
    change,
    changePercent,
    changeBasis: "24h",
    price24hAgo: best.c,
    price24hAgoAt: new Date(best.t * 1000).toISOString(),
  };
}

async function fetchCoinGecko() {
  const ids = CRYPTO.map((c) => c.coingecko).filter(Boolean).join(",");
  // Prefer markets for absolute price_change_24h + price_change_percentage_24h
  const marketsUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
  const m = await fetchJson(marketsUrl);
  if (m.ok && Array.isArray(m.data) && m.data.length) {
    const byId = {};
    for (const row of m.data) {
      byId[row.id] = {
        usd: row.current_price,
        usd_24h_change: row.price_change_percentage_24h,
        price_change_24h: row.price_change_24h,
      };
    }
    return byId;
  }
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  const { ok, status, data } = await fetchJson(url);
  if (!ok || !data || data.status?.error_code) {
    const msg =
      (m.data && m.data.status && m.data.status.error_message) ||
      data?.status?.error_message ||
      `CoinGecko HTTP ${status || m.status}`;
    throw new Error(msg);
  }
  return data;
}

function cardBase(meta) {
  return {
    symbol: meta.symbol,
    name: meta.name,
    price: null,
    change: null,
    changePercent: null,
    changeBasis: null,
    candles: [],
    candleInterval: "1d",
    candleRange: "2mo",
    updatedAt: null,
    currency: "USD",
    source: null,
    error: null,
  };
}

function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, 16))
    )
    .trim();
}

function stripHtml(s) {
  return decodeXml(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagContent(block, tag) {
  const re = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );
  const m = block.match(re);
  return m ? decodeXml(m[1]) : "";
}

function parseRssItems(xml, defaultSource) {
  const items = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < 40) {
    const block = m[1];
    let title = tagContent(block, "title");
    let link = tagContent(block, "link");
    if (!link) {
      const guid = tagContent(block, "guid");
      if (/^https?:\/\//i.test(guid)) link = guid;
    }
    const pubDate =
      tagContent(block, "pubDate") ||
      tagContent(block, "published") ||
      tagContent(block, "updated");
    let description =
      tagContent(block, "description") ||
      tagContent(block, "summary") ||
      tagContent(block, "content:encoded") ||
      "";
    description = stripHtml(description).slice(0, 220);

    let source = defaultSource;
    const sourceTag = tagContent(block, "source");
    if (sourceTag) source = stripHtml(sourceTag);

    // Google News titles often end with " - Outlet" (EN or ZH)
    if (
      (defaultSource === "Google News" || defaultSource === "Google 新闻") &&
      title.includes(" - ")
    ) {
      const parts = title.split(" - ");
      if (parts.length >= 2) {
        source = parts.pop().trim() || source;
        title = parts.join(" - ").trim();
      }
    }

    if (!title) continue;
    let publishedAt = null;
    if (pubDate) {
      const d = new Date(pubDate);
      if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    const handle = `@${String(source)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "news"}`;

    items.push({
      title,
      text: description || title,
      url: link || null,
      source,
      sourceLabel: `来源：${source} · 新闻聚合`,
      author: source,
      handle,
      publishedAt,
    });
  }
  return items;
}

async function fetchFeedItems(feed) {
  try {
    const { ok, status, text } = await fetchText(feed.url);
    if (!ok || !text) throw new Error(`HTTP ${status}`);
    return parseRssItems(text, feed.source);
  } catch (err) {
    return { error: `${feed.source}: ${err.message || err}` };
  }
}

function dedupeSort(items, limit) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = (it.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  out.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  return out.slice(0, limit);
}


const translateCache = new Map(); // key -> { textZh, at }
const TRANSLATE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function looksChinese(s) {
  return /[\u4e00-\u9fff]/.test(String(s || ""));
}

function cacheKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

async function translateViaDictChrome(text) {
  const url =
    "https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=zh-CN&q=" +
    encodeURIComponent(text);
  const { ok, status, data } = await fetchJson(url);
  if (!ok) throw new Error(`dict-chrome HTTP ${status}`);
  // Response is typically ["中文…"] or [["中文…","en"]]
  let out = null;
  if (Array.isArray(data)) {
    if (typeof data[0] === "string") out = data[0];
    else if (Array.isArray(data[0]) && typeof data[0][0] === "string") out = data[0][0];
  }
  if (!out) throw new Error("dict-chrome empty");
  return String(out).trim();
}

async function translateViaGtx(text) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
    encodeURIComponent(text);
  const { ok, status, data } = await fetchJson(url);
  if (!ok || !Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error(`gtx HTTP ${status}`);
  }
  return data[0]
    .map((seg) => (seg && seg[0] ? seg[0] : ""))
    .join("")
    .trim();
}

async function translateViaMyMemory(text) {
  const url =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text.slice(0, 450)) +
    "&langpair=en|zh-CN";
  const { ok, status, data } = await fetchJson(url);
  const out = data?.responseData?.translatedText;
  if (!ok || !out) throw new Error(`MyMemory HTTP ${status}`);
  if (/MYMEMORY WARNING/i.test(out)) throw new Error("MyMemory quota");
  return String(out).trim();
}

const translateBackends = [
  ["dict-chrome", translateViaDictChrome],
  ["gtx", translateViaGtx],
  ["mymemory", translateViaMyMemory],
];

async function translateToZh(text) {
  const raw = String(text || "").trim();
  if (!raw) return { textZh: raw, translated: false, engine: null };
  if (looksChinese(raw)) {
    return { textZh: raw, translated: false, engine: "already-zh" };
  }
  const key = cacheKey(raw);
  const hit = translateCache.get(key);
  // Only reuse successful translations
  if (hit && hit.translated && Date.now() - hit.at < TRANSLATE_TTL_MS) {
    return { textZh: hit.textZh, translated: true, engine: hit.engine, cached: true };
  }

  let textZh = null;
  let engine = null;
  for (const [name, fn] of translateBackends) {
    try {
      textZh = await fn(raw);
      if (textZh && textZh !== raw && looksChinese(textZh)) {
        engine = name;
        break;
      }
      textZh = null;
    } catch {
      /* try next */
    }
  }

  if (!textZh) {
    // Do NOT cache failures — retry next refresh
    return { textZh: raw, translated: false, engine: null };
  }
  const result = { textZh, translated: true, engine };
  translateCache.set(key, { ...result, at: Date.now() });
  return result;
}

function cleanNewsText(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    // Strip trailing publisher / site suffixes (EN or ZH)
    .replace(/\s*[|｜]\s*.{0,40}$/u, "")
    .replace(/\s*[-—–]\s*[A-Za-z][\w.\s]{0,40}$/u, "")
    .replace(/\s*[-—–]\s*.{0,20}(财经|新闻|日报|时报|通讯社|网|报|社|频道|com|COM|CNBC|Reuters|Bloomberg|Yahoo|Forbes).*$/u, "")
    .replace(/\s+(新浪财经|财联社|界面新闻|华尔街见闻|第一财经|证券时报|Yahoo Finance|雅虎财经)[^。]*$/u, "")
    .replace(/_金融信息服务商$/u, "")
    .replace(/\s+Jiemian\.com$/u, "")
    .trim();
}

function ensureZhPeriod(s) {
  if (!s) return s;
  if (/[\u4e00-\u9fff]/.test(s) && !/[。！？!?…]$/.test(s)) return s + "。";
  return s;
}

/** Build a Chinese key-points summary (~2–4 sentences / 80–160 chars). */
function toKeyPointsZh(titleZh, textZh, maxChars = 160) {
  const title = cleanNewsText(titleZh);
  const body = cleanNewsText(textZh);
  const chunks = [];

  if (title) chunks.push(ensureZhPeriod(title));

  if (body) {
    const titleCore = title.replace(/[。！？!?…]+$/u, "").slice(0, 16);
    const bodyLooksDup =
      titleCore && body.replace(/\s+/g, "").includes(titleCore.replace(/\s+/g, ""));
    // If body already restates the title, prefer body as the richer source
    if (bodyLooksDup && Array.from(title).length >= 12) {
      chunks.length = 0;
    }
    const sents = body.match(/[^。！？!?]+[。！？!?]?/g) || [body];
    for (const raw of sents) {
      const sent = ensureZhPeriod(raw.trim());
      if (!sent || sent.length < 2) continue;
      if (
        chunks.length &&
        titleCore &&
        sent.replace(/\s+/g, "").startsWith(titleCore.replace(/\s+/g, ""))
      ) {
        continue;
      }
      const next = chunks.join("") + sent;
      const nextChars = Array.from(next).length;
      if (chunks.length >= 1 && nextChars > maxChars) break;
      chunks.push(sent);
      const nSent = chunks.length;
      const nChars = Array.from(chunks.join("")).length;
      if (nSent >= 4 || nChars >= maxChars) break;
      if (nSent >= 3 && nChars >= 130) break; // prefer 2–3 sentences when material allows
    }
  }

  let out = chunks.join("");
  if (!out) return "";

  // Soft floor: if only a short title, keep it as a clear one-sentence summary
  const chars = Array.from(out);
  if (chars.length <= maxChars) return out;

  // Truncate on sentence boundary when possible
  let head = chars.slice(0, maxChars).join("");
  const lastStop = Math.max(
    head.lastIndexOf("。"),
    head.lastIndexOf("！"),
    head.lastIndexOf("？")
  );
  if (lastStop > maxChars * 0.5) {
    return head.slice(0, lastStop + 1);
  }
  const lastComma = Math.max(head.lastIndexOf("，"), head.lastIndexOf("；"));
  if (lastComma > maxChars * 0.55) {
    return head.slice(0, lastComma) + "…";
  }
  return head.replace(/[，、,;\s]+$/u, "") + "…";
}

async function translateNewsItem(item) {
  const titleSrc = cleanNewsText(item.title || "");
  const textSrc = cleanNewsText(item.text || "");

  // Always translate title + description when present (need context for key points)
  const [tTitle, tText] = await Promise.all([
    translateToZh(titleSrc),
    textSrc && textSrc !== titleSrc
      ? translateToZh(textSrc.slice(0, 480))
      : Promise.resolve(null),
  ]);

  let titleZhFull = cleanNewsText(tTitle.textZh || titleSrc);
  let textZhFull = tText ? cleanNewsText(tText.textZh || textSrc) : "";

  // Ignore body that is mostly URL / markup residue from Google News descriptions
  if (
    textZhFull &&
    (textZhFull.length < 18 ||
      /https?:\/\//i.test(textZhFull) ||
      (textZhFull.match(/[\u4e00-\u9fff]/g) || []).length < 12)
  ) {
    textZhFull = "";
  }

  let summaryZh = toKeyPointsZh(titleZhFull, textZhFull, 160);
  // Title-only / thin body: expand into 2 clear Chinese sentences (no invented facts)
  if (Array.from(summaryZh).length < 80 && !textZhFull) {
    const core = cleanNewsText(summaryZh).replace(/[。！？!?…]+$/u, "");
    let expanded = "";
    const parts = core.split(/[：:]/);
    // Only split when the lead-in is a real clause (not a short outlet/name like "花旗")
    if (
      parts.length >= 2 &&
      Array.from(parts[0].trim()).length >= 8 &&
      parts[1].trim()
    ) {
      expanded =
        ensureZhPeriod(parts[0].trim()) +
        ensureZhPeriod(parts.slice(1).join("：").trim());
    } else if (parts.length >= 2 && parts[1].trim()) {
      expanded = ensureZhPeriod(
        parts[0].trim() + "指出，" + parts.slice(1).join("：").trim()
      );
      expanded +=
        "市场与政策面仍在消化相关信息，具体影响需结合后续官方表态与原文报道判断。";
    } else {
      expanded =
        ensureZhPeriod(core) +
        "市场与政策面仍在消化相关信息，具体影响需结合后续官方表态与原文报道判断。";
    }
    summaryZh = toKeyPointsZh(expanded, "", 160);
  }

  return {
    ...item,
    // Primary UI fields — Chinese key-points summary (2–4 sentences when possible)
    title: summaryZh,
    text: summaryZh,
    summaryZh,
    titleZh: summaryZh,
    titleOriginal: item.title || titleSrc,
    textOriginal: item.text || textSrc,
    translated: Boolean(tTitle.translated || (tText && tText.translated) || looksChinese(summaryZh)),
    translateEngine: tTitle.engine || (tText && tText.engine) || (looksChinese(titleSrc) ? "source-zh" : null),
  };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(limit, items.length) || 1;
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function buildNews(categoryFilter) {
  const now = Date.now();
  if (newsCache.data && now - newsCache.at < newsCache.ttlMs && !categoryFilter) {
    return newsCache.data;
  }

  const cats = categoryFilter
    ? [categoryFilter]
    : ["crypto", "politics", "economy"];

  const categories = {};
  const errors = [];

  await Promise.all(
    cats.map(async (cat) => {
      const feeds = NEWS_FEEDS[cat] || [];
      const meta = CATEGORY_META[cat];
      const results = await Promise.all(feeds.map(fetchFeedItems));
      const merged = [];
      for (const r of results) {
        if (Array.isArray(r)) merged.push(...r);
        else if (r?.error) errors.push(r.error);
      }
      const limit = cat === "crypto" ? 8 : 6;
      categories[cat] = {
        id: meta.id,
        label: meta.label,
        emphasis: meta.emphasis,
        items: dedupeSort(merged, limit),
      };
    })
  );

  // Translate titles/summaries to zh-CN (cached). Keep originals for UI secondary line.
  for (const cat of Object.keys(categories)) {
    const items = categories[cat].items || [];
    categories[cat].items = await mapPool(items, 2, translateNewsItem);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    disclaimer:
      "中文要点摘要 · 来自公开 RSS / 新闻聚合，非 X/Twitter 官方接口",
    categories,
    errors: errors.length ? errors : undefined,
  };

  if (!categoryFilter) {
    newsCache.at = now;
    newsCache.data = payload;
  }
  return payload;
}

async function buildQuotes() {
  const stockPromises = STOCKS.map(async (s) => {
    const card = cardBase(s);
    try {
      const q = await fetchYahooDaily(s.yahoo);
      Object.assign(card, q);
      card.changeBasis = "prev_close";
    } catch (err) {
      card.error = err.message || String(err);
    }
    return card;
  });

  let gecko = null;
  let geckoError = null;
  try {
    gecko = await fetchCoinGecko();
  } catch (err) {
    geckoError = err.message || String(err);
  }

  const cryptoPromises = CRYPTO.map(async (c) => {
    const card = cardBase(c);
    card.changeBasis = "24h";

    // Always try Yahoo daily for candlesticks (+ price fallback)
    let daily = null;
    let dailyErr = null;
    try {
      daily = await fetchYahooDaily(c.yahoo);
      card.candles = daily.candles;
      card.candleInterval = daily.candleInterval;
      card.candleRange = daily.candleRange;
    } catch (err) {
      dailyErr = err.message || String(err);
      card.candles = [];
      card.candleError = dailyErr;
    }

    if (
      gecko &&
      gecko[c.coingecko] &&
      typeof gecko[c.coingecko].usd === "number"
    ) {
      const row = gecko[c.coingecko];
      card.price = row.usd;
      card.changePercent =
        typeof row.usd_24h_change === "number" ? row.usd_24h_change : 0;
      if (typeof row.price_change_24h === "number") {
        card.change = row.price_change_24h;
      } else if (typeof row.usd_24h_change === "number") {
        const prev = card.price / (1 + row.usd_24h_change / 100);
        card.change = card.price - prev;
      } else {
        card.change = 0;
      }
      card.changeBasis = "24h";
      card.updatedAt = new Date().toISOString();
      card.source = "coingecko";
      return card;
    }

    // Yahoo fallback: price from daily, change from rolling 24h hourly chart
    if (!daily) {
      card.error = geckoError
        ? `CoinGecko: ${geckoError}; Yahoo: ${dailyErr}`
        : dailyErr || "Yahoo failed";
      return card;
    }
    card.price = daily.price;
    card.updatedAt = daily.updatedAt;
    card.source = geckoError ? "yahoo-fallback" : "yahoo";
    try {
      const h24 = await fetchYahooRolling24h(c.yahoo, daily.price);
      card.change = h24.change;
      card.changePercent = h24.changePercent;
      card.changeBasis = "24h";
      card.price24hAgo = h24.price24hAgo;
    } catch (err) {
      // Do NOT fall back to daily previousClose for crypto change
      card.change = null;
      card.changePercent = null;
      card.changeBasis = "24h";
      card.changeError = err.message || String(err);
    }
    return card;
  });

  const [stocks, cryptos] = await Promise.all([
    Promise.all(stockPromises),
    Promise.all(cryptoPromises),
  ]);

  return {
    updatedAt: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    stocks,
    cryptos,
  };
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/quotes", async (_req, res) => {
  try {
    const payload = await buildQuotes();
    res.set("Cache-Control", "no-store");
    res.json(payload);
  } catch (err) {
    res.status(500).json({
      error: err.message || String(err),
      updatedAt: new Date().toISOString(),
      stocks: [],
      cryptos: [],
    });
  }
});

app.get("/api/news", async (req, res) => {
  try {
    const cat = (req.query.category || "").toLowerCase();
    const allowed = ["politics", "economy", "crypto"];
    const filter = allowed.includes(cat) ? cat : null;
    const payload = await buildNews(filter);
    if (filter) {
      res.json({
        updatedAt: payload.updatedAt,
        timezone: payload.timezone,
        disclaimer: payload.disclaimer,
        category: payload.categories[filter],
        errors: payload.errors,
      });
    } else {
      res.json(payload);
    }
  } catch (err) {
    res.status(500).json({
      error: err.message || String(err),
      updatedAt: new Date().toISOString(),
      categories: {},
    });
  }
});

const YAHOO_BY_SYMBOL = Object.fromEntries(
  [...STOCKS, ...CRYPTO].map((x) => [x.symbol, x.yahoo])
);

app.get("/api/candles", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "").toUpperCase();
    const yahoo = YAHOO_BY_SYMBOL[symbol];
    if (!yahoo) {
      return res.status(400).json({
        error: "Unknown symbol. Use SPY,QQQ,BNC,BTC,ETH,BNB,PONS,UNI",
      });
    }
    const q = await fetchYahooDaily(yahoo);
    res.set("Cache-Control", "no-store");
    res.json({
      symbol,
      yahoo,
      interval: q.candleInterval,
      range: q.candleRange,
      candles: q.candles,
      updatedAt: q.updatedAt,
    });
  } catch (err) {
    res.status(502).json({ error: err.message || String(err) });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Price dashboard listening on http://0.0.0.0:${PORT}`);
});
