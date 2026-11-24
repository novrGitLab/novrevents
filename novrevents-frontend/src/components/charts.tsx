'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Chart wrappers. They only ever plot data passed in from the API; with no data they render an
 * explicit empty message instead of a placeholder chart.
 */

const axis = { stroke: 'var(--muted-foreground)', fontSize: 12, tickLine: false, axisLine: false }
const tooltipStyle = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
}

export function EmptyChart({ message = 'No data yet.' }: { message?: string }) {
  return (
    <div className="text-muted-foreground bg-muted/40 flex h-56 items-center justify-center rounded-lg text-sm">
      {message}
    </div>
  )
}

export function TrendChart({
  data,
  xKey,
  series,
  height = 240,
}: {
  data: object[]
  xKey: string
  series: Array<{ key: string; label: string; color: string }>
  height?: number
}) {
  if (data.length === 0) return <EmptyChart />
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Chart of ${series.map((item) => item.label).join(' and ')} over time`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} {...axis} minTickGap={24} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((item) => (
            <Line
              key={item.key}
              type="linear"
              dataKey={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarsChart({
  data,
  xKey,
  series,
  height = 240,
  horizontal = false,
}: {
  data: object[]
  xKey: string
  series: Array<{ key: string; label: string; color: string }>
  height?: number
  horizontal?: boolean
}) {
  if (data.length === 0) return <EmptyChart />
  return (
    <div
      style={{ height }}
      role="img"
      aria-label={`Bar chart of ${series.map((item) => item.label).join(' and ')}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 8, right: 8, bottom: 0, left: horizontal ? 8 : -16 }}
        >
          <CartesianGrid stroke="var(--border)" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} allowDecimals={false} />
              <YAxis type="category" dataKey={xKey} {...axis} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axis} />
              <YAxis {...axis} allowDecimals={false} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.label}
              fill={item.color}
              radius={3}
              maxBarSize={32}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
