"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartType = "bar" | "line" | "pie";
export interface ChartSpec {
  type: ChartType;
  title?: string;
  data: { label: string; value: number }[];
}

export const CHART_COLORS = ["#7C3AED", "#4F46E5", "#2563EB", "#8B5CF6", "#0EA5E9", "#22C55E", "#F59E0B", "#EC4899"];

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
  if (!spec.data.length) return <div className="flex h-32 items-center justify-center text-sm text-muted">No data yet. Add rows to see the chart.</div>;
  const axis = { stroke: "#A1A1AA", fontSize: 12, tickLine: false, axisLine: false } as const;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        {spec.type === "pie" ? (
          <PieChart>
            <Pie data={spec.data} dataKey="value" nameKey="label" innerRadius="45%" outerRadius="75%" paddingAngle={2} stroke="#fff">
              {spec.data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        ) : spec.type === "line" ? (
          <LineChart data={spec.data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#F4F4F5" vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={2.5} dot={{ r: 3, fill: "#4F46E5" }} />
          </LineChart>
        ) : (
          <BarChart data={spec.data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#F4F4F5" vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip cursor={{ fill: "#F5F3FF" }} />
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
