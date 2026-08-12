import './style.css'
import './interaction.css'
import './daylight.css'
import { INPUT_LIMIT_BYTES, utf8Bytes } from '../core/limits'
import type { OperationId, OperationOptions, OperationResponse } from '../core/protocol'
import type { Result } from '../core/operations'
import { currentTimeDescription, localDateInput, localDateTimeToTimestamps, localTimeInput, timestampToLocal, utcOffset } from '../core/timestamp'

type ModuleId = 'json-format' | 'json-escape' | 'url' | 'java' | 'yaml' | 'timestamp'
type TextModuleId = Exclude<ModuleId, 'timestamp'>
type Theme = 'system' | 'dark' | 'light'
type Indent = '2' | '4' | 'tab'
type Preferences = { theme: Theme; compact: boolean; indent: Indent; java: { rootClassName: string; packageName: string; jackson: boolean; lombok: boolean } }
type Status = 'idle' | 'running' | 'success' | 'error' | 'cancelled'

const modules: Array<{ id: ModuleId; icon: string; label: string; hint: string }> = [
  { id: 'json-format', icon: '{ }', label: 'JSON 格式化', hint: '校验、格式化与压缩' },
  { id: 'json-escape', icon: '\\n', label: 'JSON 转义', hint: '字符串转义与反转义' },
  { id: 'url', icon: '↔', label: 'URL 参数', hint: '查询参数与 JSON' },
  { id: 'java', icon: 'J', label: 'Java 数据类', hint: 'JSON 生成 Java POJO' },
  { id: 'yaml', icon: 'Y', label: 'JSON / YAML', hint: '配置格式互转' },
  { id: 'timestamp', icon: '◷', label: '时间戳', hint: '本地日期与 Unix 时间' },
]
const themeLabels: Record<Theme, string> = { system: '跟随系统', dark: '深空', light: '极昼' }
const indentLabels: Record<Indent, string> = { '2': '2 空格', '4': '4 空格', tab: 'Tab' }
const operationsByModule: Record<TextModuleId, Array<{ id: OperationId; label: string }>> = {
  'json-format': [{ id: 'format', label: '格式化' }, { id: 'minify', label: '压缩' }],
  'json-escape': [{ id: 'escape', label: '转义' }, { id: 'unescape', label: '反转义' }],
  url: [{ id: 'query', label: 'URL → JSON' }, { id: 'url', label: 'JSON → URL' }],
  java: [{ id: 'java', label: '生成 Java' }],
  yaml: [{ id: 'json-yaml', label: 'JSON → YAML' }, { id: 'yaml-json', label: 'YAML → JSON' }, { id: 'yaml-format', label: 'YAML 格式化' }],
}
const defaults: Preferences = { theme: 'system', compact: false, indent: '2', java: { rootClassName: '', packageName: '', jackson: true, lombok: false } }
function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem('converter-toolbox-preferences') ?? 'null') as Partial<Preferences> | null
    if (!value || !['system', 'dark', 'light'].includes(value.theme ?? '') || !['2', '4', 'tab'].includes(value.indent ?? '')) return structuredClone(defaults)
    const java = value.java ?? defaults.java
    return { theme: value.theme!, compact: value.compact === true, indent: value.indent!, java: { rootClassName: typeof java.rootClassName === 'string' ? java.rootClassName : '', packageName: typeof java.packageName === 'string' ? java.packageName : '', jackson: java.jackson !== false, lombok: java.lombok === true } }
  } catch { return structuredClone(defaults) }
}
let preferences: Preferences = loadPreferences()
let active: ModuleId = 'json-format'
const selectedOperationByModule: Partial<Record<TextModuleId, string>> = {}
let openMenu: 'theme' | 'indent' | null = null
let clock: number | undefined
let currentWorker: Worker | undefined
let cancelCurrent: (() => void) | undefined
let requestId = 0
const app = document.querySelector<HTMLElement>('#app')!

