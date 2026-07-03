type ReasonCodesProps = {
  codes?: string[] | undefined;
  limit?: number;
};

export function ReasonCodes({ codes, limit = 3 }: ReasonCodesProps) {
  if (!codes || codes.length === 0) {
    return <span className="muted">--</span>;
  }

  const visibleCodes = codes.slice(0, limit);
  const remainingCount = codes.length - visibleCodes.length;

  return (
    <span className="reason-list" title={codes.join(", ")}>
      {visibleCodes.map((code) => (
        <span className="reason-code" key={code}>
          {code}
        </span>
      ))}
      {remainingCount > 0 ? (
        <span className="reason-code reason-more">+{remainingCount}</span>
      ) : null}
    </span>
  );
}
