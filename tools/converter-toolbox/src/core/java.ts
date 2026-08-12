import { ToolError } from './errors.ts'
import { isCompactObject, RawNumber, visitRootObjects, type CompactJson } from './compact-json.ts'

export type JavaOptions = { rootClassName?: string; packageName?: string; jackson?: boolean; lombok?: boolean }
export type JavaResult = { output: string; warnings: string[]; fileName: string }
type Type = { name: string; model?: Model; item?: Type }
type Field = { original: string; name: string; type: Type }
type Model = { name: string; fields: Field[] }
type Context = { warnings: string[]; classNames: Set<string> }
const keywords = new Set(['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while','true','false','null','record','sealed','permits','yield','var'])

export function generateJavaDataClass(input: string, options: JavaOptions = {}): JavaResult {
  const rootName = className(options.rootClassName?.trim() || 'Root', 'Root')
  if (options.packageName?.trim() && !/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(options.packageName.trim())) throw new ToolError('INVALID_PACKAGE', '包名必须由合法 Java 标识符组成，并使用点号分隔。')
  const context: Context = { warnings: [], classNames: new Set([rootName]) }
  const root: Model = { name: rootName, fields: [] }
  visitRootObjects(input, (object) => mergeObject(root, object, context))
  for (const field of root.fields) warnUnknown(field.type, field.original, context)
  if (!root.fields.length) context.warnings.push('根对象没有可推断字段，已生成空数据类。')
  const jackson = options.jackson ?? true
  const lombok = options.lombok ?? false
  return { output: render(root, options.packageName?.trim() || '', jackson, lombok, context.warnings), warnings: [...new Set(context.warnings)], fileName: `${rootName}.java` }
}