function persist() { localStorage.setItem('converter-toolbox-preferences', JSON.stringify(preferences)) }
function dropdown(name: 'theme' | 'indent', value: string, options: Array<[string, string]>) {
  const opened = openMenu === name
  return `<div class="dropdown"><button class="dropdown-trigger" data-dropdown-toggle="${name}" aria-haspopup="listbox" aria-expanded="${opened}"><span>${value}</span><i>⌄</i></button><div class="dropdown-menu ${opened ? 'is-open' : ''}" data-dropdown-menu="${name}" role="listbox">${options.map(([key, label]) => `<button role="option" aria-selected="${key === (name === 'theme' ? preferences.theme : preferences.indent)}" data-dropdown-option="${name}" data-value="${key}">${key === (name === 'theme' ? preferences.theme : preferences.indent) ? '<b>✓</b>' : '<b></b>'}<span>${label}</span></button>`).join('')}</div></div>`
}
function render() {
  if (active !== 'timestamp' && clock) { window.clearInterval(clock); clock = undefined }
  document.documentElement.dataset.theme = preferences.theme
  app.className = preferences.compact ? 'app is-compact' : 'app'
  const current = modules.find((item) => item.id === active)!
  app.innerHTML = `<aside class="sidebar"><div class="brand"><img class="brand-mark" src="./icons/icon48.png" alt=""/><div class="brand-copy"><strong>转换工具箱</strong><span>COCO / LOCAL STATION</span></div><button class="collapse" data-action="toggle" aria-label="折叠导航">‹</button></div><div class="nav-label">CONVERSION MODULES</div><nav>${modules.map((item, index) => `<button class="nav-item ${item.id === active ? 'is-active' : ''}" data-module="${item.id}" title="${item.label}"><b>${item.icon}</b><span><strong>${item.label}</strong><small>${item.hint}</small></span><i>${String(index + 1).padStart(2, '0')}</i></button>`).join('')}</nav><div class="sidebar-foot"><span class="live-dot"></span><span>本地处理 · 无上传</span></div></aside><section class="surface"><header class="topbar"><div class="title-block"><p class="eyebrow">COCO TOOLS <em>／</em> CONVERTER</p><h1>${current.label}</h1><p class="module-hint">${current.hint} · 极速本地执行</p></div><div class="top-actions"><span class="privacy-pill"><b></b> 本地离线</span><div class="theme"><span>外观</span>${dropdown('theme', themeLabels[preferences.theme], Object.entries(themeLabels))}</div></div></header><div class="workspace">${active === 'timestamp' ? timestampView() : textView()}</div></section>`
  bindShell()
  if (active === 'timestamp') startClock()
  else startTextTool()
}
function bindShell() {
  app.querySelectorAll<HTMLButtonElement>('[data-module]').forEach((button) => button.addEventListener('click', () => { active = button.dataset.module as ModuleId; openMenu = null; cancelCurrent?.(); render() }))
  app.querySelector<HTMLButtonElement>('[data-action="toggle"]')!.addEventListener('click', () => { preferences.compact = !preferences.compact; persist(); render() })
  app.querySelectorAll<HTMLButtonElement>('[data-dropdown-toggle]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const name = button.dataset.dropdownToggle as 'theme' | 'indent'; setMenu(name, openMenu !== name) }))
  app.querySelectorAll<HTMLButtonElement>('[data-dropdown-option]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const name = button.dataset.dropdownOption as 'theme' | 'indent'; if (name === 'theme') preferences.theme = button.dataset.value as Theme; else preferences.indent = button.dataset.value as Indent; persist(); document.documentElement.dataset.theme = preferences.theme; refreshMenu(name); setMenu(name, false) }))
}
function setMenu(name: 'theme' | 'indent', shouldOpen: boolean) { if (openMenu && openMenu !== name) setMenu(openMenu, false); openMenu = shouldOpen ? name : null; app.querySelector<HTMLElement>(`[data-dropdown-menu="${name}"]`)?.classList.toggle('is-open', shouldOpen); app.querySelector<HTMLButtonElement>(`[data-dropdown-toggle="${name}"]`)?.setAttribute('aria-expanded', String(shouldOpen)) }
function refreshMenu(name: 'theme' | 'indent') { const value = name === 'theme' ? preferences.theme : preferences.indent; const label = name === 'theme' ? themeLabels[preferences.theme] : indentLabels[preferences.indent]; const trigger = app.querySelector<HTMLButtonElement>(`[data-dropdown-toggle="${name}"]`); if (trigger) trigger.querySelector('span')!.textContent = label; app.querySelectorAll<HTMLButtonElement>(`[data-dropdown-option="${name}"]`).forEach((option) => { const selected = option.dataset.value === value; option.setAttribute('aria-selected', String(selected)); option.querySelector('b')!.textContent = selected ? '✓' : '' }) }
document.addEventListener('click', (event) => { if (openMenu && !(event.target as HTMLElement).closest('.dropdown')) setMenu(openMenu, false) })
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && openMenu) setMenu(openMenu, false) })
function textView() {
  const moduleId = active as TextModuleId
  const selected = selectedOperationByModule[moduleId] ?? operationsByModule[moduleId][0].id
  const actionButtons = operationsByModule[moduleId].map(({ id, label }) => `<button data-run="${id}" class="${id === selected ? 'is-selected' : ''}" aria-pressed="${id === selected}">${label}</button>`).join('')
  const actions = active === 'json-format' ? `${actionButtons}${dropdown('indent', indentLabels[preferences.indent], Object.entries(indentLabels))}` : active === 'json-escape' ? `${actionButtons}<label class="check"><input id="ascii" type="checkbox" />转义非 ASCII</label>` : active === 'java' ? `${actionButtons}<input id="class-name" value="${preferences.java.rootClassName}" placeholder="根类名（Root）" /><input id="package-name" value="${preferences.java.packageName}" placeholder="包名（可选）" /><label class="check"><input id="jackson" type="checkbox" ${preferences.java.jackson ? 'checked' : ''} />Jackson</label><label class="check"><input id="lombok" type="checkbox" ${preferences.java.lombok ? 'checked' : ''} />Lombok</label>` : actionButtons
  const accept = active === 'yaml' ? '.yaml,.yml,.txt' : '.json,.txt'
  return `<section class="text-tool"><div class="control-deck"><div class="primary-actions">${actions}</div><div class="utility-actions"><button class="quiet-button" data-action="import">↥ 导入</button><input id="file-input" type="file" accept="${accept}" hidden /><button class="quiet-button" data-action="clear">清空</button><button class="quiet-button" data-action="copy-output">复制</button><button class="quiet-button" data-action="download">下载</button><button class="quiet-button danger" data-action="cancel" hidden>取消任务</button></div></div><p id="message" class="message" data-status="idle"><span class="message-dot"></span><span>就绪 · 所有内容只在本地处理</span></p><div class="editors"><label class="editor-card"><span class="editor-heading"><b>INPUT</b><small>⌘ / Ctrl + Enter 执行 · ⇧C 复制</small></span><textarea id="input" spellcheck="false" placeholder="粘贴或导入要处理的内容…"></textarea></label><label class="editor-card"><span class="editor-heading"><b>OUTPUT</b><small>结果区域</small></span><textarea id="output" readonly spellcheck="false" placeholder="处理结果会显示在这里"></textarea></label></div></section>`
}
function setStatus(element: HTMLElement, status: Status, message: string) { element.dataset.status = status; const text = element.querySelector('span:last-child'); if (text) text.textContent = message }
function startTextTool() {
  const input = app.querySelector<HTMLTextAreaElement>('#input')!; const output = app.querySelector<HTMLTextAreaElement>('#output')!; const message = app.querySelector<HTMLElement>('#message')!; const cancel = app.querySelector<HTMLButtonElement>('[data-action="cancel"]')!
  let resultFileName: string | undefined
  let running = false
  const execute = async (command: OperationId) => {
    if (!input.value.trim()) { output.value = ''; setStatus(message, 'error', '请输入要处理的内容。'); input.focus(); return }
    if (running) return
    if (utf8Bytes(input.value) > INPUT_LIMIT_BYTES) { output.value = ''; setStatus(message, 'error', '输入不能超过 20 MiB。'); return }
    running = true
    try { const buttons = app.querySelectorAll<HTMLButtonElement>('[data-run]'); buttons.forEach((button) => button.disabled = true); setStatus(message, 'running', '正在转换，请稍候…'); const options: OperationOptions = { indent: preferences.indent, escapeNonAscii: app.querySelector<HTMLInputElement>('#ascii')?.checked, rootClassName: app.querySelector<HTMLInputElement>('#class-name')?.value, packageName: app.querySelector<HTMLInputElement>('#package-name')?.value, jackson: app.querySelector<HTMLInputElement>('#jackson')?.checked, lombok: app.querySelector<HTMLInputElement>('#lombok')?.checked }; const result = await workerOperation(command, input.value, options, cancel); resultFileName = result.fileName; output.value = result.output; setStatus(message, 'success', result.warnings?.join(' ') || '转换完成。') } catch (error) { resultFileName = undefined; output.value = ''; const detail = error instanceof Error ? error.message : '发生未知错误。'; setStatus(message, detail === '任务已取消。' ? 'cancelled' : 'error', detail) } finally { running = false; app.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => button.disabled = false) }
  }
  const selectOperation = (operation: OperationId) => {
    selectedOperationByModule[active as TextModuleId] = operation
    app.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => {
      const selected = button.dataset.run === operation
      button.classList.toggle('is-selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
  }
  app.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => button.addEventListener('click', () => { const operation = button.dataset.run as OperationId; selectOperation(operation); void execute(operation) }))
  app.querySelector('[data-action="clear"]')!.addEventListener('click', () => { input.value = ''; output.value = ''; setStatus(message, 'idle', '已清空，等待新的输入。'); input.focus() })
  const copyOutput = async () => { if (!output.value) { setStatus(message, 'error', '没有可复制的结果。'); return } await navigator.clipboard.writeText(output.value); setStatus(message, 'success', '已复制结果。') }
  app.querySelector('[data-action="copy-output"]')!.addEventListener('click', () => void copyOutput())
  app.querySelector('[data-action="download"]')!.addEventListener('click', () => { if (!output.value) { setStatus(message, 'error', '没有可下载的结果。'); return } const java = active === 'java'; const yaml = active === 'yaml'; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([output.value], { type: java ? 'text/x-java-source;charset=utf-8' : yaml ? 'application/yaml;charset=utf-8' : 'text/plain;charset=utf-8' })); link.download = java ? (resultFileName ?? 'Root.java') : yaml ? 'result.yaml' : 'result.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); setStatus(message, 'success', '已开始下载结果。') })
  const file = app.querySelector<HTMLInputElement>('#file-input')!; app.querySelector('[data-action="import"]')!.addEventListener('click', () => file.click()); file.addEventListener('change', async () => { const selected = file.files?.[0]; if (!selected) return; if (selected.size > INPUT_LIMIT_BYTES) { file.value = ''; setStatus(message, 'error', '文件不能超过 20 MiB。'); return }; input.value = (await selected.text()).replace(/^\uFEFF/, ''); setStatus(message, 'idle', `已导入 ${selected.name}`) })
  cancel.addEventListener('click', () => { cancelCurrent?.(); cancel.hidden = true; setStatus(message, 'cancelled', '任务已取消。') })
  app.querySelectorAll<HTMLInputElement>('#class-name,#package-name,#jackson,#lombok').forEach((control) => control.addEventListener('change', () => { preferences.java = { rootClassName: app.querySelector<HTMLInputElement>('#class-name')?.value ?? '', packageName: app.querySelector<HTMLInputElement>('#package-name')?.value ?? '', jackson: app.querySelector<HTMLInputElement>('#jackson')?.checked ?? true, lombok: app.querySelector<HTMLInputElement>('#lombok')?.checked ?? false }; persist() }))
  input.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); void copyOutput() } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void execute((selectedOperationByModule[active as TextModuleId] ?? operationsByModule[active as TextModuleId][0].id) as OperationId) } })
}
function workerOperation(operation: OperationId, input: string, options: OperationOptions, cancel: HTMLButtonElement): Promise<Result> { cancelCurrent?.(); const worker = new Worker(new URL('../operation-worker.ts', import.meta.url), { type: 'module' }); currentWorker = worker; const id = ++requestId; cancel.hidden = false; return new Promise<Result>((resolve, reject) => { let settled = false; const finish = () => { if (settled) return false; settled = true; worker.terminate(); if (currentWorker === worker) currentWorker = undefined; if (cancelCurrent === abort) cancelCurrent = undefined; cancel.hidden = true; return true }; const abort = () => { if (finish()) reject(new Error('任务已取消。')) }; cancelCurrent = abort; worker.onmessage = (event: MessageEvent<OperationResponse>) => { if (event.data.id !== id || !finish()) return; if (event.data.ok) resolve(event.data.result); else { const location = event.data.error.location; reject(new Error(location ? `第 ${location.line} 行，第 ${location.column} 列：${event.data.error.message}` : event.data.error.message)) } }; worker.onerror = () => { if (finish()) reject(new Error('后台任务执行失败。')) }; worker.postMessage({ id, operation, input, options }) }) }
function timestampView() { return `<section class="timestamp"><div class="now-card"><span>当前 Unix 时间</span><output id="current-time">${Date.now()}</output><p id="current-readable"></p><button class="quiet-button" data-copy="current-time">复制毫秒时间戳</button></div><div class="conversion-grid"><article><div class="section-label">01 / 时间戳 → 日期</div><label>输入 10 位或 13 位数字<input id="timestamp-input" inputmode="numeric" placeholder="例如 1717228800000" /></label><output class="result" id="date-result">等待输入</output><button class="quiet-button" data-copy="date-result">复制结果</button></article><article><div class="section-label">02 / 日期 → 时间戳</div><div class="date-row"><label>日期<input id="date-input" type="date" /></label><label>时间<input id="time-input" type="time" step="1" /></label></div><div class="dual-results"><div class="stamp-card"><output><small>10 位 / 秒</small><strong id="seconds-result">—</strong></output><button class="quiet-button" data-copy="seconds-result">复制 10 位</button></div><div class="stamp-card"><output><small>13 位 / 毫秒</small><strong id="milliseconds-result">—</strong></output><button class="quiet-button" data-copy="milliseconds-result">复制 13 位</button></div></div></article></div><footer>日期时间采用浏览器本地时区 · ${utcOffset()}</footer></section>` }
function startClock() { if (clock) window.clearInterval(clock); const update = () => { const now = new Date(); const number = app.querySelector('#current-time'); const readable = app.querySelector('#current-readable'); if (number) number.textContent = String(now.getTime()); if (readable) readable.textContent = currentTimeDescription(now) }; update(); clock = window.setInterval(update, 1000); const date = app.querySelector<HTMLInputElement>('#date-input')!; const time = app.querySelector<HTMLInputElement>('#time-input')!; const now = new Date(); date.value = localDateInput(now); time.value = localTimeInput(now); const convertDate = () => { try { const result = localDateTimeToTimestamps(date.value, time.value); app.querySelector('#seconds-result')!.textContent = result.seconds; app.querySelector('#milliseconds-result')!.textContent = result.milliseconds } catch { app.querySelector('#seconds-result')!.textContent = '—'; app.querySelector('#milliseconds-result')!.textContent = '—' } }; date.addEventListener('input', convertDate); time.addEventListener('input', convertDate); convertDate(); app.querySelector<HTMLInputElement>('#timestamp-input')!.addEventListener('input', (event) => { const raw = (event.target as HTMLInputElement).value.trim(); const result = app.querySelector('#date-result')!; if (!raw) { result.textContent = '等待输入'; return } try { result.textContent = timestampToLocal(raw) } catch (error) { result.textContent = error instanceof Error ? error.message : '无效时间戳' } }); app.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => button.addEventListener('click', async () => { const target = app.querySelector(`#${button.dataset.copy}`); const content = target?.textContent?.trim(); if (!content || content === '—' || content.startsWith('等待') || content.startsWith('请输入') || content === '无效时间戳') return; await navigator.clipboard.writeText(content); const original = button.textContent; button.textContent = '已复制'; window.setTimeout(() => { button.textContent = original }, 1200) })) }
window.addEventListener('beforeunload', () => { cancelCurrent?.(); if (clock) window.clearInterval(clock) })
document.addEventListener('visibilitychange', () => { if (document.hidden && clock) { window.clearInterval(clock); clock = undefined } else if (!document.hidden && active === 'timestamp' && !clock) startClock() })
render()
