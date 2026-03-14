import { Database } from "bun:sqlite";
import { z } from "zod";
import { toCreateTableSQL, zodObjectToColumnDefs, SQLiteColumnDef } from "./parser"

// ============================================================================
//  SQLite 本地数据库工具库（基于 Bun 原生 SQLite + Zod 校验）
//
//  功能概览：
//    1. 数据库初始化与性能优化
//    2. 类型定义（SQLite 值类型、查询条件、排序、分页等）
//    3. 值转换工具（业务对象 ↔ SQLite 存储格式）
//    4. SQL 子句构建器（WHERE / ORDER BY / LIMIT）
//    5. CRUD 操作（增删改查 + 批量 + Upsert + Zod 校验）
// ============================================================================

// ============================================================================
//  第一部分：数据库初始化与优化
// ============================================================================

/** 创建或连接到本地单文件数据库 */
export const db = new Database("agent_local_data.db", { create: true });

// 性能优化 PRAGMA
db.run("PRAGMA journal_mode = WAL;"); // WAL 模式：并发读写性能大幅提升
db.run("PRAGMA synchronous = NORMAL;"); // 降低同步级别，在 WAL 模式下依然安全
db.run("PRAGMA foreign_keys = ON;"); // 启用外键约束，防止脏数据

// ============================================================================
//  第二部分：类型定义
// ============================================================================

/** SQLite 支持的原子值类型 */
type SQLiteValue = string | number | bigint | boolean | null | Uint8Array;

/** WHERE 条件中的比较操作符 */
type Operator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE" | "IS" | "IS NOT";

/** 单个 WHERE 条件描述 */
interface WhereClause {
  column: string;
  operator?: Operator; // 默认 "="
  value: SQLiteValue;
}

/** 排序描述 */
interface OrderBy {
  column: string;
  direction?: "ASC" | "DESC"; // 默认 "ASC"
}

/** 查询选项（聚合了筛选、排序、分页、列选择） */
interface QueryOptions {
  where?: WhereClause[];
  orderBy?: OrderBy[];
  limit?: number;
  offset?: number;
  columns?: string[]; // SELECT 指定列，默认 "*"
}

// ============================================================================
//  第三部分：DDL — 建表与表检测
// ============================================================================

/**
 * 通用建表函数
 * @param tableName  表名
 * @param schema  zod 对象
 */
export function createTableByZodObject<T extends z.ZodRawShape>(
  tableName: string,
  schema: z.ZodObject<T>
): void {
  const columedefs = zodObjectToColumnDefs(schema)
  db.run(toCreateTableSQL(tableName, columedefs))
}

/**
 * 联合类型建表函数
 * @param tableName  表名
 * @param schema  ZodDiscriminatedUnion 联合对象
 */
export function createTableByZodDiscriminatedUnion<
  Options extends z.ZodObject<any, any>[],
  Discriminator extends string
>(
  tableName: string,
  schema: z.ZodDiscriminatedUnion<Options, Discriminator>
): void {
  const options = schema.options as z.ZodObject<any, any>[]
  if (!options)
    return


  // 1. 收集每个 variant 的 key 集合
  const allKeySets = options.map((opt) => new Set(Object.keys(opt.shape)))

  // 2. 求所有 variant 的 key 交集 → 共有 key
  const commonKeys = allKeySets.reduce(
    (acc, set) => new Set([...acc].filter((key) => set.has(key)))
  )

  // 3. 用 Object.fromEntries 构建共有 shape（避免写入 Readonly 对象）
  const commonShape = Object.fromEntries(
    [...commonKeys].map((key) => [key, options[0]!.shape[key]])
  ) as z.ZodRawShape


  const commonSchema = z.object(commonShape)
  const columnDefs: Record<string, SQLiteColumnDef> = {
    ...zodObjectToColumnDefs(commonSchema),
    data: {
      name: "data",
      type: "TEXT" ,
      nullable:true,
      primaryKey:false,
      defaultValue:undefined,
      unique: false,
    }
  }

  // 6. 建表
  db.run(toCreateTableSQL(tableName, columnDefs))
}



// 用 typeof 让 TS 自己推断
const mySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("a"), name: z.string() }),
  z.object({ type: z.literal("b"), age: z.number() }),
])

