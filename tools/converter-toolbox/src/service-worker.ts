type Session = { workbenchTabId?: number }

declare const chrome: {
  action: { onClicked: { addListener(listener: () => void): void } }
  runtime: { getURL(path: string): string }
  storage: { session: { get(keys: string[]): Promise<Session>; set(value: Session): Promise<void>; remove(key: string): Promise<void> } }
  tabs: { create(options: { url: string }): Promise<{ id?: number }>; get(id: number): Promise<{ windowId?: number }>; update(id: number, options: { active: boolean }): Promise<void>; onRemoved: { addListener(listener: (id: number) => void): void } }
  windows: { update(id: number, options: { focused: boolean }): Promise<void> }
}

const key = 'workbenchTabId'
async function openWorkbench() {
  const session = await chrome.storage.session.get([key])
  if (session.workbenchTabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(session.workbenchTabId)
      await chrome.tabs.update(session.workbenchTabId, { active: true })
      if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true })
      return
    } catch { await chrome.storage.session.remove(key) }
  }
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
  if (tab.id !== undefined) await chrome.storage.session.set({ [key]: tab.id })
}
chrome.action.onClicked.addListener(() => void openWorkbench())
chrome.tabs.onRemoved.addListener((id) => void chrome.storage.session.get([key]).then((value) => value.workbenchTabId === id ? chrome.storage.session.remove(key) : undefined))
