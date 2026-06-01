"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PontoArea } from "@/lib/mockData";

const nf = new Intl.NumberFormat("pt-BR");

export default function AreaCadastros({ data }: { data: PontoArea[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="fillPink" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF3D81" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#FF3D81" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />
          <XAxis
            dataKey="rotulo"
            stroke="#6E6E88"
            tick={{ fontSize: 12, fill: "#9A9AB4" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#6E6E88"
            tick={{ fontSize: 12, fill: "#9A9AB4" }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "rgba(168,85,247,0.4)", strokeWidth: 1 }}
            contentStyle={{
              background: "#13131F",
              border: "1px solid rgba(168,85,247,0.35)",
              borderRadius: 12,
              color: "#F4F4FB",
            }}
            labelStyle={{ color: "#9A9AB4" }}
            formatter={(value: number) => [nf.format(value), "Cadastros"]}
          />
          <Area
            type="monotone"
            dataKey="cadastros"
            stroke="#FF3D81"
            strokeWidth={2.5}
            fill="url(#fillPink)"
            activeDot={{ r: 5, fill: "#FF3D81", stroke: "#08080E" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
