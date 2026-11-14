# AI 旅遊規劃 Agent — 需求規格

Nov 14, 2026 · @Miriam

## 專案目標與定位

輸入目的地、日期和偏好後，agent 會產出一份可直接出發的行程頁：每日大綱、預估天氣、景點之間的交通、總花費，版面參考青森函館行程。

- **解決的問題**：規劃一趟自由行要在 Google Maps、天氣網站、交通官網和試算表之間來回切換，花上好幾個小時；LLM 直接給的行程又常算錯交通時間，或不管營業時間。
- **目標使用者**：第一階段是自己和朋友，只做日本自由行、5–8 天的旅程；其他國家等日本版穩定後再擴充。
- **CV 上要展現的能力**：LLM agent 設計（tool use、結構化輸出、human-in-the-loop）、整合外部 API、全端開發與部署，以及用評測數據證明品質。

## 使用流程

使用者每一步都能確認或修改，agent 不會一次吐出整份行程就結束。

1. **輸入需求**：目的地、日期、抵達與回程航班時間、人數、預算、偏好（溫泉、美食、不想太趕…）。已訂好的住宿也可以先填。
2. **產生大綱**：agent 給出每天的區域和景點順序，使用者可以拖曳調整或用對話改（「12/31 改去大沼」）。
3. **補上細節**：確認大綱後，系統查天氣、算兩點之間的交通、加總花費。
4. **可行性檢查**：標出問題，例如「交通 1.5 小時，到達時景點已關門」、「除夕巴士可能減班」，並提出改法。
5. **完整行程頁**：每日卡片（時間軸、天氣、交通、花費）加上總預算表，可以分享連結，手機也好看。
6. **對話式修改**：之後的修改只重算受影響的那幾天，不整份重做。

## 功能需求

MVP 只做「大綱＋天氣＋頁面」，先讓整條流程跑通；交通和花費是技術難點，放第二階段。

| 功能 | 說明 | 階段 |
| --- | --- | --- |
| 需求表單 | 目的地、日期、航班時間、人數、預算、偏好、已訂住宿 | MVP |
| 行程大綱 | LLM 產出每日區域與景點順序，輸出固定 JSON 格式 | MVP |
| 天氣 | 16 天內用預報，更遠的日期用歷史同期平均，頁面標明是哪一種 | MVP |
| 行程頁面 | 每日卡片＋時間軸，支援手機 | MVP |
| 景點資料 | 座標、營業時間、門票，用來檢查 LLM 有沒有亂編 | 第二階段 |
| 點到點交通 | 轉乘方式、時間、車資 | 第二階段 |
| 花費計算 | 交通＋門票＋住宿＋餐費估算，用程式加總；日幣換算台幣 | 第二階段 |
| 可行性檢查 | 營業時間、交通來不來得及、每日步行量、節日警示 | 第二階段 |
| 對話式修改 | 只重算受影響的天數 | 第三階段 |
| 儲存與分享 | 登入、儲存行程、分享連結 | 第三階段 |
| 匯出 | PDF 或加入行事曆 | 加分項 |

不在範圍內：訂房、訂票、付款。agent 只規劃，不幫使用者花錢。

## Agent 架構

LLM 只負責「安排」，天氣、交通、金額都由工具提供，輸出前再過一道程式檢查。

&#91;embedded content: agent 架構 · 1 個 agent、4 個工具、1 道檢查\]

Agent 每一輪可以呼叫任一工具；檢查不通過時，錯誤訊息會退回給 agent 重排，最多 2 次。

工具定義（給 Claude 的 tool schema）：

- `get_weather(lat, lng, date)` → 預報或歷史平均，附 source 欄位
- `search_place(name, city)` → 座標、營業時間、門票
- `get_route(from, to, depart_time)` → 交通方式、時間、車資
- `calc_cost(trip)` → 各類花費與總額（日幣／台幣）

## 資料結構

LLM 只產出「要去哪、什麼順序」；時間、交通、金額都由工具填入。前端只渲染這份 JSON，不自己算任何東西。

```json
{
  "trip": {
    "id": "aomori-2026-12",
    "destination": "青森・函館",
    "start_date": "2026-12-25",
    "end_date": "2027-01-01",
    "travelers": 2,
    "currency": { "base": "JPY", "display": "TWD", "rate": 0.21 },
    "days": [
      {
        "date": "2026-12-31",
        "title": "函館 → 青森",
        "weather": { "source": "forecast | climate_avg", "high_c": 2, "low_c": -5, "summary": "雪" },
        "lodging": { "name": "Dormy Inn Aomori", "cost": 12000 },
        "stops": [
          { "id": "s1", "name": "函館朝市", "lat": 41.77, "lng": 140.72,
            "arrive": "08:30", "stay_min": 90,
            "open_hours": "06:00-14:00", "ticket": 0, "note": "" }
        ],
        "legs": [
          { "from": "s1", "to": "s2", "mode": "train",
            "duration_min": 80, "fare": 7000, "detail": "新幹線 新函館北斗 → 新青森" }
        ],
        "warnings": ["除夕餐廳可能提早打烊"]
      }
    ],
    "cost_summary": { "transport": 0, "tickets": 0, "lodging": 0, "food_est": 0, "total": 0 }
  }
}
```

