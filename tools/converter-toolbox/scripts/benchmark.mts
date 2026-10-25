import { performance } from 'node:perf_hooks'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cpus, platform, arch } from 'node:os'
import { formatJson, jsonToYaml, yamlToJson } from '../src/core/operations.ts'

function sample(bytes: number) {
  const row = '{"id":123456,"name":"converter-toolbox","items":[1,2,3],"enabled":true}\n'
  return `[${row
    .repeat(Math.ceil(bytes / row.length))
    .split('\n')
    .filter(Boolean)
    .join(',')}]`
}

const caseScript = fileURLToPath(new URL('./performance-case.mts', import.meta.url))
const processors = cpus()
console.log(
  `环境：Node ${process.version}，${platform()}/${arch()}，${processors[0]?.model ?? 'unknown CPU'}，${processors.length} logical CPUs`,
)
const failures: string[] = []
for (const name of ['format', 'java', 'yaml-json', 'json-yaml']) {
  const raw = execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--expose-gc', caseScript, name],
    { encoding: 'utf8' },
  )
  const result = JSON.parse(raw) as {
    name: string
    elapsed: number
    heap: number
    inputBytes: number
    outputBytes: number
  }
  const heapMiB = result.heap / 1024 / 1024
  console.log(
    `20 MB ${result.name}: ${result.elapsed.toFixed(1)} ms，增量堆 ${heapMiB.toFixed(1)} MiB，输入 ${result.inputBytes} B，输出 ${result.outputBytes} B`,
  )
  if (result.elapsed > 2_000) failures.push(`${result.name} 超过 2 秒性能门槛。`)
  if (heapMiB > 200) failures.push(`${result.name} 超过 200 MiB 增量堆门槛。`)
}
for (const bytes of [1_000_000, 10_000_000, 20_000_000]) {
  const input = sample(bytes)
  const started = performance.now()
  formatJson(input)
  jsonToYaml(input)
  yamlToJson(jsonToYaml(input).output)
  const elapsed = performance.now() - started
  const limit = bytes === 1_000_000 ? 200 : bytes === 10_000_000 ? 2_000 : undefined
  console.log(
    `${Math.round(bytes / 1_000_000)} MB: ${elapsed.toFixed(1)} ms${limit ? ` / ${limit} ms` : ''}（JSON 格式化 + 2×JSON→YAML + YAML→JSON）`,
  )
  if (limit && elapsed > limit)
    failures.push(`${Math.round(bytes / 1_000_000)} MB 性能基线未达标。`)
}
if (failures.length) throw new Error(failures.join('\n'))
