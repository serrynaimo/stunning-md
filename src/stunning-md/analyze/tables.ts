import type { PhrasingContent, Table } from "mdast"
import type { ChartSpec, ColumnType, TableColumn, TableModel, TableRow, VizKind, VizPlan } from "../types"
import { toText } from "./text"

type Unit = { prefix: string; suffix: string }
type ParsedNumber = { value: number } & Unit

const MISSING = /^(|-|–|—|n\/?a|na|null|none|tbd|\?)$/i
const CURRENCY = "[$€£¥₹₩₽]|[A-Z]{1,3}\\$|(?:USD|EUR|GBP|SGD|JPY|CHF|AUD|CAD|INR|CNY)\\b"
const NUMBER = new RegExp(
  `^([(]?)\\s*([-−–+]?)\\s*(${CURRENCY})?\\s*([-−–+]?)\\s*(\\d[\\d,' ]*(?:\\.\\d+)?|\\.\\d+)\\s*` +
    `(k|K|M|B|T|bn|mn|m|thousand|million|billion|trillion)?\\s*(%|‰|[a-zA-Z°µ²³/]{1,8})?\\s*([)]?)$`,
)
const MAGNITUDE: Record<string, number> = {
  k: 1e3, K: 1e3, thousand: 1e3,
  M: 1e6, m: 1e6, mn: 1e6, million: 1e6,
  B: 1e9, bn: 1e9, billion: 1e9,
  T: 1e12, trillion: 1e12,
}

