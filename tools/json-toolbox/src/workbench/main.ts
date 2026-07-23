import './style.css'

import { toErrorMessage } from '../core/errors.ts'
import { executeOperation, recommendedOperation, type OperationName, type OperationRequest, type OperationResponse } from '../core/operations.ts'

type ToolName = 'formatter' | 'escape' | 'url' | 'java'
type ThemePreference = 'system' | 'light' | 'dark'
type Preferences = {
  theme: ThemePreference
  indent: '2' | '4' | 'tab'
  escapeNonAscii: boolean
  useJackson: boolean
  useLombok: boolean
}

type PanelElements = {
  root: HTMLElement
  input: HTMLTextAreaElement
  output: HTMLTextAreaElement
  error: HTMLElement
  warnings: HTMLElement
  inputMeta: HTMLElement
  outputMeta: HTMLElement
  cancel: HTMLButtonElement
  file: HTMLInputElement
}

type RunningTask = { id: number; tool: ToolName; worker?: Worker; cancel?: () => void }

const LARGE_INPUT_THRESHOLD = 1024 * 1024
const LARGE_FILE_WARNING = 20 * 1024 * 1024
const PREFERENCES_KEY = 'json-toolbox.preferences.v1'
const defaultPreferences: Preferences = {
  theme: 'system',
  indent: '2',
  escapeNonAscii: false,
  useJackson: true,
  useLombok: false,
}

const panelsHost = required<HTMLElement>('#tool-panels')
const themeSelect = required<HTMLSelectElement>('#theme-select')
const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tool-tab')]
const toastRegion = required<HTMLElement>('#toast-region')
const preferences = loadPreferences()
let activeTool: ToolName = 'formatter'
let taskSequence = 0
let runningTask: RunningTask | undefined

panelsHost.innerHTML = [
  panelTemplate('formatter', '格式化与压缩', '严格校验 JSON，只调整空白格式，不改写数字或转义内容。', formatterControls()),
  panelTemplate('escape', '转义与反转义', '将文本转为完整 JSON 字符串，或还原其中的原始内容。', escapeControls()),
  panelTemplate('url', 'URL 参数转换', '在 URL 查询参数和扁平 JSON 对象之间转换。', urlControls()),
  panelTemplate('java', '生成 Java 数据类', '根据 JSON 样例推断 Java 8+ 单文件数据类。', javaControls()),
].join('')

const panels = new Map<ToolName, PanelElements>(
  (['formatter', 'escape', 'url', 'java'] as ToolName[]).map((tool) => [tool, collectPanel(tool)]),
)

applyPreferences()
activateTool(toolFromHash())
bindTabs()
bindPanels()
bindKeyboard()
bindTheme()
window.addEventListener('hashchange', () => activateTool(toolFromHash()))
window.addEventListener('beforeunload', () => cancelRunningTask(false))

function panelTemplate(tool: ToolName, title: string, description: string, controls: string): string {
  return `
    <article class="tool-panel" id="panel-${tool}" data-panel="${tool}" role="tabpanel" aria-labelledby="tab-${tool}" ${tool === 'formatter' ? '' : 'hidden'}>
      <header class="panel-heading">
        <div><h2>${title}</h2></div>
        <p>${description}</p>
      </header>
      ${controls}
      <div class="editor-grid">
        <section class="editor-card input-card">
          <header class="editor-header">
            <label for="input-${tool}">输入</label>
            <span class="editor-meta" data-input-meta>第 1 行 · 第 1 列 · 0 B</span>
          </header>
          <textarea id="input-${tool}" data-input spellcheck="false" autocomplete="off" placeholder="${inputPlaceholder(tool)}"></textarea>
          <div class="editor-footer">
            <label class="file-button"><input type="file" data-file accept=".json,.txt,application/json,text/plain" /><span>导入文件</span></label>
            <button type="button" class="text-button" data-action="clear">清空</button>
            <span class="mode-badge" data-mode>标准文本模式</span>
          </div>
        </section>
        <section class="editor-card output-card">
          <header class="editor-header">
            <label for="output-${tool}">输出</label>
            <span class="editor-meta" data-output-meta>0 B</span>
          </header>
          <textarea id="output-${tool}" data-output readonly spellcheck="false" placeholder="处理结果将在这里显示"></textarea>
          <div class="editor-footer output-actions">
            <button type="button" class="text-button" data-action="copy" disabled>复制结果</button>
            <button type="button" class="text-button" data-action="download" disabled>下载结果</button>
            <span class="shortcut-hint">⌘/Ctrl + Shift + C</span>
          </div>
        </section>
      </div>
      <div class="result-status" aria-live="polite">
        <p class="error-message" data-error hidden></p>
        <ul class="warning-list" data-warnings hidden></ul>
      </div>
      <button type="button" class="cancel-button" data-action="cancel" hidden>取消当前任务</button>
    </article>`
}

