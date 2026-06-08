// Lightweight animated backdrop — drifting blurred blobs. Pure CSS, no canvas/3D.
export function Stage() {
  return (
    <div className="stage-bg" aria-hidden>
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
    </div>
  );
}
