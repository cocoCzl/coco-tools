import { performance } from 'node:perf_hooks'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cpus, platform, arch } from 'node:os'
import { resolve } from 'node:path'
import { formatJson, jsonToYaml, yamlToJson } from '../src/core/operations.ts'

function sample(bytes: number) {
  const row = '{"id":123456,"name":"converter-toolbox","items":[1,2,3],"enabled":true}\n'
  return `[${row
    .repeat(Math.ceil(bytes / row.length))
    .split('\n')
    .filter(Boolean)
    .join(',')}]`
}

export type CaseMetrics = {
  name: string
  elapsed: number
  heap: number
  inputBytes: number
  outputBytes: number
}

/** Budgets apply to one user operation, not the sum of unrelated conversions. */
export function caseFailures(name: string, bytes: number, result: CaseMetrics): string[] {
  const label = `${bytes / 1_000_000} MB ${name}`
  if (
    ![1_000_000, 10_000_000, 20_000_000].includes(bytes) ||
    result.name !== name ||
    ![result.elapsed, result.heap, result.inputBytes, result.outputBytes].every(Number.isFinite) ||
    result.elapsed < 0 ||
    result.heap < 0 ||
    Math.abs(result.inputBytes - bytes) > 128 ||
    result.outputBytes <= 0 ||
    result.outputBytes > 40 * 1024 * 1024
  ) {
    return [`${label} 返回了无效测量结果。`]
  }
  const limit = bytes === 1_000_000 ? 200 : 2_000
  const failures: string[] = []
  if (result.elapsed > limit) failures.push(`${label} 超过 ${limit} ms 单次转换门槛。`)
  if (result.heap > 200 * 1024 * 1024) failures.push(`${label} 超过 200 MiB 增量堆门槛。`)
  return failures
}

function benchmark(): void {
  const caseScript = fileURLToPath(new URL('./performance-case.mts', import.meta.url))
  const processors = cpus()
  console.log(
    `环境：Node ${process.version}，${platform()}/${arch()}，${processors[0]?.model ?? 'unknown CPU'}，${processors.length} logical CPUs`,
  )
  console.log(
    '单次操作门槛：1 MB ≤200 ms；10/20 MB ≤2000 ms；各项增量堆 ≤200 MiB。每项使用新进程，不预热、不重试。',
  )
  const failures: string[] = []
  for (const bytes of [20_000_000, 1_000_000, 10_000_000]) {
    for (const name of ['format', 'java', 'yaml-json', 'json-yaml']) {
      const raw = execFileSync(
        process.execPath,
        ['--experimental-strip-types', '--expose-gc', caseScript, name, String(bytes)],
        { encoding: 'utf8' },
      )
      const result = JSON.parse(raw) as CaseMetrics
      console.log(
        `${bytes / 1_000_000} MB ${name}: ${result.elapsed.toFixed(1)} ms，增量堆 ${(result.heap / 1024 / 1024).toFixed(1)} MiB，输入 ${result.inputBytes} B，输出 ${result.outputBytes} B`,
      )
      failures.push(...caseFailures(name, bytes, result))
    }
  }
  // Keep the exact legacy workload visible for comparisons. It performs four
  // separate operations (including a discarded JSON→YAML), not one UI request.
  for (const bytes of [1_000_000, 10_000_000, 20_000_000]) {
    const input = sample(bytes)
    const started = performance.now()
    formatJson(input)
    jsonToYaml(input)
    yamlToJson(jsonToYaml(input).output)
    const elapsed = performance.now() - started
    console.log(
      `${bytes / 1_000_000} MB 旧组合（仅诊断）: ${elapsed.toFixed(1)} ms（JSON 格式化 + 2×JSON→YAML + YAML→JSON）`,
    )
  }
  if (failures.length) throw new Error(failures.join('\n'))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) benchmark()
