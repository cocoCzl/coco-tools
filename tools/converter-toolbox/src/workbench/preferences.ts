export type Theme = 'system' | 'dark' | 'light'
export type Indent = '2' | '4' | 'tab'
export type Preferences = {
  theme: Theme
  compact: boolean
  indent: Indent
  java: { rootClassName: string; packageName: string; jackson: boolean; lombok: boolean }
}
const key = 'converter-toolbox-preferences'
const defaults: Preferences = {
  theme: 'system',
  compact: false,
  indent: '2',
  java: { rootClassName: '', packageName: '', jackson: true, lombok: false },
}

export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Preferences> | null
    const java = value?.java
    return {
      theme:
        value && ['system', 'dark', 'light'].includes(value.theme ?? '')
          ? value.theme!
          : defaults.theme,
      compact: value?.compact === true,
      indent:
        value && ['2', '4', 'tab'].includes(value.indent ?? '') ? value.indent! : defaults.indent,
      java: {
        rootClassName: typeof java?.rootClassName === 'string' ? java.rootClassName : '',
        packageName: typeof java?.packageName === 'string' ? java.packageName : '',
        jackson: java?.jackson !== false,
        lombok: java?.lombok === true,
      },
    }
  } catch {
    return structuredClone(defaults)
  }
}

export function savePreferences(preferences: Preferences): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}
