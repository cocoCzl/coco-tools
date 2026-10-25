import {
  currentTimeDescription,
  localDateInput,
  localDateTimeToTimestamps,
  localTimeInput,
  timestampToLocal,
  utcOffset,
  type TimestampUnit,
  type TimeZone,
} from '../core/timestamp'

type TimestampSession = {
  input: string
  unit: TimestampUnit
  zone: TimeZone
  date: string
  time: string
}
export function createTimestampSession(): TimestampSession {
  const now = new Date()
  return {
    input: '',
    unit: 'auto',
    zone: 'local',
    date: localDateInput(now),
    time: localTimeInput(now),
  }
}
export function timestampView(): string {
  return `<section class="timestamp">
    <div class="now-card"><span>当前 Unix 时间</span><output id="current-time"></output><p id="current-readable"></p><button class="quiet-button" data-copy="current-time">复制毫秒时间戳</button></div>
    <div class="timestamp-options"><label>时区<select id="time-zone"><option value="local">浏览器本地时间</option><option value="utc">UTC</option></select></label><p id="zone-description"></p></div>
    <div class="conversion-grid">
      <article><div class="section-label">01 / 时间戳 → 日期</div>
        <label>时间戳<input id="timestamp-input" inputmode="decimal" placeholder="例如 1717228800000、0、-1" /></label>
        <label>输入单位<select id="timestamp-unit"><option value="auto">自动（10 位秒 / 13 位毫秒）</option><option value="seconds">秒（可含三位小数）</option><option value="milliseconds">毫秒</option></select></label>
        <output class="result" id="date-result" aria-live="polite">等待输入</output><button class="quiet-button" data-copy="date-result">复制结果</button>
      </article>
      <article><div class="section-label">02 / 日期 → 时间戳</div>
        <div class="date-row"><label>日期<input id="date-input" type="date" /></label><label>时间（含毫秒）<input id="time-input" type="time" step="0.001" /></label></div>
        <p id="date-error" role="status"></p>
        <div class="dual-results"><div class="stamp-card"><output><small>秒（向下取整）</small><strong id="seconds-result">—</strong></output><button class="quiet-button" data-copy="seconds-result">复制秒</button></div><div class="stamp-card"><output><small>毫秒</small><strong id="milliseconds-result">—</strong></output><button class="quiet-button" data-copy="milliseconds-result">复制毫秒</button></div></div>
      </article>
    </div><p id="timestamp-message" class="message" role="status"></p>
    <footer>日期输入使用所选时区；本地夏令时重复时段采用较早时刻，跳过时段会报错。</footer>
  </section>`
}
export function bindTimestampTool(
  app: HTMLElement,
  state: TimestampSession,
): { dispose: () => void; syncClock: () => void } {
  let clock: number | undefined
  let disposed = false
  const date = app.querySelector<HTMLInputElement>('#date-input')!
  const time = app.querySelector<HTMLInputElement>('#time-input')!
  const input = app.querySelector<HTMLInputElement>('#timestamp-input')!
  const unit = app.querySelector<HTMLSelectElement>('#timestamp-unit')!
  const zone = app.querySelector<HTMLSelectElement>('#time-zone')!
  date.value = state.date
  time.value = state.time
  input.value = state.input
  unit.value = state.unit
  zone.value = state.zone
  let timestampValid = false
  const updateTimestamp = () => {
    state.input = input.value
    state.unit = unit.value as TimestampUnit
    timestampValid = false
    const result = app.querySelector('#date-result')!
    if (!state.input.trim()) {
      result.textContent = '等待输入'
      return
    }
    try {
      result.textContent = timestampToLocal(state.input, state.unit, state.zone)
      timestampValid = true
    } catch (error) {
      result.textContent = error instanceof Error ? error.message : '无效时间戳'
    }
  }
  const updateDate = () => {
    state.date = date.value
    state.time = time.value
    try {
      const result = localDateTimeToTimestamps(state.date, state.time, state.zone)
      app.querySelector('#seconds-result')!.textContent = result.seconds
      app.querySelector('#milliseconds-result')!.textContent = result.milliseconds
      app.querySelector('#date-error')!.textContent = ''
    } catch (error) {
      app.querySelector('#seconds-result')!.textContent = '—'
      app.querySelector('#milliseconds-result')!.textContent = '—'
      app.querySelector('#date-error')!.textContent =
        error instanceof Error ? error.message : '无效日期'
    }
  }
  const updateNow = () => {
    const now = new Date()
    app.querySelector('#current-time')!.textContent = String(now.getTime())
    app.querySelector('#current-readable')!.textContent =
      state.zone === 'utc' ? now.toISOString() : currentTimeDescription(now)
  }
  const updateZone = () => {
    state.zone = zone.value as TimeZone
    app.querySelector('#zone-description')!.textContent =
      state.zone === 'utc'
        ? '日期输入和日期结果均使用 UTC。'
        : `日期输入和日期结果均使用浏览器本地时区（当前 ${utcOffset()}，转换时按对应日期计算偏移）。`
    updateDate()
    updateTimestamp()
    updateNow()
  }
  const stopClock = () => {
    window.clearInterval(clock)
    clock = undefined
  }
  const syncClock = () => {
    if (disposed || document.hidden) {
      stopClock()
      return
    }
    updateNow()
    if (clock === undefined) clock = window.setInterval(updateNow, 1000)
  }
  date.addEventListener('input', updateDate)
  time.addEventListener('input', updateDate)
  input.addEventListener('input', updateTimestamp)
  unit.addEventListener('change', updateTimestamp)
  zone.addEventListener('change', updateZone)
  app.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) =>
    button.addEventListener('click', async () => {
      const targetId = button.dataset.copy!
      const content = app.querySelector(`#${targetId}`)?.textContent?.trim()
      if (!content || content === '—' || (targetId === 'date-result' && !timestampValid)) return
      try {
        await navigator.clipboard.writeText(content)
        if (disposed) return
        app.querySelector('#timestamp-message')!.textContent = '已复制结果。'
      } catch {
        if (!disposed)
          app.querySelector('#timestamp-message')!.textContent =
            '复制失败，请检查剪贴板权限或手动复制。'
      }
    }),
  )
  updateZone()
  syncClock()
  return {
    syncClock,
    dispose: () => {
      disposed = true
      stopClock()
    },
  }
}