type MySchemaType = typeof mySchema
//   ^? 悬浮这里，编辑器会告诉你完整的类型签名





/**
 * 检测某张表是否已存在
 *
 * @example
 * if (!tableExists("users")) createTable("users", { ... });
 */
export function tableExists(tableName: string): boolean {
  const result = db
    .query("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { count: number };

  return result.count > 0;
}

// ============================================================================
//  第四部分：值转换工具（业务对象 ↔ SQLite 存储格式）
// ============================================================================

/**
 * 将业务层对象转换为 SQLite 可存储的扁平记录
 *
 * 转换规则：
 *   - null / undefined  → null
 *   - string / number / bigint / boolean / Uint8Array → 原样保留
 *   - Date             → number（毫秒时间戳）
 *   - 其他复合类型       → JSON 字符串
 *
 * @example
 * toSQLiteValue({ name: "Alice", tags: ["a", "b"], born: new Date() });
 * // → { name: "Alice", tags: '["a","b"]', born: 1718000000000 }
 */
export function toSQLiteValue<T extends Record<string, unknown>>(
  obj: T,
): Record<string, SQLiteValue> {
  const result: Record<string, SQLiteValue> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) {
      result[key] = null;
    } else if (
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "bigint" ||
      typeof val === "boolean" ||
      val instanceof Uint8Array
    ) {
      result[key] = val;
    } else if (val instanceof Date) {
      result[key] = val.getTime();
    } else {
      // 对象、数组等复合类型 → JSON 序列化
      result[key] = JSON.stringify(val);
    }
  }

  return result;
}

/**
 * 将 SQLite 记录还原为 Zod Schema 描述的业务对象
 *
 * 还原规则（与 toSQLiteValue 对称）：
 *   - number + ZodDate  → new Date(value)
 *   - string + 复合类型  → JSON.parse(value)
 *   - 其他              → 直通
 *
 * @example
 * const UserSchema = z.object({ name: z.string(), born: z.date() });
 * fromSQLiteRecord(UserSchema, { name: "Alice", born: 1718000000000 });
 * // → { name: "Alice", born: Date(...) }
 */
export function fromSQLiteRecord<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  record: Record<string, SQLiteValue>,
): z.output<z.ZodObject<T>> {
  const shape = schema.shape;
  const obj: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    const fieldSchema = shape[key] as z.ZodTypeAny | undefined;
    if (!fieldSchema) {
      obj[key] = value; // schema 中未定义的字段，原样保留
      continue;
    }
    obj[key] = restoreValue(fieldSchema, value);
  }

  return schema.parse(obj); // 最终交给 Zod 做校验 + 类型推断
}

// ============================================================================
//  第五部分：Zod Schema 内省工具（用于值还原）
// ============================================================================

/** 根据字段的 Zod Schema 将单个 SQLiteValue 还原为业务层值 */
function restoreValue(fieldSchema: z.ZodTypeAny, value: SQLiteValue): unknown {
  if (value === null) {
    if (isNullable(fieldSchema)) return null;
    if (isOptional(fieldSchema)) return undefined;
    return null;
  }

  const base = unwrap(fieldSchema);

  // 时间戳 → Date
  if (base instanceof z.ZodDate && typeof value === "number") {
    return new Date(value);
  }

  // JSON 字符串 → 复合对象
  if (isJsonType(base) && typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value; // 原始标量直通
}

/**
 * 递归剥开 optional / nullable / default 等包装层，拿到最内层的实际类型
 *
 * 例如 z.string().optional().nullable()
 *   → ZodNullable → ZodOptional → ZodString
 *   → 返回 ZodString
 */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  const t = defType(schema);
  const wrapperTypes = [
    "optional",
    "nullable",
    "default",
    "nonoptional",
    "prefault",    // zod v4 的 default
    "ZodOptional", // zod v3 fallback
    "ZodNullable",
    "ZodDefault",
    "ZodEffects",
  ];

  if (wrapperTypes.includes(t)) {
    const inner = innerType(schema);
    return inner ? unwrap(inner) : schema;
  }

  return schema;
}

// --- Schema 定义信息的底层读取 ---

/** 读取 schema 的内部定义对象（兼容 zod v3 / v4） */
function defOf(schema: z.ZodTypeAny): any {
  return (schema as any)._zod?.def ?? (schema as any)._def;
}

