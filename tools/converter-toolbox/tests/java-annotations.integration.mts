import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, delimiter, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { generateJava } from '../src/core/operations.ts'

// Explicit jars keep the regular offline test suite independent of Maven/network access.
const lombok = process.env.LOMBOK_JAR
const jackson = process.env.JACKSON_ANNOTATIONS_JAR
const jars = [
  [lombok, '1e1e427c36ff63c44fd30ef292d9e773ea3154460ab6265d3fed7e6f5bc50fb9'],
  [jackson, 'e516743a316dcf83c572ffc9cb6e8c5e8c134880c8c5155b02f7b34e9c5dc3cf'],
] as const

test('真实 Lombok 1.18.38 注解处理器：单独及结合 Jackson 2.19.2，核实字段类型与每个访问器', async () => {
  assert.ok(lombok && jackson, '请设置 LOMBOK_JAR 和 JACKSON_ANNOTATIONS_JAR，参见 README。')
  for (const [path, digest] of jars)
    assert.equal(
      createHash('sha256')
        .update(await readFile(path!))
        .digest('hex'),
      digest,
    )
  const directory = await mkdtemp(join(tmpdir(), 'converter-annotations-'))
  try {
    for (const useJackson of [false, true]) {
      const classpath = [resolve(lombok), ...(useJackson ? [resolve(jackson)] : [])].join(delimiter)
      for (const rootClassName of ['String', 'List', 'Data', 'JsonProperty']) {
        const result = generateJava(
          '{"string":{"x":1},"object":{"x":1},"list":{"x":1},"data":{"x":1},"jsonProperty":{"x":1},"s":"abc","i":1,"l":9007199254740993,"b":true,"items":[{"name":"first"},{"active":true}],"matrix":[[{"value":1}]],"huge":9223372036854775808,"decimal":1.234567890123456789,"class":"c","get-class":"g","ß":"s","ss":"ss","xY":"upper","Xy":"lower"}',
          { rootClassName, lombok: true, jackson: useJackson },
        )
        const root = result.fileName!.slice(0, -5)
        await writeFile(join(directory, result.fileName!), result.output)
        await writeFile(
          join(directory, 'Verify.java'),
          `
public class Verify {
  public static void main(String[] args) throws Exception {
    Class<?> root = ${root}.class;
    check(root, "s", java.lang.String.class);
    check(root, "i", java.lang.Integer.class);
    check(root, "l", java.lang.Long.class);
    check(root, "b", java.lang.Boolean.class);
    check(root, "items", java.util.List.class);
    if (!root.getDeclaredField("items").getGenericType().getTypeName().equals("java.util.List<${root}$ItemsItem>")) throw new AssertionError("object array type");
    if (!root.getDeclaredField("matrix").getGenericType().getTypeName().equals("java.util.List<java.util.List<${root}$MatrixItemItem>>")) throw new AssertionError("nested array type");
    check(${root}.ItemsItem.class, "name", java.lang.String.class);
    check(${root}.ItemsItem.class, "active", java.lang.Boolean.class);
    check(${root}.MatrixItemItem.class, "value", java.lang.Integer.class);
    check(root, "huge", java.math.BigInteger.class);
    check(root, "decimal", java.math.BigDecimal.class);
    verifyAccessors(root);
    ${useJackson ? 'if (!root.getDeclaredField("classValue").getAnnotation(com.fasterxml.jackson.annotation.JsonProperty.class).value().equals("class")) throw new AssertionError("JSON mapping");' : ''}
  }
  static void check(Class<?> type, String name, Class<?> expected) throws Exception {
    if (type.getDeclaredField(name).getType() != expected) throw new AssertionError(name);
  }
  static void verifyAccessors(Class<?> type) throws Exception {
    Object instance = type.getConstructor().newInstance();
    for (java.lang.reflect.Field field : type.getDeclaredFields()) {
      if (java.lang.reflect.Modifier.isStatic(field.getModifiers())) continue;
      String cap = field.getName().substring(0, 1).toUpperCase(java.util.Locale.ROOT) + field.getName().substring(1);
      java.lang.reflect.Method setter = type.getDeclaredMethod("set" + cap, field.getType());
      java.lang.reflect.Method getter = type.getDeclaredMethod("get" + cap);
      Object value = field.getType() == String.class ? field.getName() : null;
      setter.invoke(instance, value);
      if (!java.util.Objects.equals(getter.invoke(instance), value)) throw new AssertionError(field.getName());
    }
    for (Class<?> nested : type.getDeclaredClasses()) verifyAccessors(nested);
  }
}`,
        )
        execFileSync(
          'javac',
          [
            '-encoding',
            'UTF-8',
            '-cp',
            classpath,
            '-processorpath',
            resolve(lombok),
            '-processor',
            'lombok.launch.AnnotationProcessorHider$AnnotationProcessor',
            result.fileName!,
            'Verify.java',
          ],
          { cwd: directory },
        )
        execFileSync('java', ['-cp', [directory, classpath].join(delimiter), 'Verify'], {
          cwd: directory,
        })
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
