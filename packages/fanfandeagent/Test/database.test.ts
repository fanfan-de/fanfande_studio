import { test, expect, beforeEach, afterEach } from "bun:test"
import "./sqlite.cleanup.ts"
import * as Sqlite from "#database/Sqlite.ts"
import * as Parser from "#database/parser.ts"
import { z } from "zod"
import * as Session from"#session/session.ts"
import * as testobject from "./testobject.test"
import * as Message from "#session/message.ts"

//测试用的 schema
const TestSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  active: z.boolean().optional(),
  obj:z.object({
    a:z.string(),
    b:z.string(),
  })
})
type TestSchema = z.infer<typeof TestSchema>


// beforeEach(() => {
//   // 清空测试表（如果存在）
//   try {
//     db.run(`DROP TABLE IF EXISTS test_entities`)
//     db.run(`DROP TABLE IF EXISTS union_test`)
//   } catch (e) {
//     // 忽略错误
//   }
// })

// afterEach(() => {
//   // 清理测试表
//   try {
//     db.run(`DROP TABLE IF EXISTS test_entities`)
//     db.run(`DROP TABLE IF EXISTS union_test`)
//   } catch (e) {
//     // 忽略错误
//   }
// })

//--- 纯函数测试（不依赖数据库连接） ---

// test("toSQLiteValue converts objects correctly", () => {
//   const input = {
//     id: "123",
//     name: "Alice",
//     age: 30,
//     tags: ["dev", "test"],
//     createdAt: new Date("2025-01-01T00:00:00Z"),
//     active: true,
//     nullField: null,
//     undefinedField: undefined,
//     obj:{a:10,b:10},
//   }

//   const result = Sqlite.toSQLiteValue(input)
//   console.log(result)
// })

test("测试存储part 文件",()=>{


  Sqlite.isZodDiscriminatedUnion(Message.Part)

    const a = Session.SessionInfo
    const part:Message.Part = testobject.reasoningPart


    Sqlite.insertOneWithSchema("parts", part,Message.Part)
})

// test("fromSQLiteRecord restores objects correctly", () => {
//   const schema = TestSchema
//   const record = {
//     id: "123",
//     name: "Alice",
//     age: 30,
//     tags: '["dev","test"]',
//     createdAt: new Date("2025-01-01T00:00:00Z").getTime(),
//     active: 1,
//   }

//   const result = (Sqlite as any).fromSQLiteRecord(schema, record)
  
//   expect(result.id).toBe("123")
//   expect(result.name).toBe("Alice")
//   expect(result.age).toBe(30)
//   expect(result.tags).toEqual(["dev", "test"])
//   expect(result.createdAt).toBeInstanceOf(Date)
//   expect(result.createdAt.getTime()).toBe(new Date("2025-01-01T00:00:00Z").getTime())
//   expect(result.active).toBe(true)
// })

// test("parser: zodObjectToColumnDefs generates correct column definitions", () => {
//   const schema = TestSchema
//   const columnDefs = Parser.zodObjectToColumnDefs(schema)
  
//   expect(columnDefs.id).toEqual({
//     name: "id",
//     type: "TEXT",
//     nullable: false,
//     primaryKey: false,
//     unique: false,
//   })
  
//   expect(columnDefs.name).toEqual({
//     name: "name",
//     type: "TEXT",
//     nullable: false,
//     primaryKey: false,
//     unique: false,
//   })
  
//   expect(columnDefs.age).toEqual({
//     name: "age",
//     type: "REAL",
//     nullable: true, // optional 被视为 nullable
//     primaryKey: false,
//     unique: false,
//   })
  
//   expect(columnDefs.tags).toEqual({
//     name: "tags",
//     type: "TEXT", // 数组被转为 TEXT
//     nullable: true,
//     primaryKey: false,
//     unique: false,
//   })
// })

// test("parser: toCreateTableSQL generates correct SQL", () => {
//   const schema = TestSchema
//   const columnDefs = Parser.zodObjectToColumnDefs(schema)
//   const sql = Parser.toCreateTableSQL("test_table", columnDefs)
  
//   expect(sql).toContain('CREATE TABLE IF NOT EXISTS "test_table"')
//   expect(sql).toContain('"id" TEXT NOT NULL')
//   expect(sql).toContain('"name" TEXT NOT NULL')
//   expect(sql).toContain('"age" REAL')
//   expect(sql).toContain('"tags" TEXT')
// })

// //--- 数据库操作测试（使用真实 SQLite 连接） ---

// test("createTableByZodObject creates table", () => {
//   expect(Sqlite.tableExists("test_entities")).toBe(false)
  
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   expect(Sqlite.tableExists("test_entities")).toBe(true)
  
//   //验证表结构（通过查询 sqlite_master）
//   const tableInfo = db.prepare(`PRAGMA table_info(test_entities)`).all()
//   const columns = tableInfo.map((row: any) => row.name)
  
//   expect(columns).toContain("id")
//   expect(columns).toContain("name")
//   expect(columns).toContain("age")
//   expect(columns).toContain("tags")
// })

// test("insertOne and findById work correctly", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   const testData = {
//     id: "test-1",
//     name: "Test User",
//     age: 25,
//     tags: ["unit", "test"],
//     createdAt: new Date(),
//     active: true,
//   }
  
//   const insertId = Sqlite.insertOneWithSchema("test_entities", testData, TestSchema)
//   expect(insertId).toBeNumber()
  
