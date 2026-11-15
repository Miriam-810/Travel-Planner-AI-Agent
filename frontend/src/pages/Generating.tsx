import { useEffect, useState } from 'react'
import { Card, StepDashes, TextButton } from '../components/Form'
import { IslandMark } from '../components/IslandMark'

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
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col items-center justify-center px-4">
      <Card className="w-full p-7 text-center">
        <div className="mx-auto w-fit motion-safe:animate-[bob_3s_ease-in-out_infinite]">
          <IslandMark size={84} />
        </div>
        <h1 className="m-0 mt-3 text-[22px]">正在規劃 {destination}</h1>
        <p className="m-0 mt-3 min-h-[1.6em] text-[16px] text-sage-deep" aria-live="polite">
          {STEPS[step]}…
        </p>
        <div className="mt-4 flex justify-center">
          <StepDashes current={step} total={STEPS.length} />
        </div>
        <p className="m-0 mt-4 text-[13px] text-ink-soft tabular-nums">已經過 {elapsed}・通常 1–3 分鐘，請不要關閉這個頁面</p>
        <div className="mt-4">
          <TextButton onClick={onCancel}>取消</TextButton>
        </div>
      </Card>
    </div>
  )
}
