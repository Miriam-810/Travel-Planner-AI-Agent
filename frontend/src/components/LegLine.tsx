import { useState } from 'react'
import type { Leg } from '../types'
import { Icon } from './Icon'

const STEP_TEXT: Record<Leg['steps'][number]['mode'], string> = {
  walk: '步行',
  train: '電車',
  shinkansen: '新幹線',
  subway: '地鐵',
  tram: '路面電車',
  bus: '公車',
  ferry: '渡輪',
  other: '交通',
}

/**
 * The way between two places, drawn as a slim connector between list items:
 * "路面電車 函館市電（往 湯の川），共 31 分", with the rides listed on tap.
 */
export function LegLine({ leg, to }: { leg: Leg; to?: string }) {
  const [open, setOpen] = useState(false)
  const icon = leg.mode === 'walk' ? 'walk' : leg.mode === 'transit' ? 'train' : 'map'
  const canOpen = leg.mode === 'transit' && leg.steps.length > 0
  return (
    <li className="relative ml-[22px] border-l-2 border-dashed border-sage/40 py-1 pl-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-soft">
        <span className="text-sage-deep">
          <Icon name={icon} size={15} />
        </span>
        {canOpen ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="border-0 bg-transparent p-0 text-left text-[13px] text-ink-soft hover:text-ink"
          >
            {to ? `${to}：` : ''}
            {leg.summary}
            <span className="ml-1 text-sage-deep">{open ? '收起' : '看轉乘'}</span>
          </button>
        ) : (
          <span>
            {to ? `${to}：` : ''}
            {leg.summary}
          </span>
        )}
        {leg.mode !== 'walk' && (
          <a href={leg.maps_url} target="_blank" rel="noreferrer" className="text-[12px] text-sage-deep underline-offset-2 hover:underline">
            Google 地圖 ↗
          </a>
        )}
      </div>
      {open && (
        <ol className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 text-[12.5px] text-ink">
          {leg.steps.map((s, i) => (
            <li key={i} className="tabular-nums">
              <span className="text-ink-soft">{STEP_TEXT[s.mode]}</span> {s.line}：{s.from_name} → {s.to_name}・{s.minutes} 分
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}
