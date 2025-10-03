import PropTypes from "prop-types";

function Stars({ score }) {
  const s = Math.max(0, Math.min(5, Number(score) || 0));
  return <span>{"★".repeat(s)}{"☆".repeat(5 - s)}</span>;
}

export default function ReviewCard({ score, comment, raterId, offerId, createdAt }) {
  return (
    <li className="list-group-item d-flex justify-content-between">
      <div>
        <Stars score={score} />{comment && <span className="ms-2">“{comment}”</span>}
        <div className="text-muted small">
          by user #{raterId}{offerId ? ` · offer #${offerId}` : ""}
        </div>
      </div>
      <div className="text-muted small">
        {createdAt ? new Date(createdAt).toLocaleString() : ""}
      </div>
    </li>
  );
}

ReviewCard.propTypes = {
  score: PropTypes.number.isRequired,
  comment: PropTypes.string,
  raterId: PropTypes.number.isRequired,
  offerId: PropTypes.number,
  createdAt: PropTypes.string,
};
