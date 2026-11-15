# Google 地圖設定教學（步驟 4）

行程頁上方的地圖要用 Google Maps JavaScript API。你需要準備兩樣東西，放進 `frontend/.env.local`：

| 名稱 | 是什麼 |
| --- | --- |
| `VITE_GOOGLE_MAPS_API_KEY` | 前端專用的 API key，會出現在瀏覽器裡，所以一定要加限制 |
| `VITE_GOOGLE_MAP_ID` | Map ID，青森配色的地圖樣式掛在它上面 |

費用：地圖載入屬於 Dynamic Maps SKU，每月前 10,000 次免費。作品集的用量不會超過。

---

## 1. 建立專案

1. 打開 <https://console.cloud.google.com/>，用你的 Google 帳號登入。
2. 最上方的專案選單 → **新增專案**，名稱例如 `travel-planner`，建立後切換到這個專案。

## 2. 綁定帳單（必要）

1. 左側選單 → **帳單** → 連結帳單帳戶（要信用卡）。
2. **建議設預算警示**：帳單 → **預算與快訊** → 建立預算，例如每月 US$10，到 50%、90%、100% 時寄信給你。

> 預算警示只會通知，不會自動停止服務。真正的上限要靠第 7 步的配額。

## 3. 啟用 Maps JavaScript API

1. 左側選單 → **API 和服務** → **程式庫**。
2. 搜尋 **Maps JavaScript API** → 啟用。

（後端查店家用的 Places API (New) 另見 [Google Places 設定教學](GOOGLE_PLACES_SETUP.md)。）

## 4. 建立前端專用的 API key

1. **API 和服務** → **憑證** → **建立憑證** → **API 金鑰**。
2. 建好後點 **編輯 API 金鑰**，名稱改成 `frontend-maps`。
3. **應用程式限制** → 選 **網站**，加入：
   - `http://localhost:5173/*`
   - `http://localhost:5174/*`
   - `http://127.0.0.1:5173/*`
   - （部署後再加上正式網址，例如 `https://你的網站.vercel.app/*`）
4. **API 限制** → 選 **限制金鑰** → 只勾 **Maps JavaScript API**。
5. 儲存，複製金鑰。

> 這把 key 會出現在瀏覽器裡，任何人都看得到。上面的網站限制和 API 限制就是讓別人拿到也沒辦法拿去用。**不要**和後端查 Places 用的 key 共用。

## 5. 建立地圖樣式（青森配色）

1. 左側選單 → **Google Maps Platform** → **地圖樣式（Map Styles）**。
2. **建立樣式** → 選 **淺色（Light）** → 切到 **JSON** 分頁。
3. 把 repo 裡 [`docs/map-style.json`](map-style.json) 的內容整個貼上，儲存，名稱例如 `aomori-paper`。

如果 JSON 匯入失敗，改用編輯器手動調整也可以，重點是這幾個顏色：

| 地圖元素 | 顏色 |
| --- | --- |
| 陸地 | `#FBF7F1`（米白紙色） |
| 水域 | `#9CC4C5`（海藍） |
| 道路 | 填色 `#FFFFFF`，邊線 `#E6DBCF` |
| 地名文字 | `#6B625A` |
| 景點、店家標籤（POI） | 隱藏 |

## 6. 建立 Map ID 並套用樣式

1. **Google Maps Platform** → **地圖管理（Map Management）** → **建立 Map ID**。
2. 名稱 `travel-planner`，地圖類型選 **JavaScript**，選 **向量（Vector）**，儲存。
3. 打開這個 Map ID → **地圖樣式** 的淺色模式 → 編輯 → 選 `aomori-paper` → 完成 → 儲存。
4. 複製 Map ID（一串英數字）。

## 7. 設定每日配額（真正的上限）

1. **API 和服務** → **已啟用的 API** → **Maps JavaScript API** → **配額與系統限制**。
2. 找到每日地圖載入次數（Map loads per day），改成例如 `300`。超過就當天停止服務，不會繼續計費。

> **免費試用期間這一步無法設定**（「編輯配額」會是灰色的）。試用期間 Google 不會收費，可以先跳過。**升級成付費帳戶後、部署給別人使用前，一定要回來設定。**

## 8. 放進專案

在 `frontend/` 建立 `.env.local`（這個檔案不會被 commit）：

```bash
cd frontend
cp .env.example .env.local
```

打開 `.env.local` 填入：

```text
VITE_GOOGLE_MAPS_API_KEY=你在第 4 步複製的金鑰
VITE_GOOGLE_MAP_ID=你在第 6 步複製的 Map ID
```

存檔後**重新啟動前端**（在跑前端的分頁按 `Ctrl + C`，再執行 `npm run dev`），重新整理頁面就會看到地圖。

## 常見問題

| 畫面 | 原因 |
| --- | --- |
| 地圖區塊顯示「尚未設定 Google 地圖」 | `.env.local` 沒有填，或填完沒重新啟動前端 |
| 地圖灰色、出現「這個網頁無法正確載入 Google 地圖」 | 帳單沒綁、API 沒啟用，或 key 的網站限制沒加 `localhost:5173` |
| 地圖正常但不是米白色 | Map ID 沒有套用樣式，或樣式還在發布中（等幾分鐘） |
