import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateJava } from '../src/core/operations.ts'

const data =
  '{"string":{"x":1},"object":{"x":2},"integer":{"x":3},"long":{"x":4},"boolean":{"x":5},"list":{"x":6},"bigInteger":{"x":7},"bigDecimal":{"x":8},"s":"abc","i":1,"l":9007199254740993,"b":true,"items":[1],"huge":9223372036854775808,"decimal":1.234567890123456789,"class":"c","get-class":"v","ß":"s","ss":"ss"}'

const arrayData =
  '[{"items":[null,{"id":1,"tags":[{"label":"x"}]}],"matrix":[[],[{"value":1}]],"订单":[{"编号":1}],"itemsItem":{"value":true}},{"items":[{"enabled":true,"tags":[{"active":true}]}],"matrix":[[{"label":"x"}]]}]'

test('对象数组和嵌套数组使用独立命名依据，保留用户中文名称及中文诊断', () => {
  for (const [input, rootClassName, declaration] of [
    ['{"items":[{"x":1}]}', 'Root', 'private List<ItemsItem> items;'],
    ['{"matrix":[[],[null,{"x":1}]]}', 'Root', 'private List<List<MatrixItemItem>> matrix;'],
    ['{"订单":[{"编号":1}]}', 'Root', 'private List<订单Item> 订单;'],
    ['{"我的数组元素":[{"原始字段":1}]}', 'Root', 'private List<我的数组元素Item> 我的数组元素;'],
    ['{"items":[{"x":1}]}', 'ItemsItem', 'private List<ItemsItem2> items;'],
    [arrayData, 'ArraysCase', 'private List<ItemsItem> items;'],
  ]) {
    const result = generateJava(input, { rootClassName, jackson: false })
    assert.ok(result.output.includes(declaration), result.output)
    assert.deepEqual(result, generateJava(input, { rootClassName, jackson: false }))
  }
  const result = generateJava('{"items":[[{"x":1},true]]}', { jackson: false })
  assert.deepEqual(result.warnings, [
    '字段“items 的数组元素 的数组元素”包含不兼容类型，已使用 Object。',
  ])
  assert.match(result.output, /private List<List<Object>> items;/)
})

test('Java 类、访问器和实际使用类型不冲突，命名确定', () => {
  for (const rootClassName of [
    'String',
    'Object',
    'Integer',
    'Long',
    'Boolean',
    'List',
    'BigInteger',
    'BigDecimal',
  ]) {
    const result = generateJava(data, { rootClassName, jackson: false })
    assert.notEqual(result.fileName, `${rootClassName}.java`)
    assert.match(result.output, /private String s;/)
    assert.match(result.output, /private Long l;/)
    assert.match(result.output, /private BigInteger huge;/)
    assert.match(result.output, /private BigDecimal decimal;/)
    assert.match(
      result.output,
      new RegExp(`private String${rootClassName === 'String' ? '3' : '2'} string;`),
    )
    assert.deepEqual(result, generateJava(data, { rootClassName, jackson: false }))
    assert.ok(result.warnings?.some((message) => message.includes('冲突')))
  }
  for (const packageName of [
    'com.class',
    'com.true',
    'com._',
    'com.9bad',
    'com..x',
    'com.null',
    'com.record',
  ]) {
    assert.throws(() => generateJava('{}', { packageName }), /包名/)
  }
  assert.throws(() => generateJava('[{"a":1},]'), /逗号/)
})

