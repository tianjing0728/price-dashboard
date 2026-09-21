const REFRESH_MS = 20000;
const NEWS_REFRESH_MS = 120000;
const TZ = "Asia/Shanghai";

const stocksGrid = document.getElementById("stocks-grid");
const cryptosGrid = document.getElementById("cryptos-grid");
const updatedAtEl = document.getElementById("updated-at");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const countdownEl = document.getElementById("countdown");
const newsFeed = document.getElementById("news-feed");
const newsUpdated = document.getElementById("news-updated");
const newsCountdown = document.getElementById("news-countdown");
const newsDisclaimer = document.getElementById("news-disclaimer");

let nextRefreshAt = 0;
let nextNewsAt = 0;
let activeNewsCat = "crypto";
let newsPayload = null;

function formatShanghai(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d) + " CST"
  );
}

function formatRelative(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

function formatPrice(n) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const opts =
    abs >= 1000
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : abs >= 1
        ? { minimumFractionDigits: 2, maximumFractionDigits: 4 }
        : { minimumFractionDigits: 4, maximumFractionDigits: 6 };
  return n.toLocaleString("en-US", opts);
}

function formatSigned(n, digits = 2) {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return (
    sign +
    n.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

function direction(pct) {
  if (typeof pct !== "number" || Number.isNaN(pct) || pct === 0) return "flat";
  return pct > 0 ? "up" : "down";
}

function candleChartSvg(candles) {
  if (!Array.isArray(candles) || candles.length < 1) {
    return `<div class="candle-empty">暂无日线数据</div>`;
  }
  const w = 320;
  const h = 88;
  const padX = 4;
  const padY = 6;
  const n = candles.length;
  const lows = candles.map((c) => c.l);
  const highs = candles.map((c) => c.h);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const slot = (w - padX * 2) / n;
  const bodyW = Math.max(1.5, Math.min(7, slot * 0.62));
  const yScale = (v) => padY + ((max - v) / span) * (h - padY * 2);
  const up = "#22c55e";
  const down = "#f43f5e";

  const parts = candles.map((bar, i) => {
    const cx = padX + slot * i + slot / 2;
    const yO = yScale(bar.o);
    const yC = yScale(bar.c);
    const yH = yScale(bar.h);
    const yL = yScale(bar.l);
    const bull = bar.c >= bar.o;
    const color = bull ? up : down;
    const top = Math.min(yO, yC);
    const bodyH = Math.max(1, Math.abs(yC - yO));
    return `
      <line x1="${cx.toFixed(2)}" y1="${yH.toFixed(2)}" x2="${cx.toFixed(2)}" y2="${yL.toFixed(2)}"
        stroke="${color}" stroke-width="1.2" stroke-linecap="round" />
      <rect x="${(cx - bodyW / 2).toFixed(2)}" y="${top.toFixed(2)}" width="${bodyW.toFixed(2)}"
        height="${bodyH.toFixed(2)}" fill="${color}" rx="0.5" />`;
  });

  return `
    <div class="candle-wrap">
      <div class="candle-label">日线 · ${n} 根</div>
      <svg class="candle-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="日线蜡烛图">
        ${parts.join("")}
      </svg>
    </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cardHtml(asset) {
  const hasError = Boolean(asset.error);
  const dir = direction(asset.changePercent);
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "●";
  const priceHtml =
    typeof asset.price === "number"
      ? `${formatPrice(asset.price)}<span class="currency">USD</span>`
      : "—";
  const chgPct =
    typeof asset.changePercent === "number"
      ? `${formatSigned(asset.changePercent)}%`
      : "—";
  const chgAbs =
    typeof asset.change === "number" ? formatSigned(asset.change) : "—";
  const sourceLabel =
    asset.source === "coingecko"
      ? "CoinGecko"
      : asset.source === "yahoo-fallback"
        ? "Yahoo (备用)"
        : asset.source === "yahoo"
          ? "Yahoo"
          : "—";
  const basis =
    asset.changeBasis === "24h"
      ? "24h"
      : asset.changeBasis === "prev_close"
        ? "较昨收"
        : "";
  const basisClass =
    asset.changeBasis === "24h"
      ? "basis-24h"
      : asset.changeBasis === "prev_close"
        ? "basis-prev"
        : "";

  return `
    <article class="card ${hasError ? "error-card" : ""}" data-symbol="${escapeHtml(asset.symbol)}">
      <div class="card-top">
        <div>
          <div class="ticker">${escapeHtml(asset.symbol)}</div>
          <div class="display-name">${escapeHtml(asset.name || "")}</div>
        </div>
        <span class="badge">实时价格</span>
      </div>
      <div class="price">${priceHtml}</div>
      <div class="changes">
        ${basis ? `<span class="chg-basis ${basisClass}">${basis}</span>` : ""}
        <span class="chg ${dir}">${arrow} ${chgPct}</span>
        <span class="chg ${dir}">${chgAbs}</span>
      </div>
      ${candleChartSvg(asset.candles)}
      ${
        asset.candleError
          ? `<div class="err-msg">蜡烛图：${escapeHtml(asset.candleError)}</div>`
          : ""
      }
      ${
        hasError
          ? `<div class="err-msg">加载失败：${escapeHtml(asset.error)}</div>`
          : ""
      }
      <div class="card-foot">
        <span>${basis ? basis + " · " : ""}涨跌幅 · ${sourceLabel}</span>
        <span>${formatShanghai(asset.updatedAt)}</span>
      </div>
    </article>`;
}

function avatarColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue},70%,45%), hsl(${(hue + 40) % 360},65%,35%))`;
}

function initials(name) {
  const s = String(name || "?").trim();
  return s.slice(0, 2).toUpperCase();
}

function tweetHtml(item, isCrypto) {
  const rel = formatRelative(item.publishedAt);
  const abs = formatShanghai(item.publishedAt);
  const timeLabel = rel || abs;
  const link = item.url
    ? `<a class="tweet-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">原文 →</a>`
    : "";
  // One Chinese sentence only
  const summary =
    item.summaryZh || item.titleZh || item.title || item.text || "";

  return `
    <article class="tweet ${isCrypto ? "crypto-tone" : ""}">
      <div class="avatar" style="background:${avatarColor(item.author || item.source)}" aria-hidden="true">${escapeHtml(initials(item.author || item.source))}</div>
      <div class="tweet-body">
        <div class="tweet-head">
          <span class="tweet-author">${escapeHtml(item.author || item.source || "新闻")}</span>
          <span class="tweet-handle">${escapeHtml(item.handle || "")}</span>
          <span class="tweet-time" title="${escapeHtml(abs)}">${escapeHtml(timeLabel)}</span>
        </div>
        <p class="tweet-summary">${escapeHtml(summary)}</p>
        <div class="tweet-foot">
          <span>${escapeHtml(item.sourceLabel || "来源：新闻聚合")}</span>
          ${link}
        </div>
      </div>
    </article>`;
}

function renderSkeletons(el, n) {
  el.innerHTML = Array.from(
    { length: n },
    () => `<div class="skeleton"></div>`
  ).join("");
}

function setStatus(kind, text) {
  statusPill.classList.remove("ok", "err");
  if (kind) statusPill.classList.add(kind);
  statusText.textContent = text;
}

function tickCountdown() {
  const left = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
  countdownEl.textContent = `下次价格刷新 ${left}s`;
  const nLeft = Math.max(0, Math.ceil((nextNewsAt - Date.now()) / 1000));
  newsCountdown.textContent =
    nLeft > 0 ? `下次消息刷新 ${nLeft}s` : "消息刷新中…";
}

function renderNews() {
  if (!newsPayload?.categories) {
    newsFeed.innerHTML = `<div class="news-empty">暂无消息</div>`;
    return;
  }
  if (newsPayload.disclaimer) {
    newsDisclaimer.textContent = newsPayload.disclaimer;
  }
  newsUpdated.textContent = `消息更新时间：${formatShanghai(newsPayload.updatedAt)}`;
  const cat = newsPayload.categories[activeNewsCat];
  const items = cat?.items || [];
  if (!items.length) {
    newsFeed.innerHTML = `<div class="news-empty">该分类暂无可用头条</div>`;
    return;
  }
  newsFeed.innerHTML = items
    .map((it) => tweetHtml(it, activeNewsCat === "crypto"))
    .join("");
}

async function loadQuotes(isFirst) {
  if (isFirst) {
    renderSkeletons(stocksGrid, 3);
    renderSkeletons(cryptosGrid, 5);
    setStatus(null, "连接中…");
  }
  try {
    const res = await fetch("/api/quotes", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    stocksGrid.innerHTML = (data.stocks || []).map(cardHtml).join("");
    cryptosGrid.innerHTML = (data.cryptos || []).map(cardHtml).join("");
    updatedAtEl.textContent = formatShanghai(data.updatedAt);
    const failed = [...(data.stocks || []), ...(data.cryptos || [])].filter(
      (a) => a.error
    );
    if (failed.length) {
      setStatus("err", `部分失败 (${failed.map((f) => f.symbol).join(", ")})`);
    } else {
      setStatus("ok", "已同步");
    }
  } catch (err) {
    setStatus("err", "价格刷新失败");
    console.error(err);
  } finally {
    nextRefreshAt = Date.now() + REFRESH_MS;
    tickCountdown();
  }
}

async function loadNews(isFirst) {
  if (isFirst) {
    newsFeed.innerHTML = Array.from(
      { length: 4 },
      () => `<div class="skeleton" style="height:110px"></div>`
    ).join("");
  }
  try {
    const res = await fetch("/api/news", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    newsPayload = await res.json();
    renderNews();
  } catch (err) {
    newsFeed.innerHTML = `<div class="news-error">消息加载失败：${escapeHtml(err.message || err)}</div>`;
    console.error(err);
  } finally {
    nextNewsAt = Date.now() + NEWS_REFRESH_MS;
    tickCountdown();
  }
}

document.querySelectorAll(".news-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeNewsCat = btn.dataset.cat;
    document.querySelectorAll(".news-tab").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderNews();
  });
});

renderSkeletons(stocksGrid, 3);
renderSkeletons(cryptosGrid, 5);
loadQuotes(true);
loadNews(true);
setInterval(() => loadQuotes(false), REFRESH_MS);
setInterval(() => loadNews(false), NEWS_REFRESH_MS);
setInterval(tickCountdown, 500);