export function parseNumber(raw: string): ParsedNumber | null {
  const text = raw.trim()
  const match = NUMBER.exec(text)
  if (!match) return null
  const [, open, signA, currency = "", signB, digits, magnitude, suffixRaw = "", close] = match
  let suffix = suffixRaw
  let scale = 1
  if (magnitude) {
    // A bare lowercase "m" is metres unless money is involved ("$5m").
    if (magnitude === "m" && !currency) suffix = `m${suffix}`
    else scale = MAGNITUDE[magnitude]
  }
  const value = Number(digits.replace(/[,' ]/g, "")) * scale
  if (!Number.isFinite(value)) return null
  const negative = (open && close) || /[-−–]/.test(signA + signB)
  return { value: negative ? -value : value, prefix: currency.trim(), suffix }
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const monthIndex = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase())
const MONTH_NAME = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?"
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))
const validYear = (y: number) => y >= 1000 && y <= 2200

/** Parses the date shapes that show up in tables. Returns UTC epoch milliseconds. */
export function parseDate(raw: string): number | null {
  const text = raw.trim().replace(/\s+/g, " ")
  let m: RegExpExecArray | null
  if ((m = /^(\d{4})$/.exec(text))) return validYear(+m[1]) ? Date.UTC(+m[1], 0, 1) : null
  if ((m = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?(?:[T ][\d:.]+Z?)?$/.exec(text))) {
    return +m[2] >= 1 && +m[2] <= 12 ? Date.UTC(+m[1], +m[2] - 1, +(m[3] ?? 1)) : null
  }
  if ((m = /^(?:FY|CY) ?'?(\d{2}|\d{4})$/i.exec(text))) return Date.UTC(fullYear(m[1]), 0, 1)
  if ((m = /^Q([1-4]) ?'?(\d{2}|\d{4})$/i.exec(text))) return Date.UTC(fullYear(m[2]), (+m[1] - 1) * 3, 1)
  if ((m = /^'?(\d{2}|\d{4}) ?Q([1-4])$/i.exec(text))) return Date.UTC(fullYear(m[1]), (+m[2] - 1) * 3, 1)
  if ((m = /^H([12]) ?'?(\d{2}|\d{4})$/i.exec(text))) return Date.UTC(fullYear(m[2]), (+m[1] - 1) * 6, 1)
  if ((m = new RegExp(`^${MONTH_NAME}$`, "i").exec(text))) return Date.UTC(2000, monthIndex(m[1]), 1)
  if ((m = new RegExp(`^${MONTH_NAME} '?(\\d{2}|\\d{4})$`, "i").exec(text))) {
    return Date.UTC(fullYear(m[2]), monthIndex(m[1]), 1)
  }
  if ((m = new RegExp(`^${MONTH_NAME} (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{4})$`, "i").exec(text))) {
    return Date.UTC(+m[3], monthIndex(m[1]), +m[2])
  }
  if ((m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)? ${MONTH_NAME},? (\\d{4})$`, "i").exec(text))) {
    return Date.UTC(+m[3], monthIndex(m[2]), +m[1])
  }
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/.exec(text))) {
    const [a, b] = [+m[1], +m[2]]
    const [month, day] = a > 12 ? [b, a] : [a, b]
    return month >= 1 && month <= 12 && day <= 31 ? Date.UTC(fullYear(m[3]), month - 1, day) : null
  }
  return null
}

const ID_HEADER = /^(#|no\.?|nr\.?|id|rank|pos(ition)?|s\/n|index|ref)$/i
const TIME_HEADER = /\b(year|date|when|period|month|quarter|fy|time|day|week)\b/i
const SHARE_HEADER = /\b(share|allocation|mix|breakdown|distribution|portion|weight|split|composition)\b/i
const SUMMARY_LABEL = /^(grand )?(total|sum|overall|subtotal|average|avg|mean|median|all)\b/i

/** Reads "Revenue ($M)" → { prefix: "$", suffix: "M" }. */
function unitFromHeader(label: string): Unit | undefined {
  const match = /[([]\s*([^)\]]{1,10})\s*[)\]]\s*$/.exec(label)
  if (!match) return label.trim().endsWith("%") ? { prefix: "", suffix: "%" } : undefined
  const hint = match[1].trim()
  const currency = new RegExp(`^(${CURRENCY})`).exec(hint)
  if (currency) return { prefix: currency[1], suffix: hint.slice(currency[1].length).trim() }
  if (/^in /i.test(hint)) return { prefix: "", suffix: ` ${hint.slice(3)}` }
  return { prefix: "", suffix: hint === "%" ? "%" : ` ${hint}` }
}

const mostCommon = (values: string[]) => {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
}

export function buildTableModel(node: Table): TableModel {
  const [head, ...body] = node.children
  const headers = (head?.children ?? []).map((cell) => toText(cell).trim())
  const width = Math.max(headers.length, ...body.map((row) => row.children.length))
  const cellText = body.map((row) => Array.from({ length: width }, (_, c) => toText(row.children[c]).trim()))

  const columns: TableColumn[] = []
  const parsed: (number | string | null)[][] = body.map(() => [])

  for (let c = 0; c < width; c++) {
    const label = headers[c] || ""
    const cells = cellText.map((row) => row[c])
    const present = cells.filter((text) => !MISSING.test(text))
    const numbers = cells.map((text) => (MISSING.test(text) ? null : parseNumber(text)))
    const dates = cells.map((text) => (MISSING.test(text) ? null : parseDate(text)))
    const numericCount = numbers.filter(Boolean).length
    const dateCount = dates.filter((d) => d != null).length
    const enough = (count: number) => present.length > 0 && count >= Math.max(1, Math.ceil(present.length * 0.9))

    const allYears = enough(dateCount) && present.every((text) => /^\d{4}$/.test(text))
    let type: ColumnType = "text"
    // Bare four-digit numbers are years only where a time axis is expected.
    if (enough(dateCount) && (!allYears || c === 0 || TIME_HEADER.test(label))) type = "date"
    else if (enough(numericCount) && !ID_HEADER.test(label)) type = "number"

    let unit: Unit | undefined
    if (type === "number") {
      const found = numbers.filter((n): n is ParsedNumber => n != null)
      const prefix = mostCommon(found.map((n) => n.prefix))
      const suffix = mostCommon(found.map((n) => n.suffix))
      unit = prefix || suffix ? { prefix, suffix } : unitFromHeader(label)
    }

    const align = node.align?.[c] ?? (type === "number" ? "right" : "left")
    columns.push({ key: `c${c}`, label: label || `Column ${c + 1}`, type, unit, align })
    cellText.forEach((row, r) => {
      parsed[r][c] = type === "number" ? (numbers[r]?.value ?? null) : type === "date" ? dates[r] : row[c]
    })
  }

  const rows: TableRow[] = body.map((row, r) => ({
    text: Object.fromEntries(columns.map((col, c) => [col.key, cellText[r][c]])),
    value: Object.fromEntries(columns.map((col, c) => [col.key, parsed[r][c]])),
    cells: Array.from({ length: width }, (_, c) => (row.children[c]?.children ?? []) as PhrasingContent[]),
  }))

  return { node, columns, rows }
}

const unitKey = (unit?: Unit) => `${unit?.prefix ?? ""}|${unit?.suffix ?? ""}`

/**
 * Series are only plotted together when they share a unit and a comparable scale.
 * Anything else gets its own chart — two scales on one plot mislead.
 */
function groupSeries(model: TableModel, numeric: TableColumn[], rowIndices: number[]): ChartSpec[] {
  const byUnit = new Map<string, TableColumn[]>()
  for (const column of numeric) {
    const key = unitKey(column.unit)
    byUnit.set(key, [...(byUnit.get(key) ?? []), column])
  }
  const charts: ChartSpec[] = []
  for (const group of byUnit.values()) {
    const peak = (column: TableColumn) =>
      Math.max(0, ...rowIndices.map((r) => Math.abs((model.rows[r].value[column.key] as number | null) ?? 0)))
    const sorted = [...group].sort((a, b) => peak(b) - peak(a))
    let cluster: TableColumn[] = []
    for (const column of sorted) {
      if (cluster.length && peak(cluster[0]) > peak(column) * 30) {
        charts.push({ seriesKeys: cluster.map((c) => c.key), unit: cluster[0].unit })
        cluster = []
      }
      cluster.push(column)
    }
    if (cluster.length) charts.push({ seriesKeys: cluster.map((c) => c.key), unit: cluster[0].unit })
  }
  // Keep the document's column order within and across charts.
  const order = (key: string) => model.columns.findIndex((c) => c.key === key)
  for (const chart of charts) chart.seriesKeys.sort((a, b) => order(a) - order(b))
  return charts.sort((a, b) => order(a.seriesKeys[0]) - order(b.seriesKeys[0]))
}

/** Chooses how a table is best shown, from its shape and the types of its columns. */
export function planViz(model: TableModel): VizPlan {
  const { columns, rows } = model
  const all = rows.map((_, i) => i)
  const table = (reason: string, candidates: VizKind[] = []): VizPlan => ({
    kind: "table",
    charts: [],
    rowIndices: all,
    candidates: ["table", ...candidates],
    reason,
  })

  if (rows.length === 0 || columns.length < 2) return table("too small to visualise")

  let numeric = columns.filter((c) => c.type === "number")
  const dateColumn = columns.find((c) => c.type === "date")
  const texts = columns.filter((c) => c.type === "text")
  let label: TableColumn | undefined = dateColumn ?? texts[0]
  // A leading numeric column that only ever rises (1, 4, 8, 16…) is an ordered axis, not a measure.
  let ordinal = false
  if (!label && rows.length >= 3 && numeric.length >= 2 && numeric[0] === columns[0]) {
    const steps = rows.map((row) => row.value[columns[0].key] as number | null)
    if (steps.every((v, i) => v != null && (i === 0 || v > steps[i - 1]!))) {
      label = columns[0]
      numeric = numeric.slice(1)
      ordinal = true
    }
  }
  const otherTexts = texts.filter((c) => c !== label)
  const avgLength = (column: TableColumn) =>
    rows.reduce((sum, row) => sum + row.text[column.key].length, 0) / rows.length

  // A single row of numbers is a row of headline figures.
  if (rows.length === 1 && numeric.length >= 2 && numeric.length <= 6) {
    return {
      kind: "stats",
      labelKey: label?.key,
      charts: [{ seriesKeys: numeric.map((c) => c.key) }],
      rowIndices: all,
      candidates: ["stats", "table"],
      reason: "one row of figures",
    }
  }
  if (rows.length < 2) return table("single row")

  if (numeric.length === 0) {
    if (dateColumn && otherTexts.length + (texts.includes(label!) ? 0 : texts.length) >= 1 && rows.length >= 3) {
      return {
        kind: "timeline",
        labelKey: dateColumn.key,
        charts: [],
        rowIndices: all,
        candidates: ["timeline", "table"],
        reason: "dated events without figures",
      }
    }
    if (columns.length === 2 && rows.length <= 12 && avgLength(columns[0]) <= 28) {
      return {
        kind: "facts",
        labelKey: columns[0].key,
        charts: [],
        rowIndices: all,
        candidates: ["facts", "table"],
        reason: "short key–value pairs",
      }
    }
    return table("no numeric columns")
  }

  if (!label) {
    if (numeric.length >= 2 && rows.length >= 5) {
      return {
        kind: "scatter",
        labelKey: numeric[0].key,
        charts: [{ seriesKeys: [numeric[1].key], unit: numeric[1].unit }],
        rowIndices: all,
        candidates: ["scatter", "table"],
        reason: "two measures and no category",
      }
    }
    return table("no label column")
  }

  // Records with as much description as measurement read better as a table.
  if (otherTexts.length >= numeric.length || otherTexts.some((c) => avgLength(c) > 40)) {
    // …unless they are dated, in which case they are a sequence of events.
    if (dateColumn && rows.length >= 3 && numeric.length <= 1) {
      return {
        kind: "timeline",
        labelKey: dateColumn.key,
        charts: [],
        rowIndices: all,
        candidates: ["timeline", "table"],
        reason: "dated events with descriptions",
      }
    }
    return table("descriptive columns outweigh figures", dateColumn ? ["timeline"] : [])
  }

  const labels = rows.map((row) => row.text[label.key])
  let rowIndices = all.filter((r) => !(rows.length > 2 && SUMMARY_LABEL.test(labels[r])))
  if (new Set(rowIndices.map((r) => labels[r])).size < rowIndices.length) {
    return table("repeated labels — these are records, not categories")
  }
  if (rowIndices.length < 2) return table("too few rows")

  const charts = groupSeries(model, numeric, rowIndices)
  if (charts.length > 3 || charts.some((c) => c.seriesKeys.length > 8)) {
    return table("too many unrelated measures", ["bar"])
  }
  const single = charts.length === 1 && charts[0].seriesKeys.length === 1
  const count = rowIndices.length

  if (label.type === "date" || ordinal) {
    const axis = label.key
    const times = rowIndices.map((r) => rows[r].value[axis] as number)
    if (times[0] > times[times.length - 1]) rowIndices = [...rowIndices].reverse()
    // One measure per plot: a trend once there are enough periods, bars to compare a few.
    const alone = charts.every((chart) => chart.seriesKeys.length === 1)
    const kind: VizKind = alone ? (count >= 8 ? "area" : "bar") : count >= 4 ? "line" : "bar"
    return {
      kind,
      labelKey: label.key,
      charts,
      rowIndices,
      candidates: [...new Set<VizKind>([kind, "line", "bar", "area", "table"])],
      reason: `${count} ${ordinal ? "steps" : "periods"} × ${numeric.length} measure(s)`,
    }
  }

  if (count > 30) return table("too many categories for a readable chart", ["bar"])

  if (single) {
    const column = columns.find((c) => c.key === charts[0].seriesKeys[0])!
    const values = rowIndices.map((r) => (rows[r].value[column.key] as number | null) ?? 0)
    if (count <= 4 && otherTexts.length === 0) {
      return {
        kind: "stats",
        labelKey: label.key,
        charts,
        rowIndices,
        candidates: ["stats", "bar", "table"],
        reason: "a handful of headline figures",
      }
    }
    const sum = values.reduce((a, b) => a + b, 0)
    const wholeOf100 = column.unit?.suffix === "%" && sum > 98 && sum < 102
    if (count >= 3 && count <= 6 && values.every((v) => v >= 0) && (wholeOf100 || SHARE_HEADER.test(column.label))) {
      return {
        kind: "donut",
        labelKey: label.key,
        charts,
        rowIndices,
        candidates: ["donut", "bar", "table"],
        reason: "parts of a whole",
      }
    }
  }

  const cells = count * numeric.length
  if (!single && cells > 48) return table("too dense to chart", ["bar"])
  const longest = Math.max(...rowIndices.map((r) => labels[r].length))
  return {
    kind: "bar",
    labelKey: label.key,
    charts,
    horizontal: single && (count > 7 || longest > 14),
    rowIndices,
    candidates: single && count <= 6 ? ["bar", "donut", "stats", "table"] : ["bar", "table"],
    reason: `${count} categories × ${numeric.length} measure(s)`,
  }
}

/** Re-plans a table as a specific form, when that form is one of its candidates. */
export function withVizKind(plan: VizPlan, model: TableModel, kind: VizKind): VizPlan {
  if (kind === plan.kind || !plan.candidates.includes(kind)) return plan
  const next: VizPlan = { ...plan, kind, reason: `${plan.reason} → overridden to ${kind}` }
  if (kind === "timeline") {
    next.labelKey = model.columns.find((c) => c.type === "date")?.key ?? plan.labelKey
    next.rowIndices = model.rows.map((_, i) => i)
  }
  if (kind === "bar" && plan.charts.length === 0) {
    const numeric = model.columns.filter((c) => c.type === "number")
    const label = model.columns.find((c) => c.type !== "number")
    if (!numeric.length || !label) return plan
    next.labelKey = label.key
    next.charts = groupSeries(model, numeric, plan.rowIndices)
  }
  if (kind === "bar") {
    const longest = Math.max(...next.rowIndices.map((r) => model.rows[r].text[next.labelKey ?? ""]?.length ?? 0))
    const single = next.charts.length === 1 && next.charts[0].seriesKeys.length === 1
    next.horizontal = single && (next.rowIndices.length > 7 || longest > 14)
  }
  return next
}

/** Compact, unit-aware number formatting for axes, tooltips and stat tiles. */
export function formatValue(value: number, unit?: Unit): string {
  const abs = Math.abs(value)
  const body =
    abs >= 10000
      ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
      : new Intl.NumberFormat("en", { maximumFractionDigits: abs < 10 ? 2 : abs < 100 ? 1 : 0 }).format(value)
  const sign = body.startsWith("-") ? "−" : ""
  return `${sign}${unit?.prefix ?? ""}${body.replace(/^-/, "")}${unit?.suffix ?? ""}`
}
