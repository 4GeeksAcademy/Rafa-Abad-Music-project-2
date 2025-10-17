// src/components/UserMiniCard.jsx
import { Link } from "react-router-dom";

function getDisplayName(user) {
  const name =
    (user?.name && String(user.name).trim()) ||
    (user?.venueName && String(user.venueName).trim()) ||
    (user?.email && String(user.email).split("@")[0]) ||
    "—";
  return name;
}

function getInitials(user) {
  const name = getDisplayName(user);
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((p) => p[0]?.toUpperCase() || "").join("");
  return letters || "•";
}

function Stars({ avg = 0, size = "xs" }) {
  const rounded = Math.round((Number(avg) || 0) * 2) / 2;
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className={`rating-${size}`} style={{ display: "inline-flex", gap: 2 }}>
      {stars.map((i) => (
        <span key={i} className={`star ${rounded >= i ? "active" : ""}`}>★</span>
      ))}
    </span>
  );
}

export default function UserMiniCard({ user, clickable = true, onClick }) {
  if (!user) return null;

  const displayName = getDisplayName(user);
  const city = user?.city || "—";
  const profileHref = `/profile/${user.userId}`;
  const isPerformer = (user?.role || "").toLowerCase() === "performer";
  const isVenue =
    (user?.role || "").toLowerCase() === "distributor" ||
    (user?.role || "").toLowerCase() === "venue";

  const avg = user?.ratingAvg ?? 0;
  const count = user?.ratingCount ?? 0;

  const CardInner = (
    <div className="card user-mini-card h-100">
      <div className="card-body d-flex align-items-center gap-3">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={displayName}
            className="avatar object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="avatar avatar-fallback">{getInitials(user)}</div>
        )}

        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-center justify-content-between">
            <h6 className="mb-0 text-truncate">{displayName}</h6>
          </div>
          <div className="text-muted small text-truncate">{city}</div>

          {/* Rating row */}
          <div className="mt-1 d-flex align-items-center gap-2">
            <Stars avg={avg} size="xs" />
            <span className="text-xs text-muted">
              {Number(avg || 0).toFixed(1)} · {count} review{count === 1 ? "" : "s"}
            </span>
          </div>

          {/* Optional details */}
          {(user?.description || user?.bio) && (
            <div className="small mt-2 user-mini-desc line-clamp-2">
              {user.description || user.bio}
            </div>
          )}

          <div className="mt-2 d-flex flex-wrap gap-2">
            {isPerformer && user?.genre && (
              <span className="badge bg-secondary" title="Genre">
                {user.genre}
              </span>
            )}
            {isVenue && (user?.capacity || user?.venueCapacity) && (
              <span className="badge bg-secondary" title="Capacity">
                {user.capacity || user.venueCapacity} cap
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return clickable ? (
    <Link
      to={profileHref}
      className="text-reset text-decoration-none d-block h-100"
      onClick={onClick}
    >
      {CardInner}
    </Link>
  ) : (
    <div className="d-block h-100" onClick={onClick} role="button">
      {CardInner}
    </div>
  );
}
