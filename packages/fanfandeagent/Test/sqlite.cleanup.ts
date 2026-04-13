import { afterAll } from "bun:test"
import * as Sqlite from "#database/Sqlite.ts"

afterAll(() => {
  Sqlite.closeDatabase()
})
