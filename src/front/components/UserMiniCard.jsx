import PropTypes from "prop-types";

function initials(text = "") {
  return text.split(" ").map(w => w[0]?.toUpperCase()).join("").slice(0,2) || "?";
}

export default function UserMiniCard({ name, email, city, avatarUrl, createdAt }) {
  return (
    <div className="card mb-2">
      <div className="card-body d-flex align-items-center">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="rounded-circle me-3"
            style={{ width: 40, height: 40, objectFit: "cover" }}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <div
            className="rounded-circle bg-secondary text-white d-flex justify-content-center align-items-center me-3"
            style={{ width: 40, height: 40 }}
          >
            {initials(name || email)}
          </div>
        )}
        <div className="flex-grow-1">
          <div className="fw-semibold">{name || email}</div>
          <div className="text-muted small">{city || "—"}</div>
        </div>
        {createdAt && (
          <div className="text-muted small">
            {new Date(createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

UserMiniCard.propTypes = {
  name: PropTypes.string,
  email: PropTypes.string,
  city: PropTypes.string,
  avatarUrl: PropTypes.string,
  createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
};
