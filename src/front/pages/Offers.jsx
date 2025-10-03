import { useEffect, useState } from "react";
import OfferCard from "../components/OfferCard.jsx";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Offers = () => {
  const backend = import.meta.env.VITE_BACKEND_URL;
  const { store } = useGlobalReducer();
  const userId = store.currentUser?.userId ?? 1; // fallback for now

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

        const [r1, r2] = await Promise.all([
          fetch(`${backend}/api/users/${userId}/offers/created`),
          fetch(`${backend}/api/users/${userId}/offers/applied`),
        ]);

        const [d1, d2] = await Promise.all([r1.json(), r2.json()]);

        if (!r1.ok) throw new Error(d1?.message || "Error loading created offers");
        if (!r2.ok) throw new Error(d2?.message || "Error loading applied offers");

        if (!alive) return;
        setCreated(Array.isArray(d1) ? d1 : []);
        setApplied(Array.isArray(d2) ? d2 : []);
      } catch (e) {
        if (!alive) return;
        setErr(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [backend, userId]);

  if (loading) return <div className="container py-5 text-center">Loading your offers…</div>;

  return (
    <div className="container py-4">
      <h1 className="h4 mb-4">Your Offers</h1>
      {err && <div className="alert alert-danger">{err}</div>}

      {/* Created by you (as distributor) */}
      <section className="mb-4">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Created by you</h2>
          <span className="text-muted small">{created.length} total</span>
        </div>

        {created.length === 0 ? (
          <div className="text-muted">You haven’t created any offers yet.</div>
        ) : (
          <div className="row g-3">
            {created.map(o => (
              <div className="col-12 col-md-6 col-lg-4" key={o.offerId}>
                <OfferCard
                  title={o.title}
                  city={o.city}
                  venueName={o.venueName}
                  eventDate={o.eventDate}
                  genre={o.genre}
                  budget={o.budget}
                  capacity={o.capacity}
                  distributorId={o.distributorId}
                  onAction={() => console.log("Open offer", o.offerId)}
                  actionText="Details"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Offers where you applied / have a match (as performer) */}
      <section>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Applied / matched</h2>
          <span className="text-muted small">{applied.length} total</span>
        </div>

        {applied.length === 0 ? (
          <div className="text-muted">No applications yet.</div>
        ) : (
          <div className="row g-3">
            {applied.map(o => (
              <div className="col-12 col-md-6 col-lg-4" key={`${o.offerId}-${o.matchId || "m"}`}>
                <OfferCard
                  title={o.title}
                  city={o.city}
                  venueName={o.venueName}
                  eventDate={o.eventDate}
                  genre={o.genre}
                  budget={o.budget}
                  capacity={o.capacity}
                  distributorId={o.distributorId}
                  onAction={() => console.log("Open offer", o.offerId)}
                  actionText={o.matchStatus ? `Match: ${o.matchStatus}` : "Details"}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
