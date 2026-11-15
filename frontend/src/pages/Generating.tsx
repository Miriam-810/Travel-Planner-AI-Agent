import { useEffect, useState } from 'react'
import { GhostButton } from '../components/Form'

// The backend doesn't stream progress yet, so these just describe what the
// agent is doing in roughly the order it does it.
const STEPS = ['查詢每天的天氣', '搜尋景點和餐廳', '確認營業時間', '安排每天的順序', '最後檢查時間有沒有衝突']
const STEP_SECONDS = 12

export function Generating({ destination, onCancel }: { destination: string; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const step = Math.min(Math.floor(seconds / STEP_SECONDS), STEPS.length - 1)
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-[520px] flex-col items-center justify-center px-6 text-center">
      <div aria-hidden className="relative mb-6 size-16">
        <span className="absolute inset-0 rounded-full border-4 border-coral-soft" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-coral" />
      </div>
      <div className="font-mono text-[11px] font-bold tracking-[.14em] text-coral uppercase">Planning</div>
      <h1 className="m-0 mt-1 text-[22px] font-black">正在規劃 {destination}</h1>
      <p className="m-0 mt-3 min-h-[1.6em] text-[15px] font-bold" aria-live="polite">
        {STEPS[step]}…
      </p>
      <p className="m-0 mt-1 font-mono text-[12px] text-ink-soft tabular-nums">已經過 {elapsed}・通常 1–3 分鐘</p>
      <p className="m-0 mt-6 text-[13px] text-ink-soft">請不要關閉這個頁面。</p>
      <div className="mt-4">
        <GhostButton onClick={onCancel}>取消</GhostButton>
      </div>
    </div>
  )
}
