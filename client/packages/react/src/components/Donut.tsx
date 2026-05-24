import { arc as d3arc } from "d3-shape";

type Props = {
  radius: number;
  mask: boolean[];
  ringThickness?: number;
};

export default function Donut({ radius, mask, ringThickness = 7 }: Props) {
  const n = mask.length;
  const inner = Math.max(2, radius - ringThickness);
  const a = d3arc<{ start: number; end: number }>()
    .innerRadius(inner)
    .outerRadius(radius)
    .startAngle((d) => d.start)
    .endAngle((d) => d.end);

  return (
    <g>
      {mask.map((ok, i) => {
        const d = a({
          start: (i / n) * 2 * Math.PI,
          end: ((i + 1) / n) * 2 * Math.PI,
        });
        return (
          <path
            key={i}
            d={d ?? undefined}
            fill={ok ? "#16a34a" : "#dc2626"}
            stroke="#0a0a0a"
            strokeWidth={0.4}
          />
        );
      })}
      <circle
        r={inner}
        className="fill-white stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-700"
        strokeWidth={0.5}
      />
    </g>
  );
}
