import { EvalCase, EvalSuite } from "#eval/schema.ts"
import {
  scoreCase,
  type EvalAssertionScorer,
  type EvalCaseScore,
  type EvalExecution,
} from "#eval/scorer.ts"

export type EvalExecutorContext = {
  suite: EvalSuite
  testCase: EvalCase
  repetition: number
  signal?: AbortSignal
}

export type EvalExecutor = {
  run: (testCase: EvalCase, context: EvalExecutorContext) => Promise<EvalExecution>
}

export type EvalRunOptions = {
  concurrency?: number
  repetitions?: number
  tags?: string[]
  caseIDs?: string[]
  signal?: AbortSignal
  customScorers?: EvalAssertionScorer[]
}

export type EvalRepetitionResult = {
  repetition: number
  execution: EvalExecution
  score: EvalCaseScore
}

export type EvalCaseResult = {
  caseID: string
  name?: string
  tags: string[]
  passed: boolean
  score: number
  threshold: number
  repetitions: EvalRepetitionResult[]
}

export type EvalSuiteResult = {
  suiteID: string
  name?: string
  startedAt: number
  endedAt: number
  durationMs: number
  passed: boolean
  score: number
  totalCases: number
  passedCases: number
  failedCases: number
  results: EvalCaseResult[]
}

type WorkItem = {
  testCase: EvalCase
  repetition: number
}

function clampConcurrency(value: number | undefined, fallback: number) {
  const next = value ?? fallback
  if (!Number.isFinite(next)) return 1
  return Math.max(1, Math.min(64, Math.floor(next)))
}

function tagsMatch(testCase: EvalCase, tags: string[] | undefined) {
  if (!tags || tags.length === 0) return true
  const set = new Set(testCase.tags)
  return tags.some((tag) => set.has(tag))
}

function idsMatch(testCase: EvalCase, ids: string[] | undefined) {
  if (!ids || ids.length === 0) return true
  return ids.includes(testCase.id)
}

function caseThreshold(testCase: EvalCase, suite: EvalSuite) {
  return testCase.threshold ?? suite.defaultThreshold
}

function caseRepetitions(testCase: EvalCase, suite: EvalSuite, options: EvalRunOptions) {
  return testCase.repetitions ?? options.repetitions ?? suite.repetitions
}

function assertNotAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return
  const error = new Error("Eval run aborted.")
  error.name = "AbortError"
  throw error
}

async function runWorkItem(
  suite: EvalSuite,
  executor: EvalExecutor,
  item: WorkItem,
  options: EvalRunOptions,
): Promise<EvalRepetitionResult> {
  assertNotAborted(options.signal)
  const execution = await executor.run(item.testCase, {
    suite,
    testCase: item.testCase,
    repetition: item.repetition,
    signal: options.signal,
  })
  const score = await scoreCase(item.testCase, execution, {
    threshold: caseThreshold(item.testCase, suite),
    customScorers: options.customScorers,
  })
  return {
    repetition: item.repetition,
    execution,
    score,
  }
}

async function runConcurrent<T>(items: WorkItem[], concurrency: number, fn: (item: WorkItem) => Promise<T>) {
  const results = new Array<T>(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      const item = items[index]
      if (!item) return
      results[index] = await fn(item)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

function aggregateCaseResult(testCase: EvalCase, suite: EvalSuite, repetitions: EvalRepetitionResult[]): EvalCaseResult {
  const score = repetitions.length > 0
    ? repetitions.reduce((sum, item) => sum + item.score.score, 0) / repetitions.length
    : 1
  const threshold = caseThreshold(testCase, suite)

  return {
    caseID: testCase.id,
    name: testCase.name,
    tags: testCase.tags,
    passed: repetitions.every((item) => item.score.passed) && score >= threshold,
    score,
    threshold,
    repetitions,
  }
}

function aggregateSuiteResult(
  suite: EvalSuite,
  startedAt: number,
  endedAt: number,
  results: EvalCaseResult[],
): EvalSuiteResult {
  const score = results.length > 0
    ? results.reduce((sum, item) => sum + item.score, 0) / results.length
    : 1
  const passedCases = results.filter((item) => item.passed).length
  const failedCases = results.length - passedCases

  return {
    suiteID: suite.id,
    name: suite.name,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    passed: failedCases === 0 && score >= suite.defaultThreshold,
    score,
    totalCases: results.length,
    passedCases,
    failedCases,
    results,
  }
}

export async function runEvalSuite(
  rawSuite: EvalSuite,
  executor: EvalExecutor,
  options: EvalRunOptions = {},
): Promise<EvalSuiteResult> {
  const suite = EvalSuite.parse(rawSuite)
  const cases = suite.cases.filter((item) => tagsMatch(item, options.tags) && idsMatch(item, options.caseIDs))
  const workItems = cases.flatMap((testCase) =>
    Array.from({ length: caseRepetitions(testCase, suite, options) }, (_, index) => ({
      testCase,
      repetition: index + 1,
    })),
  )
  const startedAt = Date.now()
  const concurrency = clampConcurrency(options.concurrency, suite.concurrency)
  const repetitionResults = await runConcurrent(workItems, concurrency, (item) =>
    runWorkItem(suite, executor, item, options),
  )
  const byCaseID = new Map<string, EvalRepetitionResult[]>()
  for (const result of repetitionResults) {
    const list = byCaseID.get(result.score.caseID) ?? []
    list.push(result)
    byCaseID.set(result.score.caseID, list)
  }

  const results = cases.map((testCase) =>
    aggregateCaseResult(
      testCase,
      suite,
      (byCaseID.get(testCase.id) ?? []).sort((left, right) => left.repetition - right.repetition),
    ),
  )
  const endedAt = Date.now()
  return aggregateSuiteResult(suite, startedAt, endedAt, results)
}
