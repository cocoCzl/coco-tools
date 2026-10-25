import { INPUT_LIMIT_BYTES, utf8Bytes } from '../core/limits'
import { ToolError } from '../core/errors'
import type { OperationId, OperationOptions } from '../core/protocol'
import type { Preferences } from './preferences'
import { operationsByModule, type TextModuleId, type TextSession, type Status } from './state'
import { workerOperation, type Task } from './worker-client'

export function textView(module: TextModuleId, state: TextSession, indentMenu: string): string {
  const buttons = operationsByModule[module]
    .map(
      ({ id, label }) =>
        `<button data-run="${id}" class="${id === state.operation ? 'is-selected' : ''}" aria-pressed="${id === state.operation}">${label}</button>`,
    )
    .join('')
  const options =
    module === 'json-format'
      ? indentMenu
      : module === 'json-escape'
        ? '<label class="check"><input id="ascii" type="checkbox" />转义非 ASCII</label>'
        : module === 'java'
          ? `<label class="option-field">根类名<input id="class-name" placeholder="Root" /></label><label class="option-field">包名<input id="package-name" placeholder="可选" /></label><label class="check"><input id="jackson" type="checkbox" />Jackson</label><label class="check"><input id="lombok" type="checkbox" />Lombok</label>`
          : ''
  const accept =
    module === 'yaml'
      ? '.json,.yaml,.yml,.txt,application/json,application/yaml,text/yaml,text/plain'
      : '.json,.txt,application/json,text/plain'
  return `<section class="text-tool">
    <div class="control-deck"><div class="primary-actions">${buttons}${options}</div>
      <div class="utility-actions">
        <button class="quiet-button" data-action="import">↥ 导入</button><input id="file-input" type="file" accept="${accept}" hidden />
        <button class="quiet-button" data-action="clear">清空</button>
        <button class="quiet-button" data-action="use-result">将结果作为输入</button>
        <button class="quiet-button" data-action="copy-output">复制</button>
        <button class="quiet-button" data-action="download">下载</button>
        <button class="quiet-button danger" data-action="cancel" hidden>取消任务</button>
      </div>
    </div>
    <div class="status-row"><p id="message" class="message" role="status" aria-live="polite"><span class="message-dot"></span><span></span></p><button data-action="locate-error" hidden>定位错误</button></div>
    <div class="editors">
      <section class="editor-card" aria-label="输入编辑器">
        <div class="editor-heading"><label for="input">输入</label><button data-action="toggle-find" aria-expanded="false" aria-controls="find-tools" title="查找（⌘ / Ctrl + F）">查找</button></div>
        <div id="find-tools" class="find-tools" hidden><label>查找<input id="find-input" type="search" placeholder="区分大小写" /></label><button data-action="find">下一个</button><button data-action="close-find" aria-label="关闭查找">关闭</button></div>
        <textarea id="input" aria-label="转换输入" wrap="off" spellcheck="false" placeholder="粘贴或导入要处理的内容…"></textarea>
        <div class="editor-footer"><output id="cursor-position">第 1 行，第 1 列</output><span>⌘ / Ctrl + Enter 执行</span></div>
      </section>
      <section class="editor-card" aria-label="输出编辑器"><div class="editor-heading"><label for="output">输出</label><small>只读结果</small></div><textarea id="output" aria-label="转换结果" wrap="off" readonly spellcheck="false" placeholder="处理结果会显示在这里"></textarea><div class="editor-footer"><span>输入区 ⌘ / Ctrl + Shift + C 复制结果</span></div></section>
    </div>
  </section>`
}

