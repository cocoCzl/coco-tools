import { RawNumber, parseCompactJson, visitArrayItems, type CompactJson } from './compact-json.ts'
import { LimitedWriter, MAX_NESTING_DEPTH } from './limits.ts'

/** Semantic output: strings are decoded; number tokens never pass through Number. */
export function stringifyYamlSubset(value: CompactJson): string {
  return renderYaml(value)
}

function renderYaml(value?: CompactJson, rootArraySource?: string): string {
  const writer = new LimitedWriter()
  const scalar = (item: CompactJson): string | undefined => {
    if (item instanceof RawNumber) return item.raw
    if (item === null) return 'null'
    if (typeof item === 'boolean') return String(item)
    if (typeof item === 'string') return plainString(item) ? item : JSON.stringify(item)
    if (Array.isArray(item) && !item.length) return '[]'
    if (!Array.isArray(item) && !Object.keys(item).length) return '{}'
  }
  const render = (item: CompactJson, depth: number): void => {
    if (depth > MAX_NESTING_DEPTH) throw new Error(`YAML 嵌套不能超过 ${MAX_NESTING_DEPTH} 层。`)
    const pad = '  '.repeat(depth)
    const atom = scalar(item)
    if (atom !== undefined) {
      writer.write(`${pad}${atom}\n`)
      return
    }
    if (Array.isArray(item)) {
      for (const child of item) {
        const text = scalar(child)
        writer.write(`${pad}-${text === undefined ? '' : ` ${text}`}\n`)
        if (text === undefined) render(child, depth + 1)
      }
    } else {
      for (const [key, child] of Object.entries(item!)) {
        const text = scalar(child)
        writer.write(
          `${pad}${plainString(key) ? key : JSON.stringify(key)}:${text === undefined ? '' : ` ${text}`}\n`,
        )
        if (text === undefined) render(child, depth + 1)
      }
    }
  }
  if (rootArraySource !== undefined) {
    const count = visitArrayItems(rootArraySource, (child) => {
      const text = scalar(child)
      writer.write(`-${text === undefined ? '' : ` ${text}`}\n`)
      if (text === undefined) render(child, 1)
    })
    if (!count) writer.write('[]\n')
  } else render(value!, 0)
  return writer.finish()
}

function plainString(value: string): boolean {
  return (
    /^[A-Za-z_][\w ./-]*$/.test(value) &&
    !value.endsWith(' ') &&
    !/^(?:null|true|false|yes|no|on|off)$/i.test(value)
  )
}

export function jsonToYamlSubset(source: string): string {
  return source.trimStart().startsWith('[')
    ? renderYaml(undefined, source)
    : stringifyYamlSubset(parseCompactJson(source))
}