function formatterControls(): string {
  return `
    <div class="control-rail">
      <label class="field-control"><span>缩进方式</span><select data-option="indent"><option value="2">2 个空格</option><option value="4">4 个空格</option><option value="tab">Tab</option></select></label>
      <div class="rail-actions"><button type="button" class="action-button primary" data-operation="format">格式化 <kbd>⌘↵</kbd></button><button type="button" class="action-button" data-operation="minify">压缩</button></div>
    </div>`
}

function escapeControls(): string {
  return `
    <div class="control-rail">
      <label class="switch-control"><input type="checkbox" data-option="escape-non-ascii" /><span class="switch-track"></span><span>转义非 ASCII 字符</span></label>
      <div class="rail-actions"><button type="button" class="action-button primary" data-operation="escape">转义 <kbd>⌘↵</kbd></button><button type="button" class="action-button" data-operation="unescape">反转义</button></div>
    </div>`
}

function urlControls(): string {
  return `
    <div class="control-rail">
      <p class="control-note">支持完整 URL、查询字符串和扁平 JSON 对象。</p>
      <div class="rail-actions"><button type="button" class="action-button primary" data-operation="query-to-json">URL → JSON <kbd>⌘↵</kbd></button><button type="button" class="action-button" data-operation="json-to-query">JSON → URL</button></div>
    </div>`
}

function javaControls(): string {
  return `
    <div class="java-options">
      <label class="field-control"><span>根类名</span><input data-option="root-class" value="Root" autocomplete="off" /></label>
      <label class="field-control package-field"><span>包名（可选）</span><input data-option="package" placeholder="com.example.model" autocomplete="off" /></label>
      <label class="switch-control"><input type="checkbox" data-option="jackson" checked /><span class="switch-track"></span><span>Jackson</span></label>
      <label class="switch-control"><input type="checkbox" data-option="lombok" /><span class="switch-track"></span><span>Lombok</span></label>
      <button type="button" class="action-button primary" data-operation="generate-java">生成数据类 <kbd>⌘↵</kbd></button>
    </div>`
}

function inputPlaceholder(tool: ToolName): string {
  if (tool === 'formatter') return '粘贴严格 JSON；完整 URL 会自动转到 URL 参数工具…'
  if (tool === 'escape') return '粘贴需要转义的文本，或完整 JSON 字符串…'
  if (tool === 'url') return '粘贴完整 URL、查询字符串或扁平 JSON 对象…'
  return '粘贴 JSON 对象或对象数组，生成 Java 数据类…'
}

function collectPanel(tool: ToolName): PanelElements {
  const root = required<HTMLElement>(`#panel-${tool}`)
  return {
    root,
    input: required<HTMLTextAreaElement>('[data-input]', root),
    output: required<HTMLTextAreaElement>('[data-output]', root),
    error: required<HTMLElement>('[data-error]', root),
    warnings: required<HTMLElement>('[data-warnings]', root),
    inputMeta: required<HTMLElement>('[data-input-meta]', root),
    outputMeta: required<HTMLElement>('[data-output-meta]', root),
    cancel: required<HTMLButtonElement>('[data-action="cancel"]', root),
    file: required<HTMLInputElement>('[data-file]', root),
  }
}

function bindTabs(): void {
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTool(tab.dataset.tool as ToolName))
    tab.addEventListener('keydown', (event: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
      tabs[next].focus()
      activateTool(tabs[next].dataset.tool as ToolName)
    })
  })
}

