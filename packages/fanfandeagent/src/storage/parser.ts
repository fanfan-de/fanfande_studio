import {z} from "zod/v4"
import {
  $ZodType,
  $ZodOptional,
  $ZodNullable,
  $ZodDefault,
  $ZodPipe,
  $ZodString,
  $ZodNumber,
  $ZodBoolean,
  $ZodBigInt,
  $ZodDate,
  $ZodEnum,
  $ZodLiteral,
  $ZodArray,
  $ZodObject,
} from "zod/v4/core";


//Zod Schema → SQLite 表定义转换器

// ============ 类型定义 ============

export interface SQLiteColumnDef {
  name: string;
  type: "TEXT" | "INTEGER" | "REAL" | "BLOB" | "NUMERIC";
  nullable: boolean;
  primaryKey: boolean;
  defaultValue?: unknown;
  unique: boolean;
}

type ColumnDefMap<T extends z.ZodRawShape> = {
  [K in keyof T]: SQLiteColumnDef;
};



// ============ 解包结果 ============

interface UnwrapResult {
  base: $ZodType;
  nullable: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
}

// ============ 递归解包 ============

function unwrapZodType(schema: z.ZodType): UnwrapResult {
  let nullable = false;
  let hasDefault = false;
  let defaultValue: unknown = undefined;
  let current: $ZodType = schema;

  while (true) {
    if (current instanceof z.ZodOptional) {
      nullable = true;
      current = current.unwrap();
    } else if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      hasDefault = true;
      defaultValue = current.def.defaultValue;
      current = current.unwrap();
    } else if (current instanceof z.ZodPipe) {
      // pipeline: 取输入端
      current = current.def.in;
    } else {
      return { base: current, nullable, hasDefault, defaultValue };
    }
  }
}

// ============ Zod 基础类型 → SQLite 类型 ============

function zodToSQLiteType(schema: $ZodType): SQLiteColumnDef["type"] {
  if (schema instanceof z.ZodString) return "TEXT";
  if (schema instanceof z.ZodNumber) return "REAL";
  if (schema instanceof z.ZodBigInt) return "INTEGER";       // Zod v4 新增
  if (schema instanceof z.ZodBoolean) return "INTEGER";    // SQLite 无 BOOL
  if (schema instanceof z.ZodBigInt) return "INTEGER";
  if (schema instanceof z.ZodDate) return "TEXT";          // ISO 字符串
  if (schema instanceof z.ZodEnum) return "TEXT";
  if (schema instanceof z.ZodLiteral) {
    const val = schema.def.values[0];
    if (typeof val === "string") return "TEXT";
    if (typeof val === "number") return "REAL";
    if (typeof val === "boolean") return "INTEGER";
    return "TEXT";
  }
  if (schema instanceof z.ZodArray) return "TEXT";         // JSON 序列化
  if (schema instanceof z.ZodObject) return "TEXT";        // JSON 序列化

  return "TEXT"; // fallback
}

// ============ 核心方法 ============
/**
 * 
 * @param schema zod 对象
 * @returns ColumnDefMap<T>
 */
export function zodObjectToColumnDefs<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>
): ColumnDefMap<T> {
  const shape = schema.shape;
  const result = {} as Record<string, SQLiteColumnDef>;

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const { base, nullable, hasDefault, defaultValue } =
      unwrapZodType(fieldSchema as z.ZodType);

    result[key] = {
      name: key,
      type: zodToSQLiteType(base),
      nullable,
      primaryKey: false,
      unique: false,
      ...(hasDefault ? { defaultValue } : {}),
    };
  }

  return result as ColumnDefMap<T>;
}



