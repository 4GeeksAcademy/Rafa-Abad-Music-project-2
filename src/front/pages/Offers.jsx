// src/front/pages/Offers.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import OfferCard from "../components/OfferCard.jsx";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Offers = () => {
  const backend = import.meta.env.VITE_BACKEND_URL;
  const navigate = useNavigate();

  const token = localStorage.getItem("token") || "";
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const { store } = useGlobalReducer();
  const userId = store.currentUser?.userId ?? null;

  const [created, setCreated] = useState([]);
  const [applied, setApplied] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        if (!userId || !token) throw new Error("You must be logged in.");

        const [r1, r2] = await Promise.all([
          fetch(`${backend}/api/users/${userId}/offers/created`, { headers: authHeaders }),
          fetch(`${backend}/api/users/${userId}/offers/applied`, { headers: authHeaders }),
        ]);

        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);

        if (!r1.ok) throw new Error(d1?.message || "Error loading created offers");
        if (!r2.ok) throw new Error(d2?.message || "Error loading applied offers");

        if (!alive) return;
        setCreated(Array.isArray(d1) ? d1 : []);
        setApplied(Array.isArray(d2) ? d2 : []);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Failed to load offers");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [backend, userId, token, authHeaders]);

  if (loading) return <div className="container py-5 text-center">Loading your offers…</div>;

  // --- helpers
  const isOpen = (o) => (o?.status || "").toLowerCase() === "open";
  const isFinalized = (o) => !isOpen(o); // closed or cancelled

  const createdActive = created.filter(isOpen);
  const createdFinal = created.filter(isFinalized);

  const appliedActive = applied.filter(isOpen);
  const appliedFinal = applied.filter(isFinalized);

  return (
    <div className="container py-4">
      <h1 className="h4 mb-4">Your Offers</h1>
      {err && <div className="alert alert-danger">{err}</div>}

      {/* Created by you (as distributor/venue) */}
      <section className="mb-5">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Created by you</h2>
          <span className="text-muted small">{created.length} total</span>
        </div>

        {/* Active */}
        <h3 className="h6 mt-3 mb-2">Active</h3>
        {createdActive.length === 0 ? (
          <div className="text-muted">No active offers.</div>
        ) : (
          <div className="row g-3">
            {createdActive.map((o) => (
              <div className="col-12 col-md-6 col-lg-4" key={`c-act-${o.offerId}`}>
                <OfferCard
                  title={o.title}
                  city={o.city}
                  venueName={o.venueName}
                  eventDate={o.eventDate}
                  genre={o.genre}
                  budget={o.budget}
                  capacity={o.capacity}
                  distributorId={o.distributorId}
                  onAction={() => navigate(`/offers/${o.offerId}`)}
                  actionText="Details"
                />
              </div>
            ))}
          </div>
        )}

        {/* Finalized */}
        <h3 className="h6 mt-4 mb-2">Finalized</h3>
        {createdFinal.length === 0 ? (
          <div className="text-muted">No finalized offers.</div>
        ) : (
          <div className="row g-3">
            {createdFinal.map((o) => (
              <div className="col-12 col-md-6 col-lg-4" key={`c-fin-${o.offerId}`}>
                <OfferCard
                  title={o.title}
                  city={o.city}
                  venueName={o.venueName}
                  eventDate={o.eventDate}
                  genre={o.genre}
                  budget={o.budget}
                  capacity={o.capacity}
                  distributorId={o.distributorId}
                  onAction={() => navigate(`/offers/${o.offerId}`)}
                  actionText={(o.status || "").toUpperCase()}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Offers where you applied / matched (as performer) */}
      <section className="mb-4">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Applied / matched</h2>
          <span className="text-muted small">{applied.length} total</span>
        </div>

        {/* Active */}
        <h3 className="h6 mt-3 mb-2">Active</h3>
        {appliedActive.length === 0 ? (
          <div className="text-muted">No active applications.</div>
        ) : (
          <div className="row g-3">
            {appliedActive.map((o) => (
              <div className="col-12 col-md-6 col-lg-4" key={`a-act-${o.offerId}-${o.matchId || "m"}`}>
                <OfferCard
                  title={o.title}
                  city={o.city}
                  venueName={o.venueName}
                  eventDate={o.eventDate}
                  genre={o.genre}
                  budget={o.budget}
                  capacity={o.capacity}
                  distributorId={o.distributorId}
                  onAction={() => navigate(`/offers/${o.offerId}`)}
                  actionText={o.matchStatus ? `Match: ${o.matchStatus}` : "Details"}
                />
              </div>
            ))}
          </div>
        )}

        {/* Finalized */}
        <h3 className="h6 mt-4 mb-2">Finalized</h3>
        {appliedFinal.length === 0 ? (
          <div className="text-muted">No finalized applications.</div>
        ) : (
          <div className="row g-3">
            {appliedFinal.map((o) => (
              <div className="col-12 col-md-6 col-lg-4" key={`a-fin-${o.offerId}-${o.matchId || "m"}`}>
                <OfferCard
                  title={o.title}
                  city={o.city}
                  venueName={o.venueName}
                  eventDate={o.eventDate}
                  genre={o.genre}
                  budget={o.budget}
                  capacity={o.capacity}
                  distributorId={o.distributorId}
                  onAction={() => navigate(`/offers/${o.offerId}`)}
                  actionText={(o.status || "").toUpperCase()}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
