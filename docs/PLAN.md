# 第一階段 MVP 實作計畫

範圍：需求表單 → 行程大綱（含午晚餐、購物、景點）→ 天氣與營業時間確認 → 行程頁（地圖＋每日展開）。
交通、花費、登入不在這一階段。完整需求見 [SPEC.md](SPEC.md)。

## 決定事項

| 項目 | 決定 |
| --- | --- |
| 後端 | FastAPI + Pydantic，`uv` 管理套件 |
| 前端 | React + TypeScript + Vite + Tailwind，型別手寫在 `types.ts` 並與 Pydantic 對齊 |
| LLM | Claude API，手寫 agent loop；`MODEL` 環境變數，預設 `claude-opus-5-5`，開發期可設 `claude-haiku-5-5` |
| 天氣 | Open-Meteo：16 天內用預報，之後用過去 5 年同期 ±3 天平均；免 key |
| 店家與景點 | Google Places API (New) Text Search；所有 stop（景點、餐廳、購物）都要確認營業時間 |
| 地圖 | Google Maps JavaScript API（`@vis.gl/react-google-maps`、Advanced Markers、Map ID 樣式） |
| 介面語言 | 繁中 |
| 設計 | 沿用「青森・函館 冬之島」的配色與字型，去掉浮島；上方地圖、下方逐日展開 |
| 使用限制 | 一般使用者不需要任何 key；產生行程要邀請碼，每碼每天 3 份、全站每天 20 份 |
| README | 分「一般使用者」和「自己架設」兩節；骨架先建，每步補上該步用法，步驟 9 統一整理 |
| Commit | 每步完成後先給使用者看，由使用者決定是否 commit |

## 資料夾結構

```text
backend/
  app/
    main.py              # FastAPI routes
    models.py            # TripRequest / Trip / Day / Stop / Weather / PlaceHours
    agent/               # loop.py, prompts.py, tools.py, validate.py
    tools/               # weather.py, places.py
    fixtures/sample_trip.json
  tests/
frontend/
  src/
    api.ts, types.ts
    pages/               # RequestForm, OutlineReview, TripPage
    components/          # TripMap, DayAccordion, StopRow, WeatherBadge, HoursChip
```

## API

- `POST /api/outline`：`TripRequest` → `TripOutline`（跑 agent loop）
- `POST /api/trips`：使用者確認後的 `TripOutline` → `Trip`（程式填天氣與營業時間，不呼叫 LLM）
- `GET /api/trips/sample`：範例行程（前端開發用，公開）
- `GET /api/health`

## 邀請碼與次數上限

- `POST /api/outline` 和 `POST /api/trips` 需要 `X-Invite-Code` header；有效的碼放在環境變數 `INVITE_CODES`（逗號分隔）。
- 只有 `POST /api/outline` 計入額度：每個邀請碼每天 3 份、全站每天 20 份（日本時間午夜歸零），數字可用環境變數調整。
- 超過 → HTTP 429，前端顯示「今天額度用完了」；無效的碼 → 401。
- 前端表單有邀請碼欄位，存在 `localStorage`。
- 計數存在資料庫：開發用 SQLite。注意 Render 免費方案的磁碟在休眠或重新部署時會清空，上線時改用免費的 Postgres（例如 Neon）。
- 最後防線：Google Cloud 每日配額＋預算警示、Anthropic 每月花費上限。

## 資料模型重點

- LLM 只產出 `TripOutline`（每天的 title、area、area 座標、stops 的 name / kind / meal / place_id / arrive / stay_min）。
- `kind`: `sight | meal | shop`；`meal`: `lunch | dinner`。
- 所有 stop 必須有 `place_id`（只能用 `search_place` 回傳的值），座標由 Places 提供。
- 成品 `Trip` 的 `weather`、`hours`（`PlaceHours`）、`id`、`warnings` 全由程式填。

## Agent

- 工具：`get_weather(lat, lng, date)`、`search_place(query, lat, lng, radius_m, date)`、`submit_outline(TripOutline)`，皆 `strict: true`。
- `search_place` 回 3–5 個候選，只附該日期當天的營業時間，節省 token。
- 上限：12 回合、60 次工具呼叫；結果快取。
- `submit_outline` 時程式檢查：
  1. 日期涵蓋 start–end，不缺不重複
  2. 每天有午餐、晚餐（抵達日／回程日依航班時間豁免）
  3. 每個 stop 有 `place_id` 且 `business_status == OPERATIONAL`
  4. 抵達與離開時間在營業時段內（處理午休、跨午夜；無營業時間資料的戶外景點不算錯，標「無營業時間資料」）
  5. 同一天 `arrive` 依序遞增、停留不重疊
  6. 出發日超過 7 天又遇年末年始／國定假日 → 加「營業時間可能變動」警示
- 檢查失敗 → `is_error` 退回重排，最多 2 次；仍失敗就回傳並列入 `warnings`。

## 行程頁

- 上方：長方形圓角 Google 地圖，青森配色樣式，左上品牌小卡、右上「全景」。
- 下方：逐日列（斜體珊瑚色天數、標題、日期、天氣），展開後是時間軸（時間｜類型標籤＋名稱＋營業時間 ✓＋地圖連結），警示用提醒框。
- 連動：展開一天 → 地圖縮放到當天、只顯示當天編號圖釘與珊瑚色虛線；點行程 ↔ 點圖釘互相反白並捲動；「全景」回到整趟。
- 手機：地圖固定在上方約 40% 高度。
- MVP 點與點之間是直線虛線，第二階段接 Routes API 後改成實際路線。

## 步驟

| # | 內容 | 需要的 key |
| --- | --- | --- |
| 0 | 整理 repo：`.gitignore`、規格改名 `docs/SPEC.md`、本計畫 | — |
| 1 | 後端骨架：FastAPI + `/api/health` + pytest | — |
| 2 | 資料模型和範例資料（含餐廳、購物、營業時間） | — |
| 3 | 行程頁（不含地圖）：逐日展開列表，用範例資料 | — |
| 4 | 地圖和連動 | Maps JS 前端 key、Map ID |
| 5 | `get_weather` 和 `POST /api/trips` | — |
| 6 | `search_place` 和營業時間檢查 | Places 後端 key |
| 7 | Agent loop 和 `POST /api/outline`，加上邀請碼與每日次數上限 | Anthropic API key |
| 8 | 前端串完整流程：表單（含邀請碼）→ 大綱確認 → 行程頁，處理 401 / 429 | — |
| 9 | README：架構、啟動方式、設計決策 | — |

## 費用控管

- Google Cloud：設每日配額與預算警示；前端 key 限網域、後端 key 限 Places API。
- Anthropic Console：設每月花費上限。
- 開發期用 Haiku 5.5；上線版用邀請碼＋每日次數上限（見上方）。
- Places 是最大宗費用：跨行程快取（依 Google 條款，只有 `place_id` 可長期保存）、候選數 3 個、景點只查一次。
