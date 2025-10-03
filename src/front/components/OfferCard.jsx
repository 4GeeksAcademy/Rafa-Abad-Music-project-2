import PropTypes from "prop-types";

export default function OfferCard({
  title, city, venueName, eventDate, genre, budget, capacity, distributorId, onAction, actionText="View"
}) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start">
          <h5 className="card-title mb-1">{title}</h5>
          {genre && <span className="badge bg-secondary">{genre}</span>}
        </div>

        <div className="text-muted small mb-2">
          <span className="me-3"><i className="fa-regular fa-calendar"></i> {eventDate && new Date(eventDate).toLocaleString()}</span>
          <span className="me-3"><i className="fa-solid fa-location-dot"></i> {city} {venueName ? `· ${venueName}` : ""}</span>
        </div>

        <div className="d-flex flex-wrap gap-3 text-muted small mb-3">
          {typeof capacity === "number" && <div><b>Capacity:</b> {capacity}</div>}
          {budget != null && <div><b>Budget:</b> {Number(budget).toFixed(2)}</div>}
          <div><b>Distributor:</b> #{distributorId}</div>
        </div>

        {onAction && (
          <button className="btn btn-primary" onClick={onAction}>{actionText}</button>
        )}
      </div>
    </div>
  );
}

OfferCard.propTypes = {
  title: PropTypes.string.isRequired,
  city: PropTypes.string,
  venueName: PropTypes.string,
  eventDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  genre: PropTypes.string,
  budget: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  capacity: PropTypes.number,
  distributorId: PropTypes.number,
  onAction: PropTypes.func,
  actionText: PropTypes.string,
};
