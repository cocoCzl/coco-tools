import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mts/,
  timeout: 30_000,
  workers: 1,
})
