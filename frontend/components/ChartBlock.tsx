"use client";

import { useResolvedTheme } from "./ThemeToggle";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartType = "bar" | "line" | "pie";
export interface ChartSpec {
  type: ChartType;
  title?: string;
  data: { label: string; value: number }[];
}

/** Chart palettes per theme ("Lagoon": teal / cyan / emerald with amber highlights). */
export const CHART_THEME = {
  light: { colors: ["#0D9488", "#0891B2", "#059669", "#F59E0B", "#0E7490", "#14B8A6", "#D97706", "#64748B"], axis: "#64748B", grid: "#E2E8F0", cursor: "#F0FDFA", line: "#0F766E", stroke: "#FFFFFF", tooltipBg: "#FFFFFF", tooltipBorder: "#E2E8F0", text: "#0F172A" },
  dark: { colors: ["#2DD4BF", "#22D3EE", "#34D399", "#FBBF24", "#67E8F9", "#5EEAD4", "#F59E0B", "#94A3B8"], axis: "#8A9AB2", grid: "#223047", cursor: "#0B2626", line: "#5EEAD4", stroke: "#0F1724", tooltipBg: "#0F1724", tooltipBorder: "#31415C", text: "#E7EEF7" },
} as const;

export function parseChartSpec(text: string): ChartSpec | null {
  try {
    const raw = JSON.parse(text) as Partial<ChartSpec>;
    const type: ChartType = raw.type === "line" || raw.type === "pie" ? raw.type : "bar";
    const data = Array.isArray(raw.data) ? raw.data.map((d) => ({ label: String(d?.label ?? ""), value: Number(d?.value) || 0 })) : [];
    return { type, title: raw.title ? String(raw.title) : undefined, data };
  } catch {
    return null;
  }
}

export function ChartView({ spec, height = 260 }: { spec: ChartSpec; height?: number }) {
  const theme = useResolvedTheme();
  if (!spec.data.length) return <div className="flex h-32 items-center justify-center text-sm text-muted">No data yet. Add rows to see the chart.</div>;
  const t = CHART_THEME[theme];
  const CHART_COLORS = t.colors;
  const axis = { stroke: t.axis, fontSize: 12, tickLine: false, axisLine: false, tick: { fill: t.axis } } as const;
  const tooltip = { contentStyle: { background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.text }, itemStyle: { color: t.text }, labelStyle: { color: t.text } };
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {spec.type === "pie" ? (
          <PieChart>
            <Pie data={spec.data} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="75%" paddingAngle={2} stroke={t.stroke}>
              {spec.data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltip} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        ) : spec.type === "line" ? (
          <LineChart data={spec.data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip {...tooltip} />
            <Line type="monotone" dataKey="value" stroke={t.line} strokeWidth={2.5} dot={{ r: 3, fill: t.line }} />
          </LineChart>
        ) : (
          <BarChart data={spec.data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip {...tooltip} cursor={{ fill: t.cursor }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {spec.data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartBlock({ source }: { source: string }) {
  const spec = parseChartSpec(source);
  return (
    <figure className="my-5 rounded-lg border border-line bg-surface p-4 shadow-sm">
      {spec ? (
        <>
          {spec.title && <figcaption className="mb-3 text-sm font-semibold">{spec.title}</figcaption>}
          <ChartView spec={spec} />
        </>
      ) : (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">Chart block has invalid JSON.</p>
      )}
    </figure>
  );
}
