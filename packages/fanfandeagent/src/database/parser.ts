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