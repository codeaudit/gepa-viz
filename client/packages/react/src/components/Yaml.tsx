import { toYaml } from "../lib/yaml";

type Props = {
  value: unknown;
  className?: string;
};

export default function Yaml({ value, className = "" }: Props) {
  return (
    <pre
      className={`whitespace-pre-wrap break-words font-mono text-xs leading-relaxed ${className}`}
    >
      {toYaml(value)}
    </pre>
  );
}
