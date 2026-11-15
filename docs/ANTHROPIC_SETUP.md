# Anthropic API 設定教學（步驟 7）

排行程的 AI 是 Claude，透過 Anthropic API 呼叫。你需要一把 API key，加上幾個邀請碼，都放進 `backend/.env`：

| 名稱 | 是什麼 |
| --- | --- |
| `ANTHROPIC_API_KEY` | 只放在伺服器上，瀏覽器看不到 |
| `INVITE_CODES` | 可以產生行程的邀請碼，逗號分隔，自己取，例如 `aomori-2026,friend-a` |

## 費用

Anthropic API 是**預付制**：先買額度（最少 US$5），用完就停，不會自動扣款，除非你自己開啟自動儲值。

| 模型 | 用途 | 每百萬 token（輸入／輸出） |
| --- | --- | --- |
| `claude-haiku-5-5` | 開發、測試（預設） | US$0.10／0.50（單次超過 10 萬 token 時 5 倍） |
| `claude-opus-5-5` | 正式展示、評估品質 | US$4／20 |

一份行程實際花多少，跑一次 `scripts.check_outline` 最後會印出來。README 的費用說明會用實測數字。

---

## 1. 註冊 Claude Platform

1. 打開 <https://platform.claude.com/>（以前叫 Anthropic Console），用 email 或 Google 帳號註冊。
2. 照畫面建立組織（個人用就填自己的名字）。

> 這是開發者用的 API 平台，和你平常用的 Claude 聊天訂閱（Pro／Max）是**分開計費**的。

## 2. 買額度

1. 左側選單 → **Billing（帳單）** → **Buy credits**。
2. 買 US$5 就夠開發用很久。付款資料請自己填。
3. **Auto-reload（自動儲值）保持關閉**，這樣最多就是花掉買的額度。

## 3. 設每月花費上限

1. **Settings** → **Limits**。
2. 把每月花費上限（Spend limit）設成例如 US$10。超過後 API 會回錯誤，不會繼續扣款。

## 4. 建立 API key

1. **API Keys** → **Create Key**。
2. 填寫欄位，按 **Create key**：
   - **Name**：例如 `travel-planner-dev`。
   - **Expires**：開發用選 90 天（沒有就用預設的 30 天）。過期後 API 會回 `401`，到時候建一把新的換掉 `.env` 裡的值就好。部署用的 key 之後另外建。
   - **Linked account**、**Scope**：保持預設（你自己、Default workspace）。
3. 複製金鑰（以 `sk-ant-` 開頭）。
   - 金鑰**只會顯示這一次**，關掉視窗就看不到了，沒複製到就刪掉重建。

## 5. 放進專案

打開 `backend/.env`（`cd backend` 後執行 `open -e .env`），填這兩行：

```text
ANTHROPIC_API_KEY=你在第 4 步複製的金鑰
INVITE_CODES=你自己取的邀請碼
```

存檔後**重新啟動後端**。

## 6. 測試

```bash
cd backend
uv run python -m scripts.check_outline
```

會用 Claude 排一份 5 天的青森行程（12/7–12/11），印出每天的行程、檢查結果、token 用量和估計費用。跑一次大約 1–3 分鐘，會用掉 20–45 次 Places 搜尋（在每月免費額度內）和幾美分的 Claude 費用。

## 常見問題

| 訊息 | 原因 |
| --- | --- |
| `Set ANTHROPIC_API_KEY and GOOGLE_PLACES_API_KEY` | `.env` 沒填或沒存檔，或不在 `backend/` 裡執行 |
| `AuthenticationError` / `401` | key 複製不完整，或已經被刪除 |
| `credit balance is too low` | 額度用完了，回第 2 步儲值 |
| `429` / `rate_limit_error` | 新帳號的速率限制比較低，等一分鐘再試 |