/** 读取 schema 的类型名称 */
function defType(schema: z.ZodTypeAny): string {
  const d = defOf(schema);
  return d?.type ?? d?.typeName ?? "";
}

/** 读取包装类型的内层 schema */
function innerType(schema: z.ZodTypeAny): z.ZodTypeAny | undefined {
  const d = defOf(schema);
  return d?.innerType ?? d?.schema;
}

// --- 特征判断 ---

/** 判断 schema 链路中是否包含 optional 包装 */
function isOptional(schema: z.ZodTypeAny): boolean {
  return hasWrapper(schema, "optional", "ZodOptional");
}

/** 判断 schema 链路中是否包含 nullable 包装 */
function isNullable(schema: z.ZodTypeAny): boolean {
  return hasWrapper(schema, "nullable", "ZodNullable");
}

/** 递归检查 schema 链路中是否存在指定的包装类型 */
function hasWrapper(schema: z.ZodTypeAny, ...targets: string[]): boolean {
  const t = defType(schema);

  if (targets.includes(t)) return true;

  const inner = innerType(schema);
  const traversableTypes = [
    "optional",
    "nullable",
    "default",
    "nonoptional",
    "prefault",
    "ZodOptional",
    "ZodNullable",
    "ZodDefault",
  ];

  if (inner && traversableTypes.includes(t)) {
    return hasWrapper(inner, ...targets);
  }

  return false;
}

/** 判断最内层类型是否是复合类型（存储时需要 JSON 序列化） */
function isJsonType(base: z.ZodTypeAny): boolean {
  return (
    base instanceof z.ZodObject ||
    base instanceof z.ZodArray ||
    base instanceof z.ZodRecord ||
    base instanceof z.ZodTuple ||
    base instanceof z.ZodMap ||
    base instanceof z.ZodSet
  );
}

// ============================================================================
//  第六部分：SQL 子句构建器
// ============================================================================

/**
 * 构建 WHERE 子句及对应的参数数组
 *
 * @returns { sql: " WHERE col1 = ? AND col2 > ?", params: [val1, val2] }
 */
function buildWhereClause(conditions?: WhereClause[]): {
  sql: string;
  params: SQLiteValue[];
} {
  if (!conditions || conditions.length === 0) {
    return { sql: "", params: [] };
  }

  const parts: string[] = [];
  const params: SQLiteValue[] = [];

  for (const { column, operator = "=", value } of conditions) {
    if (operator === "IS" || operator === "IS NOT") {
      parts.push(`${column} ${operator} NULL`);
    } else {
      parts.push(`${column} ${operator} ?`);
      params.push(value);
    }
  }

  return { sql: ` WHERE ${parts.join(" AND ")}`, params };
}

/** 构建 ORDER BY 子句 */
function buildOrderByClause(orderBy?: OrderBy[]): string {
  if (!orderBy || orderBy.length === 0) return "";

  const parts = orderBy.map((o) => `${o.column} ${o.direction ?? "ASC"}`);
  return ` ORDER BY ${parts.join(", ")}`;
}

/** 构建 LIMIT / OFFSET 子句及对应的参数 */
function buildLimitClause(
  limit?: number,
  offset?: number,
): { sql: string; params: SQLiteValue[] } {
  let sql = "";
  const params: SQLiteValue[] = [];

  if (limit !== undefined) {
    sql += " LIMIT ?";
    params.push(limit);
  }
  if (offset !== undefined) {
    sql += " OFFSET ?";
    params.push(offset);
  }

  return { sql, params };
}

// ============================================================================
//  第七部分：CRUD 操作
// ============================================================================

// ---------- CREATE（新增） ----------

/**
 * 插入单条记录
 *
 * @returns 新行的 lastInsertRowid
 *
 * @example
 * insertOne("users", { name: "Alice", age: 30 });
 */
