type Props = {
  courtLabel: string
  teamA: string[]
  teamB: string[]
  size?: 'sm' | 'md' | 'lg'
  labelColor?: string
}

export function CourtDisplay({ courtLabel, teamA, teamB, size = 'sm', labelColor }: Props) {
  const isLg = size === 'lg'
  const isMd = size === 'md'

  const chipA = isLg
    ? 'bg-gray-900 shadow-sm rounded-xl px-4 py-3 text-xl font-bold text-white text-center w-full truncate'
    : isMd
    ? 'bg-gray-900 shadow-sm rounded-xl px-3 py-2 text-sm font-bold text-white text-center w-full truncate'
    : 'bg-gray-900 shadow-sm rounded-lg px-2 py-1.5 text-xs font-semibold text-white text-center truncate w-full'

  const chipB = isLg
    ? 'bg-white/95 shadow-sm rounded-xl px-4 py-3 text-xl font-bold text-gray-800 text-center w-full truncate'
    : isMd
    ? 'bg-white/95 shadow-sm rounded-xl px-3 py-2 text-sm font-bold text-gray-800 text-center w-full truncate'
    : 'bg-white/95 shadow-sm rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-800 text-center truncate w-full'

  const cellPad = isLg ? 'px-5 pt-5 pb-2.5' : isMd ? 'px-3 pt-4 pb-2' : 'px-3 pt-3 pb-1'
  const cellPadB = isLg ? 'px-5 pb-5 pt-2.5' : isMd ? 'px-3 pb-4 pt-2' : 'px-3 pb-3 pt-1'
  const minH = isLg ? 220 : isMd ? 130 : 148

  return (
    <div className="h-full flex flex-col" style={{ minHeight: minH + 28 }}>
      <p
        className="text-center font-bold uppercase tracking-widest mb-3"
        style={{ fontSize: isLg ? 16 : isMd ? 13 : 11, color: labelColor ?? 'rgba(100,116,139,1)' }}
      >
        {courtLabel}
      </p>

      <div className="rounded-2xl overflow-hidden flex-1" style={{ background: 'linear-gradient(180deg, #3a9e6e 0%, #2d8a5c 100%)', minHeight: minH }}>
        <div className="relative h-full">
          {/* Court lines */}
          <div className="absolute top-3 left-0 right-0 h-[1.5px] bg-white/60" />
          <div className="absolute bottom-3 left-0 right-0 h-[1.5px] bg-white/60" />
          <div className="absolute top-3 bottom-3 left-1/2 w-[2px] -translate-x-1/2 bg-white/70" />
          <div className="absolute top-3 bottom-3 w-px bg-white/50" style={{ left: '15%' }} />
          <div className="absolute top-3 bottom-3 w-px bg-white/50" style={{ right: '15%' }} />
          <div className="absolute h-px bg-white/45" style={{ top: '50%', left: '15%', right: '15%' }} />

          {/* VS badge */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <span
              className="flex items-center justify-center rounded-full bg-white/90 font-black text-green-700 select-none"
              style={{ fontSize: isLg ? 13 : isMd ? 11 : 9, width: isLg ? 36 : isMd ? 28 : 22, height: isLg ? 36 : isMd ? 28 : 22 }}
            >
              VS
            </span>
          </div>

          {/* Players */}
          <div className="relative grid grid-cols-2 z-10 h-full" style={{ minHeight: minH }}>
            <div className="flex flex-col h-full">
              <div className={`flex-1 flex items-center justify-center ${cellPad}`}>
                <div className={chipA}>{teamA[0]}</div>
              </div>
              <div className={`flex-1 flex items-center justify-center ${cellPadB}`}>
                <div className={chipA}>{teamA[1]}</div>
              </div>
            </div>
            <div className="flex flex-col h-full">
              <div className={`flex-1 flex items-center justify-center ${cellPad}`}>
                <div className={chipB}>{teamB[0]}</div>
              </div>
              <div className={`flex-1 flex items-center justify-center ${cellPadB}`}>
                <div className={chipB}>{teamB[1]}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