//   const found = Sqlite.findById("test_entities", TestSchema, "test-1")
//   expect(found).not.toBeNull()
//   expect(found?.id).toBe("test-1")
//   expect(found?.name).toBe("Test User")
//   expect(found?.age).toBe(25)
//   expect(found?.tags).toEqual(["unit", "test"])
//   expect(found?.createdAt).toBeInstanceOf(Date)
//   expect(found?.active).toBe(true)
// })

// test("findMany with conditions", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   const users = [
//     { id: "1", name: "Alice", age: 30, active: true },
//     { id: "2", name: "Bob", age: 25, active: true },
//     { id: "3", name: "Charlie", age: 35, active: false },
//   ]
  
//   for (const user of users) {
//     Sqlite.insertOneWithSchema("test_entities", { ...user, tags: [], createdAt: new Date() }, TestSchema)
//   }
  
//   // 查询所有 active = true 的用户
//   const activeUsers = Sqlite.findMany("test_entities", TestSchema, {
//     where: [{ column: "active", value: 1 }], // true 在 SQLite 中为 1
//   })
  
//   expect(activeUsers).toHaveLength(2)
//   expect(activeUsers.map(u => u.name)).toEqual(["Alice", "Bob"])
  
//   // 查询年龄大于 30 的用户
//   const olderUsers = Sqlite.findMany("test_entities", TestSchema, {
//     where: [{ column: "age", operator: ">", value: 30 }],
//   })
  
//   expect(olderUsers).toHaveLength(1)
//   expect(olderUsers[0]?.name).toBe("Charlie")
// })

// test("updateById modifies records", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   const testData = {
//     id: "update-test",
//     name: "Original",
//     age: 20,
//     tags: [],
//     createdAt: new Date(),
//     active: false,
//   }
  
//   Sqlite.insertOneWithSchema("test_entities", testData, TestSchema)
  
//   const changes = Sqlite.updateById("test_entities", "update-test", { 
//     name: "Updated",
//     age: 21,
//     active: true,
//   })
  
//   expect(changes).toBe(1)
  
//   const updated = Sqlite.findById("test_entities", TestSchema, "update-test")
//   expect(updated?.name).toBe("Updated")
//   expect(updated?.age).toBe(21)
//   expect(updated?.active).toBe(true)
// })

// test("deleteById removes records", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   const testData = {
//     id: "delete-test",
//     name: "To be deleted",
//     age: 99,
//     tags: [],
//     createdAt: new Date(),
//     active: true,
//   }
  
//   Sqlite.insertOneWithSchema("test_entities", testData, TestSchema)
  
//   const before = Sqlite.findById("test_entities", TestSchema, "delete-test")
//   expect(before).not.toBeNull()
  
//   const deleted = Sqlite.deleteById("test_entities", "delete-test")
//   expect(deleted).toBe(1)
  
//   const after = Sqlite.findById("test_entities", TestSchema, "delete-test")
//   expect(after).toBeNull()
// })

// test("count returns correct number of records", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   expect(Sqlite.count("test_entities")).toBe(0)
  
//   for (let i = 0; i < 5; i++) {
//     Sqlite.insertOneWithSchema("test_entities", {
//       id: `item-${i}`,
//       name: `Item ${i}`,
//       age: i * 10,
//       tags: [],
//       createdAt: new Date(),
//       active: i % 2 === 0,
//     }, TestSchema)
//   }
  
//   expect(Sqlite.count("test_entities")).toBe(5)
//   expect(Sqlite.count("test_entities", [{ column: "active", value: 1 }])).toBe(3) // 0, 2, 4 为 true
// })

// test("exists checks for record presence", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   const testData = {
//     id: "exists-test",
//     name: "Exists Check",
//     age: 42,
//     tags: [],
//     createdAt: new Date(),
//     active: true,
//   }
  
//   Sqlite.insertOneWithSchema("test_entities", testData, TestSchema)
  
//   expect(Sqlite.exists("test_entities", [{ column: "id", value: "exists-test" }])).toBe(true)
//   expect(Sqlite.exists("test_entities", [{ column: "id", value: "non-existent" }])).toBe(false)
// })

// // --- 错误处理测试 ---

// test("updateMany without where clause throws error", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   expect(() => {
//     Sqlite.updateMany("test_entities", { name: "Test" }, [])
//   }).toThrow("UPDATE 必须提供 WHERE 条件")
// })

// test("deleteMany without where clause throws error", () => {
//   Sqlite.createTableByZodObject("test_entities", TestSchema)
  
//   expect(() => {
//     Sqlite.deleteMany("test_entities", [])
//   }).toThrow("DELETE 必须提供 WHERE 条件")
// })

// //--- 联合类型建表测试 ---

// const UnionSchema = z.discriminatedUnion("type", [
//   z.object({
//     type: z.literal("text"),
//     content: z.string(),
//     length: z.number(),
//   }),
//   z.object({
//     type: z.literal("image"),
//     url: z.string(),
//     width: z.number(),
//     height: z.number(),
//   }),
// ])

// test("createTableByZodDiscriminatedUnion creates table with data column", () => {
//   expect(Sqlite.tableExists("union_test")).toBe(false)
  
//   Sqlite.createTableByZodDiscriminatedUnion("union_test", UnionSchema)
  
//   expect(Sqlite.tableExists("union_test")).toBe(true)
  
//   // 验证表结构包含 data 列
//   const tableInfo = db.prepare(`PRAGMA table_info(union_test)`).all()
//   const columns = tableInfo.map((row: any) => row.name)
  
//   expect(columns).toContain("type")
//   expect(columns).toContain("data") // 联合类型的额外字段存储为 JSON
// })

// console.log("Database tests completed successfully!")