function bindPanels(): void {
  for (const [tool, panel] of panels) {
    panel.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
      if (!button) return
      const operation = button.dataset.operation as OperationName | undefined
      if (operation) void runOperation(tool, operation)
      const action = button.dataset.action
      if (action === 'clear') clearPanel(tool)
      if (action === 'copy') void copyOutput(tool)
      if (action === 'download') downloadOutput(tool)
      if (action === 'cancel') cancelRunningTask(true)
    })
    panel.input.addEventListener('input', () => {
      updateInputMeta(tool, true)
      clearMessages(panel)
    })
    panel.input.addEventListener('keyup', () => updateInputMeta(tool, false))
    panel.input.addEventListener('click', () => updateInputMeta(tool, false))
    panel.file.addEventListener('change', () => void importFile(tool))
  }

  required<HTMLSelectElement>('[data-option="indent"]', panels.get('formatter')?.root).addEventListener('change', (event) => {
    preferences.indent = (event.target as HTMLSelectElement).value as Preferences['indent']
    savePreferences()
  })
  required<HTMLInputElement>('[data-option="escape-non-ascii"]', panels.get('escape')?.root).addEventListener('change', (event) => {
    preferences.escapeNonAscii = (event.target as HTMLInputElement).checked
    savePreferences()
  })
  required<HTMLInputElement>('[data-option="jackson"]', panels.get('java')?.root).addEventListener('change', (event) => {
    preferences.useJackson = (event.target as HTMLInputElement).checked
    savePreferences()
  })
  required<HTMLInputElement>('[data-option="lombok"]', panels.get('java')?.root).addEventListener('change', (event) => {
    preferences.useLombok = (event.target as HTMLInputElement).checked
    savePreferences()
  })
}

function bindKeyboard(): void {
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.key === 'Enter') {
      event.preventDefault()
      const primary = panels.get(activeTool)?.root.querySelector<HTMLButtonElement>('[data-operation].primary')
      if (primary?.dataset.operation) void runOperation(activeTool, primary.dataset.operation as OperationName)
    } else if (event.shiftKey && event.key.toLocaleLowerCase() === 'c') {
      event.preventDefault()
      void copyOutput(activeTool)
    }
  })
}

function bindTheme(): void {
  themeSelect.addEventListener('change', () => {
    preferences.theme = themeSelect.value as ThemePreference
    savePreferences()
    applyTheme()
  })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (preferences.theme === 'system') applyTheme()
  })
}

function activateTool(tool: ToolName): void {
  if (!panels.has(tool)) tool = 'formatter'
  if (activeTool !== tool) cancelRunningTask(false)
  activeTool = tool
  for (const tab of tabs) {
    const selected = tab.dataset.tool === tool
    tab.classList.toggle('is-active', selected)
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
  }
  for (const [name, panel] of panels) panel.root.hidden = name !== tool
  if (location.hash !== `#${tool}`) history.replaceState(null, '', `#${tool}`)
}

async function runOperation(tool: ToolName, operation: OperationName): Promise<void> {
  const panel = panels.get(tool)
  if (!panel) return
  const recommendation = recommendedOperation(panel.input.value)
  if (tool === 'formatter' && (operation === 'format' || operation === 'minify') && recommendation === 'query-to-json') {
    const urlPanel = panels.get('url')
    if (!urlPanel) return
    urlPanel.input.value = panel.input.value
    updateInputMeta('url', true)
    activateTool('url')
    toast('检测到完整 URL，已切换到 URL 参数工具。')
    await runOperation('url', 'query-to-json')
    return
  }
  cancelRunningTask(false)
  clearMessages(panel)
  setOutput(panel, '')
  setBusy(panel, true)
  const taskId = ++taskSequence
  runningTask = { id: taskId, tool }
  const request: OperationRequest = { operation, input: panel.input.value, options: operationOptions(tool) }
  try {
    const result = request.input.length > LARGE_INPUT_THRESHOLD
      ? await runInWorker(taskId, tool, request)
      : await Promise.resolve().then(() => executeOperation(request))
    if (runningTask?.id !== taskId) return
    setResult(panel, result, operation)
  } catch (error) {
    if (runningTask?.id !== taskId) return
    showError(panel, toErrorMessage(error))
  } finally {
    if (runningTask?.id === taskId) {
      runningTask?.worker?.terminate()
      runningTask = undefined
      setBusy(panel, false)
    }
  }
}

