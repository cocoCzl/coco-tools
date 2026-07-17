type StoredSession = { workbenchTabId?: number }

declare const chrome: {
  action: { onClicked: { addListener(callback: () => void): void } }
  runtime: { getURL(path: string): string }
  storage: {
    session: {
      get(keys: string[]): Promise<StoredSession>
      set(value: StoredSession): Promise<void>
      remove(key: string): Promise<void>
    }
  }
  tabs: {
    create(options: { url: string }): Promise<{ id?: number }>
    get(tabId: number): Promise<{ id?: number; windowId?: number }>
    update(tabId: number, options: { active: boolean }): Promise<void>
    onRemoved: { addListener(callback: (tabId: number) => void): void }
  }
  windows: { update(windowId: number, options: { focused: boolean }): Promise<void> }
}

const SESSION_KEY = 'workbenchTabId'

async function openWorkbench(): Promise<void> {
  const stored = await chrome.storage.session.get([SESSION_KEY])
  if (stored.workbenchTabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(stored.workbenchTabId)
      await chrome.tabs.update(stored.workbenchTabId, { active: true })
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true })
      }
      return
    } catch {
      await chrome.storage.session.remove(SESSION_KEY)
    }
  }

  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
  if (tab.id !== undefined) {
    await chrome.storage.session.set({ workbenchTabId: tab.id })
  }
}

chrome.action.onClicked.addListener(() => {
  void openWorkbench()
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.get([SESSION_KEY]).then((stored) => {
    if (stored.workbenchTabId === tabId) {
      return chrome.storage.session.remove(SESSION_KEY)
    }
    return undefined
  })
})