export function insertOne(
  tableName: string,
  data: Record<string, SQLiteValue>,
): number | bigint {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = Object.values(data);

  const sql = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders});`;
  return db.prepare(sql).run(...values).lastInsertRowid;
}

/**
 * 插入单条记录（带 Zod 校验）
 *
 * @example
 * const UserSchema = z.object({ name: z.string(), age: z.number() });
 * insertOneWithSchema("users", { name: "Alice", age: 30 }, UserSchema);
 */
export function insertOneWithSchema<T extends z.ZodTypeAny>(
  tableName: string,
  data: z.infer<T>,
  schema: T,
): number | bigint {
  const parsed = schema.parse(data); // 校验失败抛出 ZodError
  return insertOne(tableName, parsed as Record<string, SQLiteValue>);
}

/**
 * 批量插入（使用事务包裹，性能极高）
 *
 * @returns 成功插入的条数
 *
 * @example
 * insertMany("users", [
 *   { name: "Alice", age: 30 },
 *   { name: "Bob",   age: 25 },
 * ]);
 */
export function insertMany(
  tableName: string,
  dataList: Record<string, SQLiteValue>[],
): number {
  if (dataList.length === 0) return 0;

  const keys = Object.keys(dataList[0]!);
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders});`;
  const stmt = db.prepare(sql);

  const runInTransaction = db.transaction((items: Record<string, SQLiteValue>[]) => {
    let count = 0;
    for (const item of items) {
      stmt.run(...keys.map((k) => item[k] as SQLiteValue));
      count++;
    }
    return count;
  });

  return runInTransaction(dataList);
}

/**
 * UPSERT：存在则更新，不存在则插入
 *
 * @param conflictColumns 冲突判断列（通常是主键或唯一索引列）
 * @returns lastInsertRowid
 *
 * @example
 * upsert("users", { id: "u1", name: "Alice", age: 31 }, ["id"]);
 */
export function upsert(
  tableName: string,
  data: Record<string, SQLiteValue>,
  conflictColumns: string[],
): number | bigint {
  const keys = Object.keys(data);
  const placeholders = keys.map(() => "?").join(", ");
  const values = Object.values(data);

  // 冲突时只更新非冲突列
  const updateColumns = keys.filter((k) => !conflictColumns.includes(k));
  const updateClause =
    updateColumns.length > 0
      ? `UPDATE SET ${updateColumns.map((col) => `${col} = excluded.${col}`).join(", ")}`
      : "NOTHING";

  const sql = `
    INSERT INTO ${tableName} (${keys.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT(${conflictColumns.join(", ")})
    DO ${updateClause};
  `;

  return db.prepare(sql).run(...values).lastInsertRowid;
}

// ---------- READ（查询） ----------

/**
 * 查询多条记录
 *
 * @example
 * // 查询全部
 * findMany("users");
 *
 * // 条件查询 + 排序 + 分页
 * findMany("users", {
 *   where:   [{ column: "age", operator: ">", value: 18 }],
 *   orderBy: [{ column: "created_at", direction: "DESC" }],
 *   limit:   10,
 *   offset:  0,
 * });
 */
export function findMany<T = Record<string, SQLiteValue>>(
  tableName: string,
  options: QueryOptions = {},
): T[] {
  const selectCols = options.columns?.join(", ") ?? "*";
  const { sql: whereSql, params: whereParams } = buildWhereClause(options.where);
  const orderSql = buildOrderByClause(options.orderBy);
  const { sql: limitSql, params: limitParams } = buildLimitClause(options.limit, options.offset);

  const sql = `SELECT ${selectCols} FROM ${tableName}${whereSql}${orderSql}${limitSql};`;
  return db.prepare(sql).all(...whereParams, ...limitParams) as T[];
}

/**
 * 查询单条记录（内部调用 findMany + LIMIT 1）
 *
 * @example
 * findOne("users", { where: [{ column: "id", value: "u1" }] });
 */
export function findOne<T = Record<string, unknown>>(
  tableName: string,
  options: QueryOptions = {},
): T | null {
  const results = findMany<T>(tableName, { ...options, limit: 1 });
  return results[0] ?? null;
}

/**
 * 根据主键 ID 查询（快捷方法）
 *
 * @param idColumn 主键列名，默认 "id"
 *
 * @example
 * findById("users", "u1");
 * findById("users", 42, "user_id");
 */
export function findById<T = Record<string, SQLiteValue>>(
  tableName: string,
  id: SQLiteValue,
  idColumn: string = "id",
): T | null {
  return findOne<T>(tableName, {
    where: [{ column: idColumn, value: id }],
  });
}

