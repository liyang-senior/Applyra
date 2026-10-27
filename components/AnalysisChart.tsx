"use client";

import type { AnalysisPoint } from "@/lib/analysis";

export function AnalysisChart({ points }: { points?: AnalysisPoint[] | null }) {
  const series = Array.isArray(points) ? points : [];
  const width = 720;
  const height = 280;
  const pad = { top: 24, right: 16, bottom: 36, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = Math.max(
    1,
    ...series.map((point) => Math.max(point.generated, point.applied)),
  );

  function xAt(index: number) {
    if (series.length <= 1) return pad.left + innerW / 2;
    return pad.left + (index / (series.length - 1)) * innerW;
  }

  function yAt(value: number) {
    return pad.top + innerH - (value / maxValue) * innerH;
  }

  function pathFor(key: "generated" | "applied") {
    if (series.length === 0) return "";
    return series
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command}${xAt(index).toFixed(1)} ${yAt(point[key]).toFixed(1)}`;
      })
      .join(" ");
  }

  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[28rem]"
        role="img"
        aria-label="Generated and applied counts over time"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = yAt(maxValue * fraction);
          return (
            <g key={fraction}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="var(--line)"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--muted)"
              >
                {Math.round(maxValue * fraction)}
              </text>
            </g>
          );
        })}

        <path
          d={pathFor("generated")}
          fill="none"
          stroke="var(--green)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={pathFor("applied")}
          fill="none"
          stroke="#b45309"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {series.map((point, index) =>
          index % labelEvery === 0 || index === series.length - 1 ? (
            <text
              key={point.date}
              x={xAt(index)}
              y={height - 12}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted)"
            >
              {point.date.slice(5)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--green)]" />
          Generated
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-700" />
          Applied
        </span>
      </div>
    </div>
  );
}
