import { cn } from "@/lib/utils";
import { getSeverityBadgeClass, type Severity } from "@/lib/mock-data";

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border capitalize",
        getSeverityBadgeClass(severity),
        className
      )}
    >
      {severity}
    </span>
  );
}

interface SeverityCountsProps {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info?: number;
  compact?: boolean;
}

export function SeverityCounts({
  critical,
  high,
  medium,
  low,
  info,
  compact = false,
}: SeverityCountsProps) {
  const items = [
    { label: "C", value: critical, color: "bg-red-500 text-white", title: "Critical" },
    { label: "H", value: high, color: "bg-orange-500 text-white", title: "High" },
    { label: "M", value: medium, color: "bg-yellow-500 text-white", title: "Medium" },
    { label: "L", value: low, color: "bg-blue-500 text-white", title: "Low" },
    ...(info !== undefined
      ? [{ label: "I", value: info, color: "bg-gray-400 text-white", title: "Info" }]
      : []),
  ];

  return (
    <div className="flex items-center gap-1.5">
      {items.map((item) => (
        <div
          key={item.label}
          title={`${item.title}: ${item.value}`}
          className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold",
            item.color,
            item.value === 0 && "opacity-40"
          )}
        >
          {!compact && (
            <span className="font-normal opacity-80">{item.label}</span>
          )}
          <span>{item.value}</span>
        </div>
      ))}
    </div>
  );
}
