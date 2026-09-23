# 行情看板（Price Dashboard）

深色风格的美股 / 数字货币行情看板，下方附带「X 最新消息」资讯区。价格每 **20 秒** 自动刷新，消息约每 **2 分钟** 刷新。无需 API Key。

## 展示内容

### 价格卡片

- **美股**：SPY、QQQ、BNC（Yahoo Finance chart API）
- **数字货币**：BTC、ETH、BNB、PONS、UNI
  - CoinGecko：`bitcoin` / `ethereum` / `binancecoin` / `pons` / `uniswap`
  - Yahoo 备用：`BTC-USD` / `ETH-USD` / `BNB-USD` / `PONS-USD` / `UNI7083-USD`
- 卡片字段：代码、中文名、**实时价格**（USD）、**涨跌幅**、**日线蜡烛图**（Yahoo OHLC，约 20–40 根）、**更新时间**（Asia/Shanghai，UTC+8）
- **涨跌口径**：
  - 美股（SPY / QQQ / BNC）：相对昨收（`changeBasis: "prev_close"`），界面标注「较昨收」
  - 数字货币：滚动 **24 小时**（`changeBasis: "24h"`），优先 CoinGecko `price_change_24h` / `price_change_percentage_24h`；Yahoo 备用则用 1h×5d 对比约 24h 前价格（**不用**日线昨收），界面标注「24h」

- 蜡烛图：绿涨红跌（西方惯例，与卡片涨跌色一致）；原生 SVG 绘制，无额外图表库依赖
- 某标的失败时仍保留卡片并显示错误（不会捏造价格）

### X 最新消息

- 每条消息仅展示 **中文要点摘要（约 2–4 句 / 80–160 字）**（`summaryZh` / `titleZh`，约 80–160 字；由 RSS 标题+摘要译写）
- 服务端 Google 翻译（dict-chrome / gtx），失败回退 MyMemory；翻译结果内存缓存约 6 小时
- 来源名、相对时间、原文链接保留；手机端约 4 行截断，桌面最多 5 行；仅中文正文，无英文副标题
- 声明：一句话中文总结 · 来自公开 RSS


## 启动方式

```bash
cd /workspace/price-dashboard
npm install && npm start
```

浏览器打开：**http://localhost:3847**

指定端口：

```bash
PORT=3000 npm start
```

## API

- `GET /api/quotes` — 全部股价与加密货币 JSON（含 `candles` OHLC 数组）
- `GET /api/candles?symbol=SPY` — 单标的日线蜡烛（可选）
- `GET /api/news` — 三类消息合并结果
- `GET /api/news?category=crypto|politics|economy` — 单类消息
- `GET /api/health` — 健康检查

## 移动端布局

- **手机（默认 / ≤768px）**：行情卡片固定 **2 列**（mobile-first，避免 `auto-fill + minmax(240px)` 在窄屏只排出 1 列）
- **手机（≤768px）**：行情卡片最多 **2 列**
- **平板（≤900px）**：2 列；**≤1024px**：最多 3 列
- **桌面**：自适应更密网格（3+）

## 技术栈

- 前端：原生 HTML / CSS / JS
- 后端：Node.js + Express，服务端拉取行情与 RSS，避免浏览器 CORS
