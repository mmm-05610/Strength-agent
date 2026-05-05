import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface ChartConfig {
  chart_type: "line" | "bar" | "pie" | "gauge" | "area";
  title: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[]; color?: string }>;
}

const COLORS = [
  "#7C6FF7",
  "#4ECDC4",
  "#F0A050",
  "#E06060",
  "#6BCB77",
  "#8B83BA",
];

function transformData(config: ChartConfig) {
  return config.labels.map((label, i) => {
    const row: Record<string, unknown> = { label };
    config.datasets.forEach((ds) => {
      row[ds.label] = ds.data[i] ?? 0;
    });
    return row;
  });
}

interface Props {
  config: ChartConfig;
}

export function ChartRenderer({ config }: Props) {
  const data = transformData(config);
  const { chart_type, title, datasets } = config;

  return (
    <div className="ai-chart-card">
      <div className="ai-chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        {chart_type === "line" ? (
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#7C7A8C" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#7C7A8C" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E8E6F0",
                background: "#fff",
                boxShadow: "0 2px 12px rgba(124,111,247,0.08)",
                fontSize: 12,
              }}
            />
            {datasets.map((ds, i) => (
              <Line
                key={ds.label}
                type="monotone"
                dataKey={ds.label}
                stroke={ds.color || COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        ) : chart_type === "area" ? (
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
          >
            <defs>
              {datasets.map((ds, i) => (
                <linearGradient
                  key={ds.label}
                  id={`grad-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={ds.color || COLORS[i % COLORS.length]}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor={ds.color || COLORS[i % COLORS.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#7C7A8C" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#7C7A8C" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E8E6F0",
                background: "#fff",
                boxShadow: "0 2px 12px rgba(124,111,247,0.08)",
                fontSize: 12,
              }}
            />
            {datasets.map((ds, i) => (
              <Area
                key={ds.label}
                type="monotone"
                dataKey={ds.label}
                stroke={ds.color || COLORS[i % COLORS.length]}
                strokeWidth={2}
                fill={`url(#grad-${i})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        ) : chart_type === "bar" ? (
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#7C7A8C" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#7C7A8C" }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E8E6F0",
                background: "#fff",
                boxShadow: "0 2px 12px rgba(124,111,247,0.08)",
                fontSize: 12,
              }}
            />
            {datasets.map((ds, i) => (
              <Bar
                key={ds.label}
                dataKey={ds.label}
                fill={ds.color || COLORS[i % COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        ) : chart_type === "pie" ? (
          <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Pie
              data={data.map((d, i) => ({
                name: d.label as string,
                value: datasets[0]?.data[i] ?? 0,
              }))}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #E8E6F0",
                background: "#fff",
                fontSize: 12,
              }}
            />
          </PieChart>
        ) : chart_type === "gauge" ? (
          <div className="ai-gauge">
            {(() => {
              const val = datasets[0]?.data[0] ?? 0;
              const pct = Math.min(val / 100, 1);
              const color =
                val >= 70
                  ? "var(--success)"
                  : val >= 40
                    ? "var(--warning)"
                    : "var(--danger)";
              return (
                <svg viewBox="0 0 200 120" className="ai-gauge-svg">
                  <path
                    d={describeArc(100, 100, 70, 135, 405)}
                    fill="none"
                    stroke="#E8E6F0"
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                  <path
                    d={describeArc(100, 100, 70, 135, 135 + 270 * pct)}
                    fill="none"
                    stroke={color}
                    strokeWidth="12"
                    strokeLinecap="round"
                    style={{ transition: "all 0.8s ease" }}
                  />
                  <text
                    x="100"
                    y="95"
                    textAnchor="middle"
                    fontSize="28"
                    fontWeight="700"
                    fill="#2D2B3A"
                  >
                    {Math.round(val)}
                    <tspan fontSize="14" fontWeight="400" fill="#7C7A8C">
                      {config.labels[0] ? ` ${config.labels[0]}` : "%"}
                    </tspan>
                  </text>
                </svg>
              );
            })()}
          </div>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}
function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
