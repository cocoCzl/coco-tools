import { ToolError } from './errors.ts'
import { parseJson, type JsonArrayNode, type JsonNode, type JsonObjectNode } from './json.ts'

export type JavaGeneratorOptions = {
  rootClassName?: string
  packageName?: string
  useJackson?: boolean
  useLombok?: boolean
}

export type JavaGeneratorResult = {
  output: string
  warnings: string[]
  fileName: string
}

type PrimitiveName = 'String' | 'Boolean' | 'Integer' | 'Long' | 'BigInteger' | 'BigDecimal' | 'Object'
type JavaType =
  | { kind: 'primitive'; name: PrimitiveName }
  | { kind: 'list'; element: JavaType }
  | { kind: 'class'; model: ClassModel }

type FieldModel = {
  originalName: string
  javaName: string
  type: JavaType
}

type ClassModel = {
  name: string
  fields: FieldModel[]
}

type GenerationContext = {
  warnings: string[]
  usedClassNames: Set<string>
}

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null', 'record', 'sealed', 'permits', 'yield', 'var',
])

const INT_MIN = -2147483648n
const INT_MAX = 2147483647n
const LONG_MIN = -9223372036854775808n
const LONG_MAX = 9223372036854775807n

export function generateJavaDataClass(input: string, options: JavaGeneratorOptions = {}): JavaGeneratorResult {
  const rootNode = parseJson(input)
  const warnings: string[] = []
  const requestedRootName = options.rootClassName?.trim() || 'Root'
  const rootClassName = toClassName(requestedRootName, 'Root')
  if (requestedRootName !== rootClassName) warnings.push(`根类名已规范化为“${rootClassName}”。`)
  validatePackage(options.packageName ?? '')

  const context: GenerationContext = { warnings, usedClassNames: new Set([rootClassName]) }
  let rootObjects: JsonObjectNode[]
  if (rootNode.kind === 'object') rootObjects = [rootNode]
  else if (rootNode.kind === 'array') {
    if (rootNode.items.length === 0) throw new ToolError('EMPTY_ROOT_ARRAY', '空数组无法推断 Java 数据类。')
    const invalidIndex = rootNode.items.findIndex((item) => item.kind !== 'object')
    if (invalidIndex >= 0) {
      throw new ToolError('MIXED_ROOT_ARRAY', `根数组第 ${invalidIndex + 1} 个元素不是对象，无法生成数据类。`)
    }
    rootObjects = rootNode.items as JsonObjectNode[]
  } else {
    throw new ToolError('JAVA_ROOT_OBJECT', '生成 Java 数据类时，根节点必须是对象或对象数组。')
  }

  const root = buildClass(rootClassName, rootObjects, context)
  if (root.fields.length === 0) warnings.push('根对象没有可推断字段，已生成空数据类。')
  const useJackson = options.useJackson ?? true
  const useLombok = options.useLombok ?? false
  const packageName = options.packageName?.trim() ?? ''
  const output = renderJava(root, { packageName, useJackson, useLombok }, warnings)
  return { output, warnings: unique(warnings), fileName: `${rootClassName}.java` }
}

function buildClass(name: string, objects: JsonObjectNode[], context: GenerationContext): ClassModel {
  const grouped = new Map<string, JsonNode[]>()
  const order: string[] = []
  for (const object of objects) {
    for (const entry of object.entries) {
      if (!grouped.has(entry.key)) {
        grouped.set(entry.key, [])
        order.push(entry.key)
      }
      grouped.get(entry.key)?.push(entry.value)
    }
  }

  const usedFieldNames = new Set<string>()
  const fields = order.map((originalName) => {
    const baseName = toFieldName(originalName)
    const javaName = uniqueName(baseName, usedFieldNames)
    if (javaName !== baseName) context.warnings.push(`字段“${originalName}”命名冲突，已调整为“${javaName}”。`)
    else if (javaName !== originalName) context.warnings.push(`字段“${originalName}”已规范化为“${javaName}”。`)
    const type = inferType(grouped.get(originalName) ?? [], originalName, context)
    return { originalName, javaName, type }
  })
  return { name, fields }
}

