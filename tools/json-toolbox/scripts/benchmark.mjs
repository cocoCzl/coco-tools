import { performance } from 'node:perf_hooks'

import { formatJson, minifyJson } from '../src/core/json.ts'

function fixture(targetBytes) {
  const item = '{"id":9007199254740993,"money":1.00,"power":1e3,"name":"JSON 工具箱","enabled":true}'
  const count = Math.max(1, Math.floor((targetBytes - 2) / (item.length + 1)))
  return `[${Array.from({ length: count }, () => item).join(',')}]`
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function measure(name, input, operation) {
  operation(input)
  const values = []
  for (let run = 0; run < 5; run += 1) {
    const start = performance.now()
    operation(input)
    values.push(performance.now() - start)
  }
  const result = median(values)
  console.log(`${name}: ${result.toFixed(1)} ms median (${(Buffer.byteLength(input) / 1024 / 1024).toFixed(2)} MiB)`)
  return result
}

const oneMegabyte = fixture(1024 * 1024)
const tenMegabytes = fixture(10 * 1024 * 1024)
const results = {
  format1: measure('format / 1 MiB', oneMegabyte, formatJson),
  minify1: measure('minify / 1 MiB', oneMegabyte, minifyJson),
  format10: measure('format / 10 MiB', tenMegabytes, formatJson),
  minify10: measure('minify / 10 MiB', tenMegabytes, minifyJson),
}

if (Math.max(results.format1, results.minify1) > 200) {
  throw new Error('1 MiB benchmark exceeded the 200 ms target.')
}
if (Math.max(results.format10, results.minify10) > 2000) {
  throw new Error('10 MiB benchmark exceeded the 2 second target.')
}