function mergeObject(model: Model, object: { [key: string]: CompactJson }, context: Context): void {
  const used = new Set(model.fields.map((field) => field.name))
  for (const [original, value] of Object.entries(object)) {
    const existing = model.fields.find((field) => field.original === original)
    if (existing) existing.type = mergeType(existing.type, value, original, context)
    else { const name = unique(fieldName(original), used); if (name !== original) context.warnings.push(`字段“${original}”已规范化为“${name}”。`); model.fields.push({ original, name, type: inferValue(value, original, context) }) }
  }
}
function inferValue(value: CompactJson, field: string, context: Context): Type {
  if (value === null) return primitive('Null')
  if (value instanceof RawNumber) return primitive(numberType([value]))
  if (typeof value === 'string') return primitive('String')
  if (typeof value === 'boolean') return primitive('Boolean')
  if (Array.isArray(value)) { let item = primitive('Null'); for (const entry of value) item = mergeType(item, entry, `${field} 的数组元素`, context); return list(item) }
  const base = className(field, 'NestedObject'); const name = unique(base, context.classNames); const model: Model = { name, fields: [] }; mergeObject(model, value, context); return { name, model }
}
function mergeType(type: Type, value: CompactJson, field: string, context: Context): Type {
  if (value === null) return type
  if (type.name === 'Null') return inferValue(value, field, context)
  if (type.name === 'Object') return type
  if (value instanceof RawNumber && ['Integer', 'Long', 'BigInteger', 'BigDecimal'].includes(type.name)) return primitive(widerNumber(type.name, numberType([value])))
  if (typeof value === 'string' && type.name === 'String' || typeof value === 'boolean' && type.name === 'Boolean') return type
  if (isCompactObject(value) && type.model) { mergeObject(type.model, value, context); return type }
  if (Array.isArray(value) && type.name === 'List') { for (const entry of value) type.item = mergeType(type.item!, entry, `${field} 的数组元素`, context); return type }
  context.warnings.push(`字段“${field}”包含不兼容类型，已使用 Object。`); return primitive('Object')
}
function widerNumber(left: string, right: string): string { const order = ['Integer', 'Long', 'BigInteger', 'BigDecimal']; return order[Math.max(order.indexOf(left), order.indexOf(right))] }
function warnUnknown(type: Type, field: string, context: Context): void { if (type.name === 'Null') context.warnings.push(`字段“${field}”全部为 null，已使用 Object。`); else if (type.name === 'List' && type.item?.name === 'Null') context.warnings.push(`字段“${field}”是空数组或仅包含 null，已使用 List<Object>。`); if (type.item) warnUnknown(type.item, `${field} 的数组元素`, context); if (type.model) for (const child of type.model.fields) warnUnknown(child.type, child.original, context) }
function numberType(nodes: RawNumber[]): string { const kinds = nodes.map((node) => /[.eE]/.test(node.raw) ? 'BigDecimal' : integerType(node.raw)); if (kinds.includes('BigDecimal')) return 'BigDecimal'; if (kinds.includes('BigInteger')) return 'BigInteger'; if (kinds.includes('Long')) return 'Long'; return 'Integer' }
function integerType(raw: string): string { const value = BigInt(raw); return value >= -2147483648n && value <= 2147483647n ? 'Integer' : value >= -9223372036854775808n && value <= 9223372036854775807n ? 'Long' : 'BigInteger' }
function primitive(name: string): Type { return { name } }; function list(item: Type): Type { return { name: 'List', item } }
function render(root: Model, packageName: string, jackson: boolean, lombok: boolean, warnings: string[]): string {
  const imports = new Set<string>(); visit(root, (type) => { if (type.name === 'List') imports.add('java.util.List'); if (type.name === 'BigInteger') imports.add('java.math.BigInteger'); if (type.name === 'BigDecimal') imports.add('java.math.BigDecimal') })
  const renamed = models(root).flatMap((item) => item.fields).some((field) => field.name !== field.original)
  if (jackson && renamed) imports.add('com.fasterxml.jackson.annotation.JsonProperty'); if (!jackson && renamed) warnings.push('Jackson 已关闭，规范化字段可能需要手工配置原始 JSON 映射。'); if (lombok) imports.add('lombok.Data')
  return [...(packageName ? [`package ${packageName};`, ''] : []), ...(imports.size ? [...imports].sort().map((item) => `import ${item};`).concat('') : []), classSource(root, jackson, lombok, 0, false), ''].join('\n')
}
function classSource(item: Model, jackson: boolean, lombok: boolean, depth: number, isNested: boolean): string { const pad = '    '.repeat(depth), body = '    '.repeat(depth + 1); const lines = [...(lombok ? [`${pad}@Data`] : []), `${pad}public ${isNested ? 'static ' : ''}class ${item.name} {`]; for (const field of item.fields) { if (jackson && field.name !== field.original) lines.push(`${body}@JsonProperty(${JSON.stringify(field.original)})`); lines.push(`${body}private ${typeSource(field.type)} ${field.name};`, '') }; if (!lombok) for (const field of item.fields) { const cap = field.name[0].toUpperCase() + field.name.slice(1), type = typeSource(field.type); lines.push(`${body}public ${type} get${cap}() { return ${field.name}; }`, '', `${body}public void set${cap}(${type} ${field.name}) { this.${field.name} = ${field.name}; }`, '') }; for (const child of children(item)) lines.push(classSource(child, jackson, lombok, depth + 1, true), ''); while (lines.at(-1) === '') lines.pop(); lines.push(`${pad}}`); return lines.join('\n') }
function typeSource(type: Type): string { return type.name === 'List' ? `List<${typeSource(type.item!)}>` : type.name === 'Null' ? 'Object' : type.name }
function children(model: Model): Model[] { return model.fields.flatMap((field) => child(field.type)) }; function child(type: Type): Model[] { return type.model ? [type.model] : type.item ? child(type.item) : [] }; function models(root: Model): Model[] { return [root, ...children(root).flatMap(models)] }; function visit(model: Model, fn: (type: Type) => void) { for (const field of model.fields) walk(field.type, fn) }; function walk(type: Type, fn: (type: Type) => void) { fn(type); if (type.item) walk(type.item, fn); if (type.model) visit(type.model, fn) }
function unique(base: string, used: Set<string>): string { let value = base, suffix = 2; while (used.has(value)) value = `${base}${suffix++}`; used.add(value); return value }
function words(value: string): string[] { const text = value.replace(/([\p{Ll}\d])([\p{Lu}])/gu, '$1 $2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); return text ? text.split(/\s+/u) : [] }
function className(value: string, fallback: string): string { let result = words(value).map((part) => part[0].toLocaleUpperCase() + part.slice(1).toLocaleLowerCase()).join('') || fallback; if (!/^[$_\p{L}]/u.test(result)) result = `Value${result}`; return keywords.has(result) ? `${result}Type` : result }
function fieldName(value: string): string { const parts = words(value); let result = parts.length ? parts[0].toLocaleLowerCase() + parts.slice(1).map((part) => part[0].toLocaleUpperCase() + part.slice(1).toLocaleLowerCase()).join('') : 'value'; if (!/^[$_\p{L}]/u.test(result)) result = `value${result[0]?.toLocaleUpperCase() ?? ''}${result.slice(1)}`; return keywords.has(result) ? `${result}Value` : result }
