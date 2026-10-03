// A budget's capsule: what is spent against the plan, with the graduated
// rule's hatching past the plan, and a blue tick where spending would be
// today if the plan is to hold. The tick is "now", the one thing blue marks.
// The words beside the capsule carry the reading; the capsule is decoration
// for a screen reader.
export function PaceCapsule({
  spent,
  planned,
  pace,
  tone = 'spend',
}: {
  spent: number;
  planned: number;
  // Omitted for a capsule that has no pace, such as a goal.
  pace?: number | null;
  tone?: 'spend' | 'save';
}) {
  const over = planned > 0 && spent > planned;
  const share = planned > 0 ? Math.min(100, Math.max(0, (spent / planned) * 100)) : spent > 0 ? 100 : 0;
  const tick = pace !== undefined && pace !== null && planned > 0 ? Math.min(100, Math.max(0, (pace / planned) * 100)) : null;

  return (
    <div className="pace-capsule" role="presentation">
      <div className={`prog${tone === 'spend' ? ' spend' : ''}${over ? ' over' : ''}`}>
        <i style={{ width: `${over ? 100 : share}%` }} />
      </div>
      {tick !== null && <span className="pace-tick" style={{ left: `${tick}%` }} />}
    </div>
  );
}
