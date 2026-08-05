import assert from 'node:assert/strict'
import test from 'node:test'

type Listener = () => void

test('扩展图标只创建一个工作台标签页，并在已有标签页上聚焦', async () => {
  let action: Listener | undefined; let removed: ((id: number) => void) | undefined
  let stored: number | undefined; let created = 0; let activated = 0; let focused = 0
  ;(globalThis as Record<string, unknown>).chrome = {
    action: { onClicked: { addListener(listener: Listener) { action = listener } } },
    runtime: { getURL(path: string) { return `chrome-extension://test/${path}` } },
    storage: { session: { async get() { return stored === undefined ? {} : { workbenchTabId: stored } }, async set(value: { workbenchTabId: number }) { stored = value.workbenchTabId }, async remove() { stored = undefined } } },
    tabs: { async create() { created += 1; return { id: 42 } }, async get(id: number) { if (id !== stored) throw new Error('tab missing'); return { windowId: 7 } }, async update() { activated += 1 }, onRemoved: { addListener(listener: (id: number) => void) { removed = listener } } },
    windows: { async update() { focused += 1 } },
  }
  await import(`../src/service-worker.ts?test=${Date.now()}`)
  action?.(); await new Promise((resolve) => setImmediate(resolve))
  action?.(); await new Promise((resolve) => setImmediate(resolve))
  assert.equal(created, 1); assert.equal(activated, 1); assert.equal(focused, 1)
  removed?.(42); await new Promise((resolve) => setImmediate(resolve)); assert.equal(stored, undefined)
})
