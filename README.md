# Travel Planner AI Agent

輸入目的地、日期和偏好，AI agent 幫你排出日本自由行的每日行程：景點、午餐、晚餐、購物點，並用 Google 地圖確認每家店的營業時間，附上當天天氣，最後產生一份可以直接出發的行程頁。

<!-- TODO（步驟 8）：demo 截圖或 GIF -->

> **目前進度**：第一階段 MVP 開發中，已完成步驟 3（行程頁，尚未加地圖）／9。詳見 [實作計畫](docs/PLAN.md)。

## 功能

| 功能 | 狀態 |
| --- | --- |
| 需求表單：目的地、日期、航班、人數、預算、偏好、已訂住宿 | 🚧 開發中 |
| 行程大綱：每天的景點順序和午晚餐，產生後可以先確認、調整 | 🚧 開發中 |
| 營業時間確認：所有景點、餐廳、購物點都用 Google Places 查證 | 🚧 開發中 |
| 天氣：16 天內用預報，更遠的日期用歷史同期平均，頁面會標明是哪一種 | 🚧 開發中 |
| 行程頁：上方是地圖，下方是逐日展開的行程，兩邊連動，手機也好看 | 🚧 開發中 |
| 交通、花費計算、可行性檢查 | 第二階段 |
| 登入、儲存、分享 | 第三階段 |

---

## 一般使用者

打開網站就能用，**不需要申請任何 API key**。

<!-- TODO（部署後）：網站連結 -->

1. **看範例行程**：不需要邀請碼，可以直接看完整的行程頁和地圖。
2. **產生自己的行程**：需要邀請碼，請向作者索取。
   - 每個邀請碼每天可以產生 3 份行程，整個網站每天最多 20 份。
   - 看到「今天額度用完了」，請隔天再試（日本時間午夜重置）。
3. **流程**：填表單 → 確認、調整大綱 → 看行程頁。

<!-- TODO（步驟 8）：每個畫面的截圖和說明 -->

---

## 自己架設

### 需要的工具

- Python 3.13 以上
- [uv](https://docs.astral.sh/uv/)（Python 套件管理）：macOS 可以用 `brew install uv` 安裝
- Node.js 22.12 以上（建議 24）：macOS 可以用 `brew install node@24` 安裝，再依照 Homebrew 的提示把它加進 `PATH`

### 需要的 API key

| Key | 用途 | 從哪個步驟開始需要 | 申請位置 |
| --- | --- | --- | --- |
| Google Maps JavaScript API key＋Map ID | 前端顯示地圖 | 步驟 4 | Google Cloud Console |
| Google Places API (New) key | 查店家、景點的座標和營業時間 | 步驟 6 | Google Cloud Console |
| Anthropic API key | 讓 Claude 排行程 | 步驟 7 | Anthropic Console |

天氣使用 [Open-Meteo](https://open-meteo.com/)，非商業用途免費，不需要 key。

<!-- TODO（步驟 4、6、7）：每把 key 的申請步驟、權限限制，以及怎麼放進 .env -->

> **控制費用**：請在 Google Cloud 設定每日配額和預算警示，在 Anthropic Console 設定每月花費上限。開發時可以設 `MODEL=claude-haiku-5-5` 省錢。

### 啟動後端

```bash
cd backend
cp .env.example .env      # 之後的步驟會在這裡填入 API key
uv sync                   # 安裝套件
uv run uvicorn app.main:app --reload --port 8000
```

打開 <http://localhost:8000/api/health>，看到 `{"status":"ok", ...}` 就代表啟動成功。API 文件在 <http://localhost:8000/docs>。

範例行程（青森・函館 8 天）在 <http://localhost:8000/api/trips/sample>，不需要任何 key。範例裡的營業時間僅供示意。

### 啟動前端

後端要先跑起來（前端會把 `/api` 轉給 `localhost:8000`）。另開一個終端機：

```bash
cd frontend
npm install
npm run dev
```

打開 <http://localhost:5173>，會看到範例行程頁。

### 測試

```bash
cd backend
uv run pytest
```

---

## 文件

- [需求規格](docs/SPEC.md)
- [第一階段實作計畫](docs/PLAN.md)

<!-- TODO（步驟 9）：架構圖、設計決策 -->
