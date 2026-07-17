import assert from 'node:assert/strict'
import test from 'node:test'

test('opens one workbench tab and focuses it on later clicks', async () => {
  let clickHandler: (() => void) | undefined
  let removedHandler: ((tabId: number) => void) | undefined
  let storedTabId: number | undefined
  let createCount = 0
  let updateCount = 0
  let focusCount = 0

  const chromeMock = {
    action: { onClicked: { addListener(callback: () => void) { clickHandler = callback } } },
    runtime: { getURL(path: string) { return `chrome-extension://test/${path}` } },
    storage: {
      session: {
        async get() { return { workbenchTabId: storedTabId } },
        async set(value: { workbenchTabId?: number }) { storedTabId = value.workbenchTabId },
        async remove() { storedTabId = undefined },
      },
    },
    tabs: {
      async create() { createCount += 1; return { id: 42 } },
      async get(tabId: number) { assert.equal(tabId, 42); return { id: 42, windowId: 7 } },
      async update(tabId: number) { assert.equal(tabId, 42); updateCount += 1 },
      onRemoved: { addListener(callback: (tabId: number) => void) { removedHandler = callback } },
    },
    windows: { async update(windowId: number) { assert.equal(windowId, 7); focusCount += 1 } },
  }

  ;(globalThis as { chrome?: unknown }).chrome = chromeMock
  await import(`../src/service-worker.ts?test=${Date.now()}`)
  assert.ok(clickHandler)

  clickHandler()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(createCount, 1)
  assert.equal(storedTabId, 42)

  clickHandler()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(createCount, 1)
  assert.equal(updateCount, 1)
  assert.equal(focusCount, 1)

  removedHandler?.(42)
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(storedTabId, undefined)
  delete (globalThis as { chrome?: unknown }).chrome
})