test('真实 javac 编译并通过反射核实生成字段的 Java 类型', async (t) => {
  if (spawnSync('javac', ['-version']).status !== 0) {
    if (process.env.CI) assert.fail('CI 必须安装 JDK 执行 Java 编译验证。')
    t.skip('本地缺少 javac；CI 必须运行。')
    return
  }
  const directory = await mkdtemp(join(tmpdir(), 'converter-java-'))
  try {
    const result = generateJava(data, { rootClassName: 'String', jackson: false })
    await writeFile(join(directory, result.fileName!), result.output)
    await writeFile(
      join(directory, 'Verify.java'),
      `
public class Verify {
  public static void main(String[] args) throws Exception {
    Class<?> root = String2.class;
    check(root, "s", java.lang.String.class);
    check(root, "i", java.lang.Integer.class);
    check(root, "l", java.lang.Long.class);
    check(root, "b", java.lang.Boolean.class);
    check(root, "items", java.util.List.class);
    check(root, "huge", java.math.BigInteger.class);
    check(root, "decimal", java.math.BigDecimal.class);
    if (!root.getDeclaredField("string").getType().getSimpleName().equals("String3")) throw new AssertionError("nested string");
  }
  static void check(Class<?> root, String name, Class<?> expected) throws Exception {
    if (root.getDeclaredField(name).getType() != expected) throw new AssertionError(name);
  }
}`,
    )
    // Root String2 reserves its own name, so nested String becomes String3.
    execFileSync('javac', ['-encoding', 'UTF-8', result.fileName!, 'Verify.java'], {
      cwd: directory,
    })
    execFileSync('java', ['-cp', directory, 'Verify'], { cwd: directory })
    const merged = generateJava(
      '[{"node":{"x":1},"items":[{"a":1}]},{"node":{"y":"x"},"items":[{"b":false}]}]',
      { rootClassName: 'Merged', jackson: false },
    )
    await writeFile(join(directory, merged.fileName!), merged.output)
    execFileSync('javac', [merged.fileName!], { cwd: directory })
    const arrays = generateJava(arrayData, { rootClassName: 'ArraysCase', jackson: false })
    await writeFile(join(directory, arrays.fileName!), arrays.output)
    await writeFile(
      join(directory, 'VerifyArrays.java'),
      `
public class VerifyArrays {
  public static void main(String[] args) throws Exception {
    generic(ArraysCase.class, "items", "java.util.List<ArraysCase$ItemsItem>");
    generic(ArraysCase.class, "matrix", "java.util.List<java.util.List<ArraysCase$MatrixItemItem>>");
    generic(ArraysCase.class, "订单", "java.util.List<ArraysCase$订单Item>");
    generic(ArraysCase.ItemsItem.class, "tags", "java.util.List<ArraysCase$ItemsItem$TagsItem>");
    check(ArraysCase.ItemsItem.class, "id", Integer.class);
    check(ArraysCase.ItemsItem.class, "enabled", Boolean.class);
    check(ArraysCase.ItemsItem.TagsItem.class, "label", String.class);
    check(ArraysCase.ItemsItem.TagsItem.class, "active", Boolean.class);
    check(ArraysCase.MatrixItemItem.class, "value", Integer.class);
    check(ArraysCase.MatrixItemItem.class, "label", String.class);
    check(ArraysCase.订单Item.class, "编号", Integer.class);
    check(ArraysCase.class, "itemsItem", ArraysCase.ItemsItem2.class);
    if (!ArraysCase.class.getDeclaredMethod("getItems").getGenericReturnType().equals(
          ArraysCase.class.getDeclaredField("items").getGenericType())) throw new AssertionError("getter type");
    ArraysCase.class.getDeclaredMethod("setItems", java.util.List.class);
  }
  static void generic(Class<?> owner, String field, String expected) throws Exception {
    if (!owner.getDeclaredField(field).getGenericType().getTypeName().equals(expected)) throw new AssertionError(field);
  }
  static void check(Class<?> owner, String field, Class<?> expected) throws Exception {
    if (owner.getDeclaredField(field).getType() != expected) throw new AssertionError(field);
  }
}`,
    )
    execFileSync('javac', ['-encoding', 'UTF-8', arrays.fileName!, 'VerifyArrays.java'], {
      cwd: directory,
    })
    execFileSync('java', ['-cp', directory, 'VerifyArrays'], { cwd: directory })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