export function bindTextTool(
  app: HTMLElement,
  module: TextModuleId,
  state: TextSession,
  preferences: Preferences,
  persist: () => void,
): { dispose: () => void; invalidateOptions: () => void } {
  const input = app.querySelector<HTMLTextAreaElement>('#input')!
  const output = app.querySelector<HTMLTextAreaElement>('#output')!
  const message = app.querySelector<HTMLElement>('#message')!
  const cancel = app.querySelector<HTMLButtonElement>('[data-action="cancel"]')!
  const locate = app.querySelector<HTMLButtonElement>('[data-action="locate-error"]')!
  let task: Task | undefined
  let disposed = false
  let readingFile = false
  let positionTimer: number | undefined
  input.value = state.input
  output.value = state.result?.output ?? ''
  const setStatus = (status: Status, text: string) => {
    state.status = status
    state.message = text
    message.dataset.status = status
    message.querySelector('span:last-child')!.textContent = text
    locate.hidden = !state.location
    message.tabIndex = state.location ? 0 : -1
    message.dataset.locatable = String(!!state.location)
    message.setAttribute(
      'aria-label',
      state.location ? `${text}，点击或按 Enter 定位输入错误。` : text,
    )
  }
  const refreshActions = () => {
    app.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => {
      button.disabled = !!task
    })
    for (const action of ['copy-output', 'download', 'use-result'])
      app.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.disabled = !state.result
    cancel.hidden = !task
  }
  const invalidate = (text: string, status: Status = 'idle', clearResult = true) => {
    state.revision += 1
    readingFile = false
    task?.cancel()
    task = undefined
    if (clearResult) {
      state.result = undefined
      output.value = ''
    }
    state.location = undefined
    setStatus(status, text)
    refreshActions()
  }
  const updatePosition = () => {
    const position = app.querySelector('#cursor-position')!
    if (state.input.length > 1_000_000) {
      position.textContent = '大文本模式 · 按需查找和错误定位'
      return
    }
    const at = input.selectionStart
    position.textContent = `第 ${lineAt(state.input, at)} 行，第 ${at - (at === 0 ? -1 : state.input.lastIndexOf('\n', at - 1))} 列`
  }
  const schedulePosition = () => {
    window.clearTimeout(positionTimer)
    positionTimer = window.setTimeout(updatePosition, 80)
  }
  const options = (): OperationOptions => ({
    indent: preferences.indent,
    escapeNonAscii: state.ascii,
    ...preferences.java,
  })
  const execute = async (operation: OperationId) => {
    if (task) return
    state.operation = operation
    app.querySelectorAll<HTMLButtonElement>('[data-run]').forEach((button) => {
      const selected = button.dataset.run === operation
      button.classList.toggle('is-selected', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    invalidate('正在转换，请稍候…', 'running')
    if (!state.input.trim()) {
      setStatus('error', '请输入要处理的内容。')
      input.focus()
      return
    }
    if (utf8Bytes(state.input) > INPUT_LIMIT_BYTES) {
      setStatus('error', '输入不能超过 20 MiB。')
      return
    }
    const revision = state.revision
    const current = workerOperation(operation, state.input, options())
    task = current
    refreshActions()
    try {
      const result = await current.promise
      if (disposed || revision !== state.revision) return
      state.result = result
      output.value = result.output
      setStatus('success', result.warnings?.join(' ') || '转换完成。')
    } catch (error) {
      if (disposed || revision !== state.revision) return
      state.location = error instanceof ToolError ? error.location : undefined
      const detail = error instanceof Error ? error.message : '发生未知错误。'
      const location = state.location
      setStatus(
        error instanceof ToolError && error.code === 'CANCELLED' ? 'cancelled' : 'error',
        location && !detail.startsWith('第 ')
          ? `第 ${location.line} 行，第 ${location.column} 列：${detail}`
          : detail,
      )
    } finally {
      if (!disposed && revision === state.revision) {
        task = undefined
        refreshActions()
      }
    }
  }
  app
    .querySelectorAll<HTMLButtonElement>('[data-run]')
    .forEach((button) =>
      button.addEventListener('click', () => void execute(button.dataset.run as OperationId)),
    )
  input.addEventListener('input', () => {
    state.input = input.value
    invalidate('输入已修改，请重新转换。')
    schedulePosition()
  })
  for (const event of ['keyup', 'click', 'select']) input.addEventListener(event, schedulePosition)
  app.querySelector('[data-action="clear"]')!.addEventListener('click', () => {
    invalidate('已清空，等待新的输入。')
    state.input = input.value = ''
    updatePosition()
    input.focus()
  })
  cancel.addEventListener('click', () => invalidate('任务已取消。', 'cancelled'))
  const copyOutput = async () => {
    const result = state.result
    if (!result) {
      setStatus('error', '没有可复制的结果。')
      return
    }
    const revision = state.revision
    try {
      await navigator.clipboard.writeText(result.output)
      if (!disposed && revision === state.revision) setStatus('success', '已复制结果。')
    } catch {
      if (!disposed && revision === state.revision)
        setStatus('error', '复制失败，请检查剪贴板权限或手动选择结果后复制。')
    }
  }
  app
    .querySelector('[data-action="copy-output"]')!
    .addEventListener('click', () => void copyOutput())
  app.querySelector('[data-action="download"]')!.addEventListener('click', () => {
    const result = state.result
    if (!result) return
    let url: string | undefined
    try {
      url = URL.createObjectURL(new Blob([result.output], { type: result.mimeType }))
      const link = document.createElement('a')
      link.href = url
      link.download = result.fileName ?? 'result.txt'
      link.click()
      setStatus('success', '已开始下载结果。')
    } catch {
      setStatus('error', '下载失败，请重试或复制结果。')
    } finally {
      if (url) {
        const objectUrl = url
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      }
    }
  })
  app.querySelector('[data-action="use-result"]')!.addEventListener('click', () => {
    if (!state.result) return
    const result = state.result.output
    // Explicit action replaces this module's input; the label describes the replacement.
    invalidate('已将结果作为输入，请选择下一步转换。')
    state.input = input.value = result
    updatePosition()
    input.focus()
  })
  const file = app.querySelector<HTMLInputElement>('#file-input')!
  app.querySelector('[data-action="import"]')!.addEventListener('click', () => file.click())
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]
    file.value = '' // Allow selecting the very same file again, including after a failure.
    if (!selected) return
    invalidate('正在读取文件…', 'idle', false)
    if (selected.size > INPUT_LIMIT_BYTES) {
      setStatus('error', '文件不能超过 20 MiB；尚未读取文件。')
      return
    }
    readingFile = true
    const revision = state.revision
    try {
      const text = (await selected.text()).replace(/^\uFEFF/, '')
      if (disposed || revision !== state.revision) return
      invalidate(`已导入 ${selected.name}`)
      state.input = input.value = text
      updatePosition()
    } catch {
      if (!disposed && revision === state.revision)
        setStatus('error', '文件读取失败，已保留输入；请重试。')
    } finally {
      if (!disposed && revision === state.revision) readingFile = false
    }
  })
  const selectRange = (start: number, end: number) => {
    input.focus()
    input.setSelectionRange(start, end)
    input.scrollTop =
      Math.max(0, (state.location?.line ?? 1) - 3) *
      parseFloat(getComputedStyle(input).lineHeight || '20')
    updatePosition()
  }
  const jumpToError = () => {
    if (state.location)
      selectRange(state.location.index, Math.min(state.input.length, state.location.index + 1))
  }
  locate.addEventListener('click', jumpToError)
  message.addEventListener('click', jumpToError)
  message.addEventListener('keydown', (event) => {
    if (state.location && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      jumpToError()
    }
  })
  const search = app.querySelector<HTMLInputElement>('#find-input')!
  const findPanel = app.querySelector<HTMLElement>('#find-tools')!
  const findToggle = app.querySelector<HTMLButtonElement>('[data-action="toggle-find"]')!
  const setFindOpen = (open: boolean) => {
    findPanel.hidden = !open
    findToggle.setAttribute('aria-expanded', String(open))
    if (open) search.focus()
    else input.focus()
  }
  findToggle.addEventListener('click', () => setFindOpen(findPanel.hidden))
  app
    .querySelector('[data-action="close-find"]')!
    .addEventListener('click', () => setFindOpen(false))
  findPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setFindOpen(false)
    }
  })
  const find = () => {
    const query = search.value
    if (!query) {
      setFindOpen(true)
      return
    }
    let at = state.input.indexOf(query, input.selectionEnd)
    if (at < 0) at = state.input.indexOf(query)
    if (at < 0) {
      setStatus('idle', '未找到匹配文本。')
      return
    }
    selectRange(at, at + query.length)
    // For find, compute scrolling only when requested, including large texts.
    input.scrollTop =
      (lineAt(state.input, at) - 1) * parseFloat(getComputedStyle(input).lineHeight || '20')
  }
  app.querySelector('[data-action="find"]')!.addEventListener('click', find)
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      find()
    }
  })
  const ascii = app.querySelector<HTMLInputElement>('#ascii')
  if (ascii) {
    ascii.checked = state.ascii
    ascii.addEventListener('change', () => {
      state.ascii = ascii.checked
      invalidate('选项已修改，请重新转换。')
    })
  }
  for (const [id, key] of [
    ['class-name', 'rootClassName'],
    ['package-name', 'packageName'],
  ] as const) {
    const control = app.querySelector<HTMLInputElement>(`#${id}`)
    if (control) {
      control.value = preferences.java[key]
      control.addEventListener('input', () => {
        preferences.java[key] = control.value
        invalidate('选项已修改，请重新转换。')
      })
      control.addEventListener('change', persist)
    }
  }
  for (const key of ['jackson', 'lombok'] as const) {
    const control = app.querySelector<HTMLInputElement>(`#${key}`)
    if (control) {
      control.checked = preferences.java[key]
      control.addEventListener('change', () => {
        preferences.java[key] = control.checked
        invalidate('选项已修改，请重新转换。')
        persist()
      })
    }
  }
  input.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      void copyOutput()
    } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void execute(state.operation)
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      setFindOpen(true)
    }
  })
  setStatus(state.status, state.message)
  refreshActions()
  updatePosition()
  return {
    invalidateOptions: () => invalidate('选项已修改，请重新转换。'),
    dispose: () => {
      // Invalidate in-flight conversion, import, and clipboard completions before detaching DOM.
      if (task) invalidate('任务已取消。', 'cancelled')
      else if (readingFile) invalidate('文件读取已取消，已保留输入。', 'cancelled', false)
      state.revision += 1
      disposed = true
      task?.cancel()
      task = undefined
      window.clearTimeout(positionTimer)
    },
  }
}

function lineAt(source: string, at: number): number {
  let line = 1
  let cursor = source.indexOf('\n')
  while (cursor >= 0 && cursor < at) {
    line += 1
    cursor = source.indexOf('\n', cursor + 1)
  }
  return line
}