/**
 * 查询记录总数
 *
 * @example
 * count("users");
 * count("users", [{ column: "age", operator: ">", value: 18 }]);
 */
export function count(tableName: string, where?: WhereClause[]): number {
  const { sql: whereSql, params } = buildWhereClause(where);
  const sql = `SELECT COUNT(*) as count FROM ${tableName}${whereSql};`;
  const result = db.prepare(sql).get(...params) as { count: number };
  return result.count;
}

/**
 * 检查是否存在符合条件的记录
 *
 * @example
 * exists("users", [{ column: "email", value: "alice@example.com" }]);
 */
export function exists(tableName: string, where: WhereClause[]): boolean {
  return count(tableName, where) > 0;
}

/**
 * 带 Zod Schema 校验的查询（确保返回数据符合类型定义）
 *
 * @example
 * const UserSchema = z.object({ name: z.string(), age: z.number() });
 * findManyWithSchema("users", UserSchema, { limit: 10 });
 */
export function findManyWithSchema<T extends z.ZodTypeAny>(
  tableName: string,
  schema: T,
  options: QueryOptions = {},
): z.infer<T>[] {
  const rows = findMany(tableName, options);
  return rows.map((row) => schema.parse(row));
}

// ---------- UPDATE（更新） ----------

/**
 * 按条件更新多条记录
 *
 * @returns 受影响的行数
 * @throws  未提供 WHERE 条件时抛错（防止误更新全表）
 *
 * @example
 * updateMany("users", { name: "Alice V2", age: 31 }, [{ column: "id", value: "u1" }]);
 */
export function updateMany(
  tableName: string,
  data: Record<string, SQLiteValue>,
  where: WhereClause[],
): number {
  if (where.length === 0) {
    throw new Error(
      "UPDATE 必须提供 WHERE 条件，防止误更新全表。如需更新全表请使用 updateAll。",
    );
  }

  const keys = Object.keys(data);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const setValues = Object.values(data);
  const { sql: whereSql, params: whereParams } = buildWhereClause(where);

  const sql = `UPDATE ${tableName} SET ${setClause}${whereSql};`;
  return db.prepare(sql).run(...setValues, ...whereParams).changes;
}

/**
 * 根据主键 ID 更新（快捷方法）
 *
 * @returns 受影响的行数
 *
 * @example
 * updateById("users", "u1", { name: "New Name" });
 */
export function updateById(
  tableName: string,
  id: SQLiteValue,
  data: Record<string, SQLiteValue>,
  idColumn: string = "id",
): number {
  return updateMany(tableName, data, [{ column: idColumn, value: id }]);
}

/**
 * 更新全表所有记录（⚠️ 危险操作，需显式调用）
 *
 * @returns 受影响的行数
 */
export function updateAll(
  tableName: string,
  data: Record<string, SQLiteValue>,
): number {
  const keys = Object.keys(data);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = Object.values(data);

  const sql = `UPDATE ${tableName} SET ${setClause};`;
  return db.prepare(sql).run(...values).changes;
}

// ---------- DELETE（删除） ----------

/**
 * 按条件删除记录
 *
 * @returns 受影响的行数
 * @throws  未提供 WHERE 条件时抛错（防止误删全表）
 *
 * @example
 * deleteMany("users", [{ column: "age", operator: "<", value: 18 }]);
 */
export function deleteMany(tableName: string, where: WhereClause[]): number {
  if (where.length === 0) {
    throw new Error(
      "DELETE 必须提供 WHERE 条件，防止误删全表。如需清空请使用 deleteAll。",
    );
  }

  const { sql: whereSql, params } = buildWhereClause(where);
  const sql = `DELETE FROM ${tableName}${whereSql};`;
  return db.prepare(sql).run(...params).changes;
}

/**
 * 根据主键 ID 删除（快捷方法）
 *
 * @returns 受影响的行数
 *
 * @example
 * deleteById("users", "u1");
 */
export function deleteById(
  tableName: string,
  id: SQLiteValue,
  idColumn: string = "id",
): number {
  return deleteMany(tableName, [{ column: idColumn, value: id }]);
}

/**
 * 清空整张表（⚠️ 危险操作）
 *
 * @returns 被删除的行数
 */
export function deleteAll(tableName: string): number {
  return db.prepare(`DELETE FROM ${tableName};`).run().changes;
}