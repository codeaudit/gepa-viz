import { diffWordsWithSpace } from "diff";

type Props = {
  before: string;
  after: string;
};

export default function PromptDiff({ before, after }: Props) {
  const parts = diffWordsWithSpace(before, after);
  return (
    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
      {parts.map((p, i) => {
        if (p.added) {
          return (
            <span key={i} className="bg-green-200/70 text-green-900 dark:bg-green-900/40 dark:text-green-200">
              {p.value}
            </span>
          );
        }
        if (p.removed) {
          return (
            <span
              key={i}
              className="bg-red-200/70 text-red-900 line-through dark:bg-red-900/40 dark:text-red-200"
            >
              {p.value}
            </span>
          );
        }
        return <span key={i}>{p.value}</span>;
      })}
    </pre>
  );
}
