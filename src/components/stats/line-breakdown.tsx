'use client';

interface LineBreakdownProps {
  dialogueLines: number;
  actionLines: number;
  sceneHeadingLines: number;
  transitionLines: number;
  systemLines: number;
  rehearsableLines: number;
}

export default function LineBreakdown(props: LineBreakdownProps) {
  const total = props.dialogueLines + props.actionLines + props.sceneHeadingLines + props.transitionLines;
  if (total === 0) return null;

  // Recalculate to ensure counts are correct
  const rehearsableAction = Math.max(0, props.rehearsableLines - props.dialogueLines);
  const correctedData = [
    { label: 'Dialogue', count: props.dialogueLines, color: 'bg-gold' },
    { label: 'Action', count: rehearsableAction, color: 'bg-amber-700' },
    { label: 'System', count: props.systemLines, color: 'bg-zinc-600' },
  ].filter((d) => d.count > 0);

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-4 rounded-full overflow-hidden">
        {correctedData.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} transition-all`}
            style={{
              flexBasis: `${(seg.count / total) * 100}%`,
              minWidth: seg.count > 0 ? '2px' : 0,
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {correctedData.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-xs text-muted">
            <div className={`w-2.5 h-2.5 rounded-sm ${seg.color}`} />
            <span>{seg.label}</span>
            <span className="text-foreground font-mono">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
