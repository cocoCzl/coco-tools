import './style.css'
import './interaction.css'
import './daylight.css'
import { loadPreferences, savePreferences, type Theme, type Indent } from './preferences'
import { createSessions, type ModuleId } from './state'
import { textView, bindTextTool } from './text-tool'
import { timestampView, createTimestampSession, bindTimestampTool } from './timestamp-tool'

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
const preferences = loadPreferences()
const sessions = createSessions()
const timestampSession = createTimestampSession()
let active: ModuleId = 'json-format'
let openMenu: 'theme' | 'indent' | null = null
let textController: ReturnType<typeof bindTextTool> | undefined
let timestampController: ReturnType<typeof bindTimestampTool> | undefined
const app = document.querySelector<HTMLElement>('#app')!

function persist() {
  const status = app.querySelector('#preference-status')!
  status.textContent = savePreferences(preferences)
    ? ''
    : '偏好保存失败；本页仍可使用，下次打开可能恢复默认设置。'
}
function dropdown(name: 'theme' | 'indent', value: string, options: Array<[string, string]>) {
  const opened = openMenu === name
  const selectedValue = name === 'theme' ? preferences.theme : preferences.indent
  const label = name === 'theme' ? '外观' : '缩进'
  const items = options
    .map(
      ([key, text]) => `
    <button role="option" aria-selected="${key === selectedValue}"
      data-dropdown-option="${name}" tabindex="-1" data-value="${key}">
      <b>${key === selectedValue ? '✓' : ''}</b><span>${text}</span>
    </button>`,
    )
    .join('')
  return `<div class="dropdown">
    <button class="dropdown-trigger" aria-label="${label}" data-dropdown-toggle="${name}"
      aria-haspopup="listbox" aria-expanded="${opened}"><span>${value}</span><i>⌄</i></button>
    <div class="dropdown-menu ${opened ? 'is-open' : ''}" data-dropdown-menu="${name}"
      role="listbox" aria-label="${label}">${items}</div>
  </div>`
}
function render() {
  textController?.dispose()
  timestampController?.dispose()
  textController = undefined
  timestampController = undefined
  document.documentElement.dataset.theme = preferences.theme
  app.className = preferences.compact ? 'app is-compact' : 'app'
  const current = modules.find((item) => item.id === active)!
  const navigation = modules
    .map(
      (item, index) => `
    <button class="nav-item ${item.id === active ? 'is-active' : ''}" data-module="${item.id}"
      title="${item.label}" aria-label="${item.label}" ${item.id === active ? 'aria-current="page"' : ''}>
      <b aria-hidden="true">${item.icon}</b><span><strong>${item.label}</strong><small>${item.hint}</small></span>
      <i aria-hidden="true">${String(index + 1).padStart(2, '0')}</i>
    </button>`,
    )
    .join('')
  const workspace =
    active === 'timestamp'
      ? timestampView()
      : textView(
          active,
          sessions[active],
          dropdown('indent', indentLabels[preferences.indent], Object.entries(indentLabels)),
        )
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-mark" src="./icons/icon48.png" alt=""/>
        <div class="brand-copy"><strong>转换工具箱</strong></div>
        <button class="collapse" data-action="toggle" aria-label="${preferences.compact ? '展开导航' : '折叠导航'}" aria-expanded="${!preferences.compact}">${preferences.compact ? '›' : '‹'}</button>
      </div>
      <div class="nav-label">转换模块</div><nav aria-label="转换模块">${navigation}</nav>
      <div class="sidebar-foot"><span class="live-dot"></span><span>本地处理 · 无上传</span></div>
    </aside>
    <section class="surface">
      <header class="topbar">
        <div class="title-block">
          <h1>${current.label}</h1><p class="module-hint">${current.hint}</p>
        </div>
        <div class="top-actions">
          <div class="theme"><span>外观</span>${dropdown('theme', themeLabels[preferences.theme], Object.entries(themeLabels))}</div>
        </div>
      </header>
      <div class="workspace"><p id="preference-status" role="status"></p>${workspace}</div>
    </section>`
  bindShell()
  if (active === 'timestamp') timestampController = bindTimestampTool(app, timestampSession)
  else textController = bindTextTool(app, active, sessions[active], preferences, persist)
}
function bindShell() {
  app.querySelectorAll<HTMLButtonElement>('[data-module]').forEach((button) =>
    button.addEventListener('click', () => {
      const target = button.dataset.module as ModuleId
      if (target === active) return
      active = target
      openMenu = null
      render()
    }),
  )
  app.querySelector<HTMLButtonElement>('[data-action="toggle"]')!.addEventListener('click', () => {
    preferences.compact = !preferences.compact
    app.classList.toggle('is-compact', preferences.compact)
    app
      .querySelector('[data-action="toggle"]')!
      .setAttribute('aria-expanded', String(!preferences.compact))
    const toggle = app.querySelector<HTMLButtonElement>('[data-action="toggle"]')!
    toggle.setAttribute('aria-label', preferences.compact ? '展开导航' : '折叠导航')
    toggle.textContent = preferences.compact ? '›' : '‹'
    persist()
  })
  app.querySelectorAll<HTMLButtonElement>('[data-dropdown-toggle]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const name = button.dataset.dropdownToggle as 'theme' | 'indent'
      setMenu(name, openMenu !== name)
    }),
  )
  app.querySelectorAll<HTMLButtonElement>('[data-dropdown-option]').forEach((button) =>
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const name = button.dataset.dropdownOption as 'theme' | 'indent'
      if (name === 'theme') preferences.theme = button.dataset.value as Theme
      else {
        preferences.indent = button.dataset.value as Indent
        textController?.invalidateOptions()
      }
      persist()
      document.documentElement.dataset.theme = preferences.theme
      refreshMenu(name)
      setMenu(name, false)
      app.querySelector<HTMLButtonElement>(`[data-dropdown-toggle="${name}"]`)?.focus()
    }),
  )
}
function setMenu(name: 'theme' | 'indent', shouldOpen: boolean) {
  if (openMenu && openMenu !== name) setMenu(openMenu, false)
  openMenu = shouldOpen ? name : null
  app
    .querySelector<HTMLElement>(`[data-dropdown-menu="${name}"]`)
    ?.classList.toggle('is-open', shouldOpen)
  app
    .querySelector<HTMLButtonElement>(`[data-dropdown-toggle="${name}"]`)
    ?.setAttribute('aria-expanded', String(shouldOpen))
}
function refreshMenu(name: 'theme' | 'indent') {
  const value = name === 'theme' ? preferences.theme : preferences.indent
  const label = name === 'theme' ? themeLabels[preferences.theme] : indentLabels[preferences.indent]
  const trigger = app.querySelector<HTMLButtonElement>(`[data-dropdown-toggle="${name}"]`)
  if (trigger) trigger.querySelector('span')!.textContent = label
  app.querySelectorAll<HTMLButtonElement>(`[data-dropdown-option="${name}"]`).forEach((option) => {
    const selected = option.dataset.value === value
    option.setAttribute('aria-selected', String(selected))
    option.querySelector('b')!.textContent = selected ? '✓' : ''
  })
}
document.addEventListener('click', (event) => {
  if (openMenu && !(event.target as HTMLElement).closest('.dropdown')) setMenu(openMenu, false)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openMenu) setMenu(openMenu, false)
})
app.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement
  const dropdownElement = target.closest('.dropdown')
  if (!dropdownElement) return
  const trigger = dropdownElement.querySelector<HTMLButtonElement>('[data-dropdown-toggle]')!
  const name = trigger.dataset.dropdownToggle as 'theme' | 'indent'
  const options = [...dropdownElement.querySelectorAll<HTMLButtonElement>('[role="option"]')]
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    setMenu(name, true)
    const current = options.indexOf(target as HTMLButtonElement)
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : current < 0
            ? event.key === 'ArrowUp'
              ? options.length - 1
              : 0
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[index].focus()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    setMenu(name, false)
    trigger.focus()
  } else if (event.key === 'Tab') setMenu(name, false)
})
window.addEventListener('pagehide', () => {
  textController?.dispose()
  timestampController?.dispose()
})
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload()
})
document.addEventListener('visibilitychange', () => timestampController?.syncClock())
render()