function runInWorker(taskId: number, tool: ToolName, request: OperationRequest): Promise<OperationResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../operation-worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      callback()
    }
    runningTask = {
      id: taskId,
      tool,
      worker,
      cancel: () => finish(() => reject(new DOMException('Task cancelled', 'AbortError'))),
    }
    worker.addEventListener('message', (event: MessageEvent<{ taskId: number; ok: boolean; result?: OperationResponse; error?: string }>) => {
      if (event.data.taskId !== taskId) return
      if (event.data.ok && event.data.result) finish(() => resolve(event.data.result as OperationResponse))
      else finish(() => reject(new Error(event.data.error ?? '后台任务执行失败。')))
    })
    worker.addEventListener('error', () => finish(() => reject(new Error('后台任务意外终止。'))))
    worker.postMessage({ taskId, request })
  })
}

function operationOptions(tool: ToolName): Record<string, unknown> {
  if (tool === 'formatter') {
    const value = required<HTMLSelectElement>('[data-option="indent"]', panels.get(tool)?.root).value
    return { indent: value === '4' ? 4 : value === 'tab' ? 'tab' : 2 }
  }
  if (tool === 'escape') {
    return { escapeNonAscii: required<HTMLInputElement>('[data-option="escape-non-ascii"]', panels.get(tool)?.root).checked }
  }
  if (tool === 'java') {
    const root = panels.get(tool)?.root
    return {
      rootClassName: required<HTMLInputElement>('[data-option="root-class"]', root).value,
      packageName: required<HTMLInputElement>('[data-option="package"]', root).value,
      useJackson: required<HTMLInputElement>('[data-option="jackson"]', root).checked,
      useLombok: required<HTMLInputElement>('[data-option="lombok"]', root).checked,
    }
  }
  return {}
}

function setResult(panel: PanelElements, result: OperationResponse, operation: OperationName): void {
  setOutput(panel, result.output)
  panel.output.dataset.fileName = result.fileName ?? defaultFileName(operation)
  const copy = required<HTMLButtonElement>('[data-action="copy"]', panel.root)
  const download = required<HTMLButtonElement>('[data-action="download"]', panel.root)
  copy.disabled = !result.output
  download.disabled = !result.output
  if (result.warnings.length > 0) {
    panel.warnings.replaceChildren(...result.warnings.map((warning) => {
      const item = document.createElement('li')
      item.textContent = warning
      return item
    }))
    panel.warnings.hidden = false
  }
}

function setOutput(panel: PanelElements, value: string): void {
  panel.output.value = value
  panel.outputMeta.textContent = humanBytes(new Blob([value]).size)
  const copy = required<HTMLButtonElement>('[data-action="copy"]', panel.root)
  const download = required<HTMLButtonElement>('[data-action="download"]', panel.root)
  copy.disabled = !value
  download.disabled = !value
}

function clearPanel(tool: ToolName): void {
  if (runningTask?.tool === tool) cancelRunningTask(false)
  const panel = panels.get(tool)
  if (!panel) return
  panel.input.value = ''
  setOutput(panel, '')
  clearMessages(panel)
  updateInputMeta(tool, true)
  panel.input.focus()
}

async function copyOutput(tool: ToolName): Promise<void> {
  const output = panels.get(tool)?.output.value ?? ''
  if (!output) return
  try {
    await navigator.clipboard.writeText(output)
    toast('结果已复制到剪贴板。')
  } catch {
    toast('复制失败，请手动选择输出内容。', true)
  }
}