function inferType(nodes: JsonNode[], fieldName: string, context: GenerationContext): JavaType {
  const concrete = nodes.filter((node) => node.kind !== 'null')
  if (concrete.length === 0) {
    context.warnings.push(`字段“${fieldName}”全部为 null，已使用 Object。`)
    return primitive('Object')
  }
  if (concrete.every((node) => node.kind === 'number')) return mergeNumberTypes(concrete)
  if (concrete.every((node) => node.kind === 'string')) return primitive('String')
  if (concrete.every((node) => node.kind === 'boolean')) return primitive('Boolean')
  if (concrete.every((node) => node.kind === 'object')) {
    const className = reserveClassName(toClassName(fieldName, 'NestedObject'), context)
    return { kind: 'class', model: buildClass(className, concrete as JsonObjectNode[], context) }
  }
  if (concrete.every((node) => node.kind === 'array')) return inferArrays(concrete as JsonArrayNode[], fieldName, context)
  context.warnings.push(`字段“${fieldName}”包含不兼容类型，已使用 Object。`)
  return primitive('Object')
}

function inferArrays(arrays: JsonArrayNode[], fieldName: string, context: GenerationContext): JavaType {
  const items = arrays.flatMap((array) => array.items).filter((node) => node.kind !== 'null')
  if (items.length === 0) {
    context.warnings.push(`字段“${fieldName}”是空数组或仅包含 null，已使用 List<Object>。`)
    return { kind: 'list', element: primitive('Object') }
  }
  if (items.every((item) => item.kind === 'number')) return { kind: 'list', element: mergeNumberTypes(items) }
  if (items.every((item) => item.kind === 'string')) return { kind: 'list', element: primitive('String') }
  if (items.every((item) => item.kind === 'boolean')) return { kind: 'list', element: primitive('Boolean') }
  if (items.every((item) => item.kind === 'object')) {
    const className = reserveClassName(`${toClassName(fieldName, 'Item')}Item`, context)
    return { kind: 'list', element: { kind: 'class', model: buildClass(className, items as JsonObjectNode[], context) } }
  }
  if (items.every((item) => item.kind === 'array')) {
    const nested = inferArrays(items as JsonArrayNode[], `${fieldName}Item`, context)
    return { kind: 'list', element: nested }
  }
  context.warnings.push(`字段“${fieldName}”的数组元素类型不一致，已使用 List<Object>。`)
  return { kind: 'list', element: primitive('Object') }
}

function mergeNumberTypes(nodes: JsonNode[]): JavaType {
  const names = nodes.map((node) => numberType((node as Extract<JsonNode, { kind: 'number' }>).raw))
  if (names.includes('BigDecimal')) return primitive('BigDecimal')
  if (names.includes('BigInteger')) return primitive('BigInteger')
  if (names.includes('Long')) return primitive('Long')
  return primitive('Integer')
}

function numberType(raw: string): PrimitiveName {
  if (/[.eE]/.test(raw)) return 'BigDecimal'
  const value = BigInt(raw)
  if (value >= INT_MIN && value <= INT_MAX) return 'Integer'
  if (value >= LONG_MIN && value <= LONG_MAX) return 'Long'
  return 'BigInteger'
}

function primitive(name: PrimitiveName): JavaType {
  return { kind: 'primitive', name }
}

function renderJava(
  root: ClassModel,
  options: { packageName: string; useJackson: boolean; useLombok: boolean },
  warnings: string[],
): string {
  const imports = new Set<string>()
  visitTypes(root, (type) => {
    if (type.kind === 'list') imports.add('java.util.List')
    if (type.kind === 'primitive' && type.name === 'BigInteger') imports.add('java.math.BigInteger')
    if (type.kind === 'primitive' && type.name === 'BigDecimal') imports.add('java.math.BigDecimal')
  })
  const renamedFields = collectClasses(root).flatMap((model) => model.fields).filter((field) => field.javaName !== field.originalName)
  if (options.useJackson && renamedFields.length > 0) imports.add('com.fasterxml.jackson.annotation.JsonProperty')
  if (!options.useJackson && renamedFields.length > 0) {
    warnings.push('Jackson 已关闭，规范化字段可能需要手工配置原始 JSON 映射。')
  }
  if (options.useLombok) imports.add('lombok.Data')

  const lines: string[] = []
  if (options.packageName) lines.push(`package ${options.packageName};`, '')
  if (imports.size > 0) lines.push(...[...imports].sort().map((item) => `import ${item};`), '')
  lines.push(renderClass(root, options, 0, false), '')
  return lines.join('\n')
}

