# Google Places 設定教學（步驟 6）

後端用 Google Places API (New) 查每個景點、餐廳、購物點的座標和營業時間。你需要一把**後端專用**的 key，放進 `backend/.env`：

| 名稱 | 是什麼 |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | 只放在伺服器上，瀏覽器看不到 |

沿用 [Google 地圖設定教學](GOOGLE_MAPS_SETUP.md) 建好的同一個專案和帳單。**不要**拿前端那把地圖 key 來用。

## 費用

查營業時間和評分屬於 Enterprise 等級：

| 用途 | 每 1,000 次 | 每月免費 |
| --- | --- | --- |
| Text Search（agent 找店） | US$35 | 1,000 次 |
| Place Details（確認行程時補資料） | US$20 | 1,000 次 |

一份 8 天的行程大約 30 個地點，agent 搜尋 30–45 次，所以**每月約 25 份行程在免費額度內**，超過後每份約 US$1–1.6。確認行程時，agent 剛查過的地點會從快取拿，通常不會再多花 Place Details。實際次數會在步驟 7 量測後更新。

---

## 1. 啟用 Places API (New)

1. <https://console.cloud.google.com/> → 確認最上方是 `travel-planner` 專案。
2. **API 和服務** → **程式庫** → 搜尋 **Places API (New)** → 啟用。

> 注意要選有 **(New)** 的那個。舊版的「Places API」程式不支援。

## 2. 建立後端專用的 API key

1. **API 和服務** → **憑證** → **建立憑證** → **API 金鑰**。
2. **編輯 API 金鑰**，名稱改成 `backend-places`。
3. **應用程式限制** → 開發期間先選 **無**。
   - 家裡的網路 IP 會變，設 IP 限制反而常常失效。
   - 這把 key 只存在你電腦的 `backend/.env` 和之後的伺服器設定裡，不會出現在瀏覽器。
   - 部署後可以改成 **IP 位址**，填伺服器的對外 IP。
4. **API 限制** → **限制金鑰** → 只勾 **Places API (New)**。
5. 儲存，複製金鑰。

## 3. 設定每日配額

1. **API 和服務** → **已啟用的 API** → **Places API (New)** → **配額與系統限制**。
2. 找到這兩列（表格是英文名稱），點右邊的 **⋮** → **編輯配額**，各改成例如 `300`。超過就當天停止，不會繼續計費。

| 表格裡的名稱 | 是什麼 | 預設 |
| --- | --- | --- |
| `SearchTextRequest per day` | Text Search：agent 找店 | 75,000 |
| `GetPlaceRequest per day` | Place Details：確認行程時補資料 | 75,000 |

   其他列（Nearby Search、照片、評論、Autocomplete…）這個專案沒用到，不用管。

> 跟地圖一樣，**免費試用期間無法編輯配額**，可以先跳過；升級成付費帳戶後、部署前一定要回來設定。

## 4. 放進專案

```bash
cd backend
cp .env.example .env   # 已經有 .env 就跳過，直接編輯
```

打開 `backend/.env`，填入：

```text
GOOGLE_PLACES_API_KEY=你在第 2 步複製的金鑰
```

存檔後**重新啟動後端**（`Ctrl + C`，再跑一次 `uv run uvicorn ...`）。

## 5. 測試

```bash
cd backend
uv run python -m scripts.check_places
```

會印出青森站附近 3 家拉麵店、12/25 當天的營業時間，以及中午 12 點去有沒有開。每跑一次算 1 次 Text Search。

## 常見問題

| 訊息 | 原因 |
| --- | --- |
| `GOOGLE_PLACES_API_KEY is empty` | `.env` 沒填或沒存檔，或不在 `backend/` 裡執行 |
| `Places HTTP 403: ... API has not been used ... or it is disabled` | 第 1 步沒啟用，或啟用的是舊版 Places API；剛啟用要等幾分鐘 |
| `Places HTTP 403: ... API key not valid` / `blocked` | key 複製錯，或 API 限制沒勾 Places API (New) |
| `Places HTTP 429` | 碰到配額上限 |
