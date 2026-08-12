import { performance } from 'node:perf_hooks'
import { formatJson, generateJava, yamlToJson } from '../src/core/operations.ts'

const name = process.argv[2]
const jsonRow = '{"id":123456,"name":"converter-toolbox","items":[1,2,3],"enabled":true}'
const yamlRow = '- id: 123456\n  name: converter-toolbox\n  items: [1, 2, 3]\n  enabled: true\n'
const json = `[${Array(Math.floor(20_000_000 / (jsonRow.length + 1))).fill(jsonRow).join(',')}]`
const yaml = yamlRow.repeat(Math.floor(20_000_000 / yamlRow.length))
global.gc?.()
const before = process.memoryUsage().heapUsed
const started = performance.now()
const output = name === 'format' ? formatJson(json).output : name === 'java' ? generateJava(json).output : name === 'yaml-json' ? yamlToJson(yaml).output : ''
const elapsed = performance.now() - started
const heap = Math.max(0, process.memoryUsage().heapUsed - before)
console.log(JSON.stringify({ name, elapsed, heap, outputBytes: Buffer.byteLength(output) }))