function downloadOutput(tool: ToolName): void {
  const panel = panels.get(tool)
  if (!panel?.output.value) return
  const url = URL.createObjectURL(new Blob([panel.output.value.replace(/\r\n?/g, '\n')], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = panel.output.dataset.fileName ?? 'result.txt'
  anchor.click()
  URL.revokeObjectURL(url)
  toast(`已下载 ${anchor.download}。`)
}

async function importFile(tool: ToolName): Promise<void> {
  const panel = panels.get(tool)
  const file = panel?.file.files?.[0]
  if (!panel || !file) return
  panel.file.value = ''
  if (!/\.(json|txt)$/i.test(file.name)) {
    showError(panel, '只支持 .json 和 .txt 文件。')
    return
  }
  if (file.size > LARGE_FILE_WARNING && !window.confirm(`文件大小为 ${humanBytes(file.size)}，处理时可能占用较多内存。是否继续？`)) return
  try {
    const buffer = await file.arrayBuffer()
    let text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    panel.input.value = text
    setOutput(panel, '')
    clearMessages(panel)
    updateInputMeta(tool, true)
    toast(`已导入 ${file.name}。`)
  } catch {
    showError(panel, '文件不是有效 UTF-8 文本，未进行编码猜测。')
  }
}

function cancelRunningTask(showToast: boolean): void {
  if (!runningTask) return
  const panel = panels.get(runningTask.tool)
  runningTask.cancel?.()
  runningTask.worker?.terminate()
  taskSequence += 1
  runningTask = undefined
  if (panel) setBusy(panel, false)
  if (showToast) toast('任务已取消。')
}

function setBusy(panel: PanelElements, busy: boolean): void {
  panel.root.classList.toggle('is-busy', busy)
  panel.cancel.hidden = !busy
  panel.root.querySelectorAll<HTMLButtonElement>('[data-operation]').forEach((button) => { button.disabled = busy })
}

function showError(panel: PanelElements, message: string): void {
  setOutput(panel, '')
  panel.error.textContent = message
  panel.error.hidden = false
}

function clearMessages(panel: PanelElements): void {
  panel.error.hidden = true
  panel.error.textContent = ''
  panel.warnings.hidden = true
  panel.warnings.replaceChildren()
}

function updateInputMeta(tool: ToolName, recalculateBytes: boolean): void {
  const panel = panels.get(tool)
  if (!panel) return
  const before = panel.input.value.slice(0, panel.input.selectionStart)
  const lines = before.split('\n')
  if (recalculateBytes || panel.input.dataset.bytes === undefined) {
    panel.input.dataset.bytes = String(new Blob([panel.input.value]).size)
  }
  const bytes = Number(panel.input.dataset.bytes)
  panel.inputMeta.textContent = `第 ${lines.length} 行 · 第 ${(lines.at(-1)?.length ?? 0) + 1} 列 · ${humanBytes(bytes)}`
  const mode = required<HTMLElement>('[data-mode]', panel.root)
  const large = panel.input.value.length > LARGE_INPUT_THRESHOLD
  mode.textContent = large ? '大文件轻量模式' : '标准文本模式'
  mode.classList.toggle('is-large', large)
}

function defaultFileName(operation: OperationName): string {
  if (operation === 'format' || operation === 'minify' || operation === 'query-to-json') return 'result.json'
  if (operation === 'json-to-query') return 'query.txt'
  return 'result.txt'
}

function loadPreferences(): Preferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<Preferences>
    return { ...defaultPreferences, ...stored }
  } catch {
    return { ...defaultPreferences }
  }
}

function savePreferences(): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
}

function applyPreferences(): void {
  themeSelect.value = preferences.theme
  required<HTMLSelectElement>('[data-option="indent"]', panels.get('formatter')?.root).value = preferences.indent
  required<HTMLInputElement>('[data-option="escape-non-ascii"]', panels.get('escape')?.root).checked = preferences.escapeNonAscii
  required<HTMLInputElement>('[data-option="jackson"]', panels.get('java')?.root).checked = preferences.useJackson
  required<HTMLInputElement>('[data-option="lombok"]', panels.get('java')?.root).checked = preferences.useLombok
  applyTheme()
}

function applyTheme(): void {
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

function toolFromHash(): ToolName {
  const value = location.hash.slice(1)
  return ['formatter', 'escape', 'url', 'java'].includes(value) ? value as ToolName : 'formatter'
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function toast(message: string, error = false): void {
  const item = document.createElement('div')
  item.className = `toast${error ? ' is-error' : ''}`
  item.textContent = message
  toastRegion.append(item)
  window.setTimeout(() => item.remove(), 2600)
}

function required<T extends Element>(selector: string, root: ParentNode | null | undefined = document): T {
  const element = root?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing required element: ${selector}`)
  return element
}