function renderClass(
  model: ClassModel,
  options: { useJackson: boolean; useLombok: boolean },
  depth: number,
  nested: boolean,
): string {
  const pad = '    '.repeat(depth)
  const bodyPad = '    '.repeat(depth + 1)
  const lines: string[] = []
  if (options.useLombok) lines.push(`${pad}@Data`)
  lines.push(`${pad}public ${nested ? 'static ' : ''}class ${model.name} {`)

  for (const field of model.fields) {
    if (options.useJackson && field.javaName !== field.originalName) {
      lines.push(`${bodyPad}@JsonProperty(${javaString(field.originalName)})`)
    }
    lines.push(`${bodyPad}private ${renderType(field.type)} ${field.javaName};`)
    lines.push('')
  }

  if (!options.useLombok) {
    for (const field of model.fields) {
      const suffix = upperFirst(field.javaName)
      lines.push(`${bodyPad}public ${renderType(field.type)} get${suffix}() {`)
      lines.push(`${bodyPad}    return ${field.javaName};`)
      lines.push(`${bodyPad}}`, '')
      lines.push(`${bodyPad}public void set${suffix}(${renderType(field.type)} ${field.javaName}) {`)
      lines.push(`${bodyPad}    this.${field.javaName} = ${field.javaName};`)
      lines.push(`${bodyPad}}`, '')
    }
  }

  for (const nestedModel of directNestedClasses(model)) {
    lines.push(renderClass(nestedModel, options, depth + 1, true), '')
  }

  while (lines.at(-1) === '') lines.pop()
  lines.push(`${pad}}`)
  return lines.join('\n')
}

function renderType(type: JavaType): string {
  if (type.kind === 'primitive') return type.name
  if (type.kind === 'class') return type.model.name
  return `List<${renderType(type.element)}>`
}

function directNestedClasses(model: ClassModel): ClassModel[] {
  const classes: ClassModel[] = []
  for (const field of model.fields) collectDirect(field.type, classes)
  return classes
}

function collectDirect(type: JavaType, output: ClassModel[]): void {
  if (type.kind === 'class') output.push(type.model)
  else if (type.kind === 'list') collectDirect(type.element, output)
}

function collectClasses(root: ClassModel): ClassModel[] {
  const output = [root]
  for (const model of directNestedClasses(root)) output.push(...collectClasses(model))
  return output
}

function visitTypes(model: ClassModel, visitor: (type: JavaType) => void): void {
  for (const field of model.fields) {
    visitType(field.type, visitor)
  }
}

function visitType(type: JavaType, visitor: (type: JavaType) => void): void {
  visitor(type)
  if (type.kind === 'list') visitType(type.element, visitor)
  if (type.kind === 'class') visitTypes(type.model, visitor)
}

function reserveClassName(base: string, context: GenerationContext): string {
  const name = uniqueName(base, context.usedClassNames)
  if (name !== base) context.warnings.push(`嵌套类名“${base}”冲突，已调整为“${name}”。`)
  return name
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base
  let suffix = 2
  while (used.has(name)) {
    name = `${base}${suffix}`
    suffix += 1
  }
  used.add(name)
  return name
}

function words(value: string): string[] {
  const spaced = value
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  return spaced ? spaced.split(/\s+/u) : []
}

function toClassName(value: string, fallback: string): string {
  const parts = words(value)
  let name = parts.map((part) => upperFirst(part.toLocaleLowerCase())).join('') || fallback
  if (!/^[$_\p{L}]/u.test(name)) name = `Value${name}`
  if (JAVA_KEYWORDS.has(name)) name = `${name}Type`
  return name
}

function toFieldName(value: string): string {
  const parts = words(value)
  let name = parts.length
    ? parts[0].toLocaleLowerCase() + parts.slice(1).map((part) => upperFirst(part.toLocaleLowerCase())).join('')
    : 'value'
  if (!/^[$_\p{L}]/u.test(name)) name = `value${upperFirst(name)}`
  if (JAVA_KEYWORDS.has(name)) name = `${name}Value`
  return name
}

function upperFirst(value: string): string {
  return value ? value[0].toLocaleUpperCase() + value.slice(1) : value
}

function javaString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`
}

function validatePackage(packageName: string): void {
  if (!packageName.trim()) return
  if (!/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/.test(packageName.trim())) {
    throw new ToolError('INVALID_PACKAGE', '包名必须由合法 Java 标识符组成，并使用点号分隔。')
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
