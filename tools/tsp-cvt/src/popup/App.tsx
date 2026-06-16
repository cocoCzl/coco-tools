import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import weekday from 'dayjs/plugin/weekday'

dayjs.extend(customParseFormat)
dayjs.extend(weekday)
dayjs.locale('zh-cn')

const DATE_FORMAT = 'YYYY-MM-DD'
const TIME_FORMAT = 'HH:mm:ss'
const DATE_TIME_FORMAT = `${DATE_FORMAT} ${TIME_FORMAT}`
const TIMESTAMP_PATTERN = /^(?:\d{10}|\d{13})$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/

type TimestampConversion = {
  value: string
  canCopy: boolean
}

const formatTimeZoneOffset = () => {
  const offsetMinutes = -new Date().getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const hours = Math.floor(absOffset / 60).toString().padStart(2, '0')
  const minutes = (absOffset % 60).toString().padStart(2, '0')

  return `UTC${sign}${hours}:${minutes}`
}

const normalizeTime = (time: string) => (time.length === 5 ? `${time}:00` : time)

const convertTimestampToDate = (rawInput: string): TimestampConversion => {
  const input = rawInput.trim()

  if (!input) {
    return { value: '', canCopy: false }
  }

  if (!TIMESTAMP_PATTERN.test(input)) {
    return { value: '请输入10位或13位数字时间戳', canCopy: false }
  }

  const numericTimestamp = Number(input)
  const timestamp = input.length === 10 ? numericTimestamp * 1000 : numericTimestamp
  const date = dayjs(timestamp)

  if (!date.isValid()) {
    return { value: '无效时间戳', canCopy: false }
  }

  return { value: date.format(DATE_TIME_FORMAT), canCopy: true }
}

const convertDateTimeToTimestamps = (date: string, time: string) => {
  const normalizedTime = normalizeTime(time)

  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(normalizedTime)) {
    return { timestamp10: '', timestamp13: '' }
  }

  const dateTime = dayjs(`${date} ${normalizedTime}`, DATE_TIME_FORMAT, true)

  if (!dateTime.isValid()) {
    return { timestamp10: '', timestamp13: '' }
  }

  const milliseconds = dateTime.valueOf()

  return {
    timestamp10: Math.floor(milliseconds / 1000).toString(),
    timestamp13: milliseconds.toString(),
  }
}

const CopyIcon = ({ copied }: { copied: boolean }) => (
  <svg 
    className={`w-4 h-4 transition-all duration-200 ${copied ? 'text-green-400' : 'text-gray-400 hover:text-white'}`} 
    fill="none" 
    stroke="currentColor" 
    viewBox="0 0 24 24"
  >
    {copied ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    )}
  </svg>
)

const CopyButton = ({ text, disabled = false }: { text: string; disabled?: boolean }) => {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current)
      }
    }
  }, [])

  const handleCopy = useCallback(async () => {
    if (!text || disabled) {
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)

      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current)
      }

      resetTimer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [disabled, text])

  return (
    <button 
      type="button"
      onClick={handleCopy}
      disabled={!text || disabled}
      aria-label={copied ? '已复制' : '复制'}
      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/5"
      title="复制"
    >
      <CopyIcon copied={copied} />
    </button>
  )
}

const CurrentTimestampHeader = () => {
  const [currentTimestamp, setCurrentTimestamp] = useState(Date.now())
  const timeZoneOffset = useMemo(formatTimeZoneOffset, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimestamp(Date.now())
    }, 250)

    return () => clearInterval(interval)
  }, [])

  return (
    <header className="relative p-4 bg-black/30 backdrop-blur-sm border-b border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-purple-300/80 mb-1">当前时间戳</p>
          <p className="font-mono text-lg font-semibold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            {currentTimestamp}
          </p>
        </div>
        <CopyButton text={currentTimestamp.toString()} />
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {dayjs(currentTimestamp).format('YYYY-MM-DD dddd HH:mm:ss.SSS')} · {timeZoneOffset}
      </p>
    </header>
  )
}

function App() {
  const [timestampInput, setTimestampInput] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => dayjs().format(DATE_FORMAT))
  const [selectedTime, setSelectedTime] = useState(() => dayjs().format(TIME_FORMAT))
  const convertedDate = useMemo(() => convertTimestampToDate(timestampInput), [timestampInput])
  const { timestamp10, timestamp13 } = useMemo(
    () => convertDateTimeToTimestamps(selectedDate, selectedTime),
    [selectedDate, selectedTime]
  )

  return (
    <div className="relative isolate w-80 min-h-[480px] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-transparent pointer-events-none" />

      <CurrentTimestampHeader />

      <main className="relative p-4 space-y-5">
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-purple-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            时间戳 → 日期
          </h2>
          
          <div className="space-y-2">
            <input
              type="text"
              value={timestampInput}
              onChange={(e) => setTimestampInput(e.target.value)}
              inputMode="numeric"
              placeholder="输入10位或13位时间戳..."
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-mono placeholder-gray-500 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all duration-200"
            />
            
            {convertedDate.value && (
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/20">
                <span className="font-mono text-sm">{convertedDate.value}</span>
                <CopyButton text={convertedDate.value} disabled={!convertedDate.canCopy} />
              </div>
            )}
          </div>
        </section>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
          <span className="text-xs text-gray-500">转换</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
        </div>

        {/* Section B: Date to Timestamp */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-purple-300 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
            日期 → 时间戳
          </h2>
          
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all duration-200 [color-scheme:dark]"
            />
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              step="1"
              className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all duration-200 [color-scheme:dark]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-xl border border-blue-500/20">
              <div>
                <span className="text-xs text-blue-300/80">10位 (秒)</span>
                <p className="font-mono text-sm">{timestamp10}</p>
              </div>
              <CopyButton text={timestamp10} />
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-xl border border-emerald-500/20">
              <div>
                <span className="text-xs text-emerald-300/80">13位 (毫秒)</span>
                <p className="font-mono text-sm">{timestamp13}</p>
              </div>
              <CopyButton text={timestamp13} />
            </div>
          </div>
        </section>

        <footer className="pt-2 text-center">
          <p className="text-xs text-gray-500">
            TSP CVT · Coco Tools
          </p>
        </footer>
      </main>
    </div>
  )
}

export default App
