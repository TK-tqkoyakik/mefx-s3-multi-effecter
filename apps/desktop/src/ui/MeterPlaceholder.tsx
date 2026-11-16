type Props = {
  label: string;
  value: number;
  clip?: boolean;
};

export function MeterPlaceholder({ label, value, clip = false }: Props) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <article className={clip ? "panel meter-card clip" : "panel meter-card"}>
      <div className="meter-label">
        <h4>{label}</h4>
        <span>{clampedValue}%</span>
      </div>
      <div className="meter-track" aria-hidden="true">
        <span style={{ width: `${clampedValue}%` }} />
      </div>
    </article>
  );
}