- **Stop**：景點，含停留時間和營業時間，可行性檢查靠這兩個欄位。
- **Leg**：兩個 Stop 之間的交通，獨立成一個物件，改一個景點時只需重算前後兩段。
- **weather.source**：區分「預報」和「歷史平均」，頁面上要看得出差別。
- **cost\_summary**：由程式從各筆 fare、ticket、lodging 加總，不讓 LLM 填。

## 外部 API 選擇

天氣用 Open-Meteo（免費、不用 key），地點和交通用 Google Maps Platform；日本大眾運輸的覆蓋率要先實測。

| 用途 | API | 注意事項 |
| --- | --- | --- |
| LLM | [Claude API](https://docs.claude.com/en/api/overview)（tool use） | 開發期用較便宜的模型跑測試，控制花費 |
| 天氣預報 | [Open-Meteo Forecast](https://open-meteo.com/en/docs) | 最多 16 天；非商業用途免費、不需 key |
| 歷史同期天氣 | [Open-Meteo Historical](https://github.com/open-meteo/open-meteo/blob/main/README.md) | 可取過去幾年同一週的平均，給 16 天後的日期用 |
| 景點資料 | Google Places API | 座標、營業時間、類別；依用量收費 |
| 交通 | [Google Routes API](https://developers.google.com/maps/documentation/routes/transit-route?hl=ja) TRANSIT 模式 | 車資只在每一段都查得到時才回傳；很久以後的班次不保證準確 |
| 匯率 | 任一免費匯率 API | 每天快取一次即可 |

- **交通的備案**：Routes API 在日本查不到路線或車資時，改成「距離＋簡單費率表」估算，並在頁面標示「估算」。新幹線、機場巴士這類常用路線可以先手動建一份小表。
- **成本**：同一組起訖點的結果要快取，改行程時只重算有變動的 Leg。
- **授權**：Open-Meteo 免費版限非商業用途，個人作品集沒問題；之後若要商業化需改付費方案。

## 技術架構

後端用 FastAPI（Python）寫 agent，前端用 React（TypeScript），全是 CV 上已列的技術，可以把它們寫得更扎實。

| 層 | 選擇 | 理由 |
| --- | --- | --- |
| 前端 | React + TypeScript + Vite，Tailwind | 每日卡片、時間軸、地圖都好做 |
| 後端 | FastAPI + Pydantic | Pydantic 直接當 JSON schema，驗證 LLM 輸出 |
| Agent | Claude API tool use，自己寫 agent loop | 不靠框架，面試時講得出每一步 |
| 資料庫 | SQLite（開發）→ Postgres（上線） | 存行程、API 快取 |
| 部署 | 前端 Vercel；後端 Render 或 Fly.io | 免費額度夠作品集用 |
| 開發工具 | GitHub + Claude Code | commit 歷史就是開發紀錄 |

```text
travel-agent/
├── backend/
│   ├── agent/        # agent loop、prompt、tool 定義
│   ├── tools/        # weather.py, places.py, routes.py, cost.py
│   ├── validators/   # 可行性檢查
│   ├── models.py     # Trip / Day / Stop / Leg
│   └── main.py       # FastAPI routes
├── frontend/
│   └── src/components/  # DayCard, Timeline, CostTable
├── evals/            # 測試行程與評測腳本
└── README.md         # 架構圖、設計決策、demo GIF
```

## 品質與評測

這個專案和一般「ChatGPT 包一層」的差別就在這裡：用程式檢查 LLM 的輸出，並用數字證明品質。

- **不讓 LLM 做的事**：算錢、算交通時間、報營業時間。這些都由工具或程式提供。
- **可行性檢查規則**：抵達時間要在營業時間內；每段交通加停留時間不超過當天可用時數；第一天和最後一天配合航班；住宿要連續，不能漏晚。
- **自動修正**：檢查不過時把錯誤丟回給 agent 重新安排，最多重試 2 次，仍失敗就在頁面上列為警示。
- **評測集**：準備 20–30 個測試行程（不同城市、天數、季節，含青森函館這類跨區、跨年的難例），每次改 prompt 或邏輯就跑一次。
- **要追蹤的數字**：可行行程比例、平均警示數、從輸入到完整頁面的時間、每份行程的 API 成本。
- **成本控制**：每份行程設工具呼叫上限；API 結果快取；發布版加使用次數限制，避免被人刷。

## 里程碑與 CV 成果指標

總共約 6–8 週（以週末和下班時間估算）。第一階段完成就能先放上 GitHub。

&#91;embedded content: 里程碑 · 3 個階段，各有完成標準\]

上線後要拿來寫進 CV 的數字：

- 可行行程比例：加入檢查與重排前後的差異（例如 X% → Y%）
- 規劃時間：手動規劃一趟旅程的時間 vs. 用 agent 的時間
- 每份行程的 API 成本
- 試用人數與回饋

## 待決定事項

- [ ] 實測 Google Routes API 在青森、函館的 TRANSIT 結果和車資是否可用，決定要不要先做估算備案
- [ ] 第一版範圍：已決定只支援日本
- [ ] 介面語言：繁中、英文，或兩者
- [ ] 餐費估算方式：每日固定金額，或依城市與預算等級
- [ ] 是否需要登入（影響第三階段的工作量）
