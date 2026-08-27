export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="loading-pulse" />
      <div>
        <b>Loading PulseBack</b>
        <small>Reading the latest server state…</small>
      </div>
    </div>
  );
}
