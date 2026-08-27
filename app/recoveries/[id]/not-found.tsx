import Link from "next/link";

export default function RecoveryNotFound() {
  return (
    <div className="route-error">
      <div>
        <h2>Recovery case not found</h2>
        <p>This case may have been removed from the demo dataset or the link is invalid.</p>
        <Link className="primary-button" href="/recoveries">Return to Recovery Queue</Link>
      </div>
    </div>
  );
}
