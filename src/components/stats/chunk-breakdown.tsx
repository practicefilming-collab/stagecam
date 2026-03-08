'use client';

interface ChunkBreakdownProps {
  dialogue: number;
  action: number;
  sceneHeading: number;
  transition: number;
  system: number;
  performable: number;
}

const segments = [
  { key: 'dialogue', label: 'Dialogue', color: 'bg-gold' },
  { key: 'action', label: 'Action', color: 'bg-gold/50' },
  { key: 'system', label: 'System', color: 'bg-border' },
] as const;

export default function ChunkBreakdown(props: ChunkBreakdownProps) {
  const total = props.dialogue + props.action + props.sceneHeading + props.transition;
  if (total === 0) return null;

  // Group: dialogue, action (performable non-dialogue), system
  const data = [
    { label: 'Dialogue', count: props.dialogue, color: 'bg-gold' },
    { label: 'Action', count: props.action - (props.system - props.sceneHeading - props.transition), color: 'bg-gold/50' },
    { label: 'System', count: props.system, color: 'bg-zinc-600' },
  ].filter((d) => d.count > 0);

  // Recalculate to ensure counts are correct
  const performableAction = props.performable - props.dialogue;
  const correctedData = [
    { label: 'Dialogue', count: props.dialogue, color: 'bg-gold' },
    { label: 'Action', count: performableAction, color: 'bg-amber-700' },
    { label: 'System', count: props.system, color: 'bg-zinc-600' },
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