export function zodDiscriminatedUnionToColumnDefs(
// ... existing code ...

// ============ 类型定义 ============

  schema: z.ZodDiscriminatedUnion<string, z.ZodObject<any>[]>,
  options: {
    /** 存放独有字段的列名，默认 "data" */
    extraColumnName?: string;
    /** 强制提升为列的字段（即使不是所有 variant 共有） */
    promoteKeys?: string[];
  } = {}
): DiscriminatedUnionColumnResult {
  const { extraColumnName = "data", promoteKeys = [] } = options;

  // 1. 获取判别字段
  const discriminator = schema.discriminator as string;

  // 2. 获取所有 variant 的 shape
  const variants = schema.options as z.ZodObject<any>[];
  const allShapes = variants.map((v) => v.shape);

  // 3. 收集每个 variant 的 key 集合
  const keySets = allShapes.map((shape) => new Set(Object.keys(shape)));

  // 4. 计算交集（共有 keys）
  const commonKeysSet = keySets.reduce((acc, set) => {
    return new Set([...acc].filter((k) => set.has(k)));
  });

  // 5. 把 promoteKeys 也加入共有集合
  for (const pk of promoteKeys) {
    commonKeysSet.add(pk);
  }

  const commonKeys = [...commonKeysSet];

  // 6. 计算所有 key 的并集
  const allKeysSet = keySets.reduce((acc, set) => {
    for (const k of set) acc.add(k);
    return acc;
  }, new Set<string>());

  // 7. 独有 keys = 并集 - 交集
  const uniqueKeys = [...allKeysSet].filter((k) => !commonKeysSet.has(k));

  // 8. 收集判别字段的所有可能值
  const discriminatorValues: string[] = [];
  for (const shape of allShapes) {
    const discField = shape[discriminator];
    if (discField instanceof z.ZodLiteral) {
      discriminatorValues.push(String(discField.value));
    }
  }

  // 9. 为共有 key 生成列定义
  //    对于共有 key，从各 variant 中取最宽松的定义
  const columns: ColumnDefMap = {};

  for (const key of commonKeys) {
    // 找到第一个拥有该字段的 variant 的 schema
    const fieldSchema = findFieldSchema(allShapes, key);
    if (!fieldSchema) continue;

    const { base, nullable, hasDefault, defaultValue } = unwrapZodType(fieldSchema);

    // 如果该字段在某些 variant 中不存在（promoteKeys 场景），标记为 nullable
    const existsInAll = keySets.every((set) => set.has(key));
    const isNullable = nullable || !existsInAll;

    columns[key] = {
      name: key,
      type: zodToSQLiteType(base),
      nullable: isNullable,
      primaryKey: false,
      unique: false,
      ...(hasDefault ? { defaultValue } : {}),
    };
  }

  // 10. 如果有独有字段，添加 JSON TEXT 列
  if (uniqueKeys.length > 0) {
    columns[extraColumnName] = {
      name: extraColumnName,
      type: "TEXT",
      nullable: true,
      primaryKey: false,
      unique: false,
    };
  }

  return {
    columns,
    commonKeys,
    uniqueKeys,
    discriminator,
    discriminatorValues,
    extraColumnName,
  };
}

// ============ 可选：标记主键 / unique 的辅助工具 ============

export function withPrimaryKey(def: SQLiteColumnDef): SQLiteColumnDef {
  return { ...def, primaryKey: true, nullable: false };
}

export function withUnique(def: SQLiteColumnDef): SQLiteColumnDef {
  return { ...def, unique: true };
}

// ============ 可选：生成 CREATE TABLE SQL ============
/**
 * 
 * @param tableName TableName
 * @param columns 字段定义 对象
 * @returns 字符串Example： `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs.join(",\n")}\n);`
 */
export function toCreateTableSQL(
  tableName: string,
  columns: Record<string, SQLiteColumnDef>
) : string  {
  const colDefs = Object.values(columns).map((col) => {
    const parts: string[] = [`"${col.name}"`, col.type];

    if (col.primaryKey) parts.push("PRIMARY KEY");
    if (!col.nullable && !col.primaryKey) parts.push("NOT NULL");
    if (col.unique && !col.primaryKey) parts.push("UNIQUE");
    if (col.defaultValue !== undefined) {
      const val =
        typeof col.defaultValue === "string"
          ? `'${col.defaultValue}'`
          : String(col.defaultValue);
      parts.push(`DEFAULT ${val}`);
    }

    return "  " + parts.join(" ");
  });
  ///console.log(`CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs.join(",\n")}\n);`)
  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs.join(",\n")}\n);`;


}