"use client"

import { AreaChart, BarChart, LineChart, PieChart, ScatterChart, type Series } from "generative-charts"
import { ChartNoAxesColumnIcon, CheckIcon, Table2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatValue } from "../analyze/tables"
import type { ChartSpec, TableModel, VizKind, VizPlan } from "../types"
import { CopyButton } from "./code-block"
import { useStunning } from "./context"
import { Inline } from "./flow"

const VIZ_LABEL: Record<VizKind, string> = {
  table: "Table",
  bar: "Bar chart",
  line: "Line chart",
  area: "Area chart",
  donut: "Donut chart",
  scatter: "Scatter plot",
  stats: "Key figures",
  timeline: "Timeline",
  facts: "Fact sheet",
}

/** Tab-separated text — pastes straight into a spreadsheet. */
export function toTsv(table: TableModel): string {
  const clean = (text: string) => text.replace(/[\t\n\r]+/g, " ").trim()
  return [
    table.columns.map((c) => clean(c.label)).join("\t"),
    ...table.rows.map((row) => table.columns.map((c) => clean(row.text[c.key])).join("\t")),
  ].join("\n")
}

export function DataTable({ table, dense }: { table: TableModel; dense?: boolean }) {
  // Give each column room in proportion to its content, so a narrow screen scrolls instead of crushing prose.
  const minWidth = (key: string) => {
    const longest = Math.max(0, ...table.rows.map((row) => row.text[key].length))
    return `${Math.min(24, Math.max(3, Math.round(longest * 0.55)))}ch`
  }
  const alignClass = (align: string) => (align === "right" ? "text-right tabular-nums" : align === "center" ? "text-center" : "text-left")
  return (
    <Table className={cn("smd-table", dense && "text-[0.8125rem]")}>
      <TableHeader>
        <TableRow>
          {table.columns.map((column) => (
            <TableHead key={column.key} scope="col" className={alignClass(column.align)}>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((row, r) => (
          <TableRow key={r}>
            {table.columns.map((column, c) => (
              <TableCell key={column.key} className={cn(alignClass(column.align), "whitespace-normal")} style={r === 0 ? { minWidth: minWidth(column.key) } : undefined}>
                <Inline nodes={row.cells[c]} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Chart({ table, viz, spec, titled }: { table: TableModel; viz: VizPlan; spec: ChartSpec; titled: boolean }) {
  const { chartTheme, appearance } = useStunning()
  const columnOf = (key: string) => table.columns.find((c) => c.key === key)!
  const labelColumn = viz.labelKey ? columnOf(viz.labelKey) : undefined
  const series: Series[] = spec.seriesKeys.map((key) => ({ dataKey: key, label: columnOf(key).label }))
  const data = viz.rowIndices.map((r) => {
    const row = table.rows[r]
    const datum: Record<string, unknown> = { label: labelColumn ? row.text[labelColumn.key] : String(r + 1) }
    for (const key of spec.seriesKeys) datum[key] = row.value[key]
    if (viz.kind === "scatter" && labelColumn) datum.x = row.value[labelColumn.key]
    return datum
  })
  const names = series.map((s) => s.label).join(", ")
  const common = {
    data,
    theme: chartTheme,
    appearance,
    title: titled ? names : undefined,
    figureLabel: "",
    ariaLabel: `${VIZ_LABEL[viz.kind]} of ${names}${labelColumn ? ` by ${labelColumn.label}` : ""}`,
    valueFormatter: (value: number) => formatValue(value, spec.unit),
    showLegend: series.length > 1,
  }

  switch (viz.kind) {
    case "line":
      return <LineChart {...common} xKey="label" series={series} showPoints={data.length <= 24} height={340} />
    case "area":
      return <AreaChart {...common} xKey="label" series={series} height={340} />
    case "donut":
      return <PieChart {...common} showLegend nameKey="label" valueKey={spec.seriesKeys[0]} variant="donut" height={340} />
    case "scatter":
      return <ScatterChart {...common} xKey="x" series={series} height={360} />
    default:
      return (
        <BarChart
          {...common}
          categoryKey="label"
          series={series}
          variant={viz.horizontal ? "horizontal" : "vertical"}
          height={viz.horizontal ? Math.max(260, data.length * 34 + 90) : 340}
        />
      )
  }
}

function Stats({ table, viz }: { table: TableModel; viz: VizPlan }) {
  const keys = viz.charts[0]?.seriesKeys ?? []
  const tiles =
    table.rows.length === 1
      ? keys.map((key) => ({ label: table.columns.find((c) => c.key === key)!.label, value: table.rows[0].text[key] }))
      : viz.rowIndices.map((r) => ({ label: table.rows[r].text[viz.labelKey ?? ""], value: table.rows[r].text[keys[0]] }))
  return (
    <dl className="smd-stats">
      {tiles.map((tile, i) => (
        <div key={i}>
          <dd>{tile.value}</dd>
          <dt>{tile.label}</dt>
        </div>
      ))}
    </dl>
  )
}

function Timeline({ table, viz }: { table: TableModel; viz: VizPlan }) {
  const dateIndex = table.columns.findIndex((c) => c.key === viz.labelKey)
  const rest = table.columns.map((column, index) => ({ column, index })).filter(({ index }) => index !== dateIndex)
  return (
    <ol className="smd-timeline">
      {viz.rowIndices.map((r) => {
        const row = table.rows[r]
        const filled = rest.filter(({ column }) => row.text[column.key])
        // The first descriptive column names the event; figures and the rest are details.
        const head = filled.find(({ column }) => column.type === "text") ?? filled[0]
        const details = filled.filter((entry) => entry !== head)
        return (
          <li key={r}>
            <time>{row.text[table.columns[dateIndex].key]}</time>
            <div>
              {head && (
                <p className="smd-timeline-title">
                  <Inline nodes={row.cells[head.index]} />
                </p>
              )}
              {details.map(({ column, index }) => (
                <p key={column.key}>
                  {(details.length > 1 || column.type !== "text") && <span className="smd-timeline-key">{column.label}: </span>}
                  <Inline nodes={row.cells[index]} />
                </p>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Facts({ table }: { table: TableModel }) {
  return (
    <dl className="smd-facts">
      {table.rows.map((row, r) => (
        <div key={r}>
          <dt>
            <Inline nodes={row.cells[0]} />
          </dt>
          <dd>
            <Inline nodes={row.cells[1]} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function DataBlock({ id, table, viz }: { id: string; table: TableModel; viz: VizPlan }) {
  const { portal, controls, setViz } = useStunning()
  const isTable = viz.kind === "table"
  const multiple = viz.charts.length > 1

  let body: React.ReactNode
  if (isTable) body = <div className="smd-table-scroll">{<DataTable table={table} />}</div>
  else if (viz.kind === "stats") body = <Stats table={table} viz={viz} />
  else if (viz.kind === "timeline") body = <Timeline table={table} viz={viz} />
  else if (viz.kind === "facts") body = <Facts table={table} />
  else {
    body = (
      <div className={cn("grid gap-6", multiple && "xl:grid-cols-2")}>
        {viz.charts.map((spec) => (
          <div key={spec.seriesKeys.join()} className="smd-chart min-w-0" data-multi={spec.seriesKeys.length > 1 || undefined}>
            <Chart table={table} viz={viz} spec={spec} titled={multiple} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <figure className="smd-data" data-viz={viz.kind} data-block-id={id}>
      <div className="smd-data-tools">
        {controls && viz.candidates.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Change how this data is shown" title="Change form" />}>
              <ChartNoAxesColumnIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={portal.style} className={cn(portal.className, "w-44")}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Show as</DropdownMenuLabel>
                {viz.candidates.map((kind) => (
                  <DropdownMenuItem key={kind} onClick={() => setViz(id, kind)}>
                    {VIZ_LABEL[kind]}
                    {kind === viz.kind && <CheckIcon className="ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!isTable && (
          <Popover>
            <PopoverTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="View the underlying data table" title="View data" />}>
              <Table2Icon />
            </PopoverTrigger>
            <PopoverContent align="end" style={portal.style} className={cn(portal.className, "max-h-[70svh] w-[min(92vw,44rem)] overflow-auto p-0")}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-popover px-3 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {table.rows.length} rows × {table.columns.length} columns
                </span>
                <CopyButton text={() => toTsv(table)} label="Copy table for spreadsheets" />
              </div>
              <DataTable table={table} dense />
            </PopoverContent>
          </Popover>
        )}
        {isTable && <CopyButton text={() => toTsv(table)} label="Copy table for spreadsheets" />}
      </div>
      {body}
    </figure>
  )
}
