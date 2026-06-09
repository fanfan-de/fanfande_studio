import type { EvalCaseResult, EvalSuiteResult } from "#eval/runner.ts"

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}

function status(value: boolean) {
  return value ? "pass" : "fail"
}

function avgDuration(caseResult: EvalCaseResult) {
  if (caseResult.repetitions.length === 0) return 0
  return Math.round(
    caseResult.repetitions.reduce((sum, item) => {
      const duration = item.execution.durationMs ?? Math.max(0, item.execution.endedAt - item.execution.startedAt)
      return sum + duration
    }, 0) / caseResult.repetitions.length,
  )
}

function failedAssertions(caseResult: EvalCaseResult) {
  return caseResult.repetitions.flatMap((repetition) =>
    repetition.score.assertionResults
      .filter((assertion) => !assertion.passed)
      .map((assertion) => ({
        repetition: repetition.repetition,
        assertion,
      })),
  )
}

export function createJsonReport(result: EvalSuiteResult) {
  return JSON.stringify(result, null, 2)
}

export function createMarkdownReport(result: EvalSuiteResult) {
  const lines: string[] = []
  lines.push(`# Eval Report: ${result.name ?? result.suiteID}`)
  lines.push("")
  lines.push(`- Status: ${status(result.passed)}`)
  lines.push(`- Score: ${percent(result.score)}`)
  lines.push(`- Cases: ${result.passedCases}/${result.totalCases} passed`)
  lines.push(`- Duration: ${result.durationMs}ms`)
  lines.push("")
  lines.push("| Case | Status | Score | Repetitions | Avg Duration | Failed Assertions |")
  lines.push("| --- | --- | ---: | ---: | ---: | ---: |")

  for (const item of result.results) {
    lines.push([
      item.name ? `${item.caseID} (${item.name})` : item.caseID,
      status(item.passed),
      percent(item.score),
      String(item.repetitions.length),
      `${avgDuration(item)}ms`,
      String(failedAssertions(item).length),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"))
  }

  const failed = result.results.filter((item) => !item.passed)
  if (failed.length === 0) return lines.join("\n")

  lines.push("")
  lines.push("## Failed Cases")
  for (const item of failed) {
    lines.push("")
    lines.push(`### ${item.caseID}`)
    const failures = failedAssertions(item)
    if (failures.length === 0) {
      lines.push("- Case failed without failed assertions.")
      continue
    }
    for (const failure of failures) {
      lines.push(`- repetition ${failure.repetition}: ${failure.assertion.message}`)
      if (failure.assertion.actual !== undefined) {
        lines.push(`  - actual: ${JSON.stringify(failure.assertion.actual)}`)
      }
      if (failure.assertion.expected !== undefined) {
        lines.push(`  - expected: ${JSON.stringify(failure.assertion.expected)}`)
      }
    }
  }

  return lines.join("\n")
}
