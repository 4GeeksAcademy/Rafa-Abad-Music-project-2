// src/front/pages/Home.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import OfferCard from "../components/OfferCard.jsx";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Home = () => {
  const backend = import.meta.env.VITE_BACKEND_URL;
  const navigate = useNavigate();
  const { store } = useGlobalReducer();

  const token = localStorage.getItem("token") || "";
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const role = (store.currentUser?.role || "").toLowerCase();
  const isPerformer = role === "performer";

  const [latestPerformers, setLatestPerformers] = useState([]);
  const [latestVenues, setLatestVenues] = useState([]);
  const [latestOffers, setLatestOffers] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");

        // --- Always load latest performers & venues (public) ---
        const [rp, rv] = await Promise.all([
          fetch(`${backend}/api/users/latest?role=performer&limit=3`),
          fetch(`${backend}/api/users/latest?role=distributor&limit=3`),
        ]);
        const [dp, dv] = await Promise.all([rp.json(), rv.json()]);
        if (alive && rp.ok && Array.isArray(dp)) setLatestPerformers(dp);
        if (alive && rv.ok && Array.isArray(dv)) setLatestVenues(dv);

        // --- If not logged in, skip fetching offers ---
        if (!token) {
          if (alive) setLatestOffers([]);
          return;
        }

        // --- Logged-in users: fetch offers ---
        const ro = await fetch(`${backend}/api/offers`, { headers: authHeaders });
        if (!alive) return;

        if (ro.ok) {
          const dof = await ro.json();
          const all = Array.isArray(dof) ? dof.slice(0, 10) : [];

          // Performers only see open offers
          const filtered = isPerformer
            ? all.filter(o => (o.status || "").toLowerCase() === "open")
            : all;

          setLatestOffers(filtered);
        } else {
          setLatestOffers([]);
        }
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load home data");
      }
    })();

    return () => { alive = false; };
  }, [backend, authHeaders, isPerformer, token]);


  return (
    <div className="container py-4">
      <header className="mb-4 d-flex justify-content-between align-items-center">
        <h1 className="h4 mb-0">
          {store.currentUser?.name ? `Welcome back, ${store.currentUser.name}` : "Welcome to Rafa Abad Music"}
        </h1>
        <div className="d-flex gap-2">
          <Link to="/offers" className="btn btn-outline-secondary">Your Offers</Link>
          <Link to="/profile" className="btn btn-primary">Profile</Link>
        </div>
      </header>
      <div
        className="hero mb-4"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1600&auto=format&fit=crop')`,
        }}
      >
        <div className="hero-inner p-5">
          <h1 className="display-6 mb-2">Find the right stage or performer</h1>
          <p className="lead text-eggshell-2 mb-3" style={{ opacity: .85 }}>
            Connect venues and artists. Apply, chat, and conclude deals.
          </p>
          <div className="d-flex gap-2">
            <Link to="/offers" className="btn btn-primary btn-glow">Browse Offers</Link>
            <Link to="/profile" className="btn btn-outline-secondary">Your Profile</Link>
          </div>
        </div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      {/* Latest Offers */}
      <section className="mb-4">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Latest offers</h2>
          <span className="text-muted small">{latestOffers.length} shown</span>
        </div>

        {!token ? (
          <div className="text-muted">Log in to see the latest offers!</div>
        ) : latestOffers.length === 0 ? (
          <div className="text-muted">No offers to show yet.</div>
        ) : (
          <div className="row g-3">
            {latestOffers.map(o => (
              <div className="col-12 col-md-6 col-lg-4" key={`home-offer-${o.offerId}`}>
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

      </section>

      {/* Latest performers */}
      <section className="mb-4">
        <h2 className="h5 mb-2">New performers</h2>
        {latestPerformers.length === 0 ? (
          <div className="text-muted">No performers yet.</div>
        ) : (
          <ul className="list-group">
            {latestPerformers.map(u => (
              <li className="list-group-item d-flex justify-content-between align-items-center" key={`p-${u.userId}`}>
                <div>
                  <strong>{u.name}</strong>{" "}
                  <span className="text-muted">({u.city})</span>
                </div>
                <span className="badge bg-secondary">⭐ {u.ratingAvg ?? 0} / 5</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Latest venues */}
      <section className="mb-4">
        <h2 className="h5 mb-2">New venues</h2>
        {latestVenues.length === 0 ? (
          <div className="text-muted">No venues yet.</div>
        ) : (
          <ul className="list-group">
            {latestVenues.map(u => (
              <li className="list-group-item d-flex justify-content-between align-items-center" key={`v-${u.userId}`}>
                <div>
                  <strong>{u.name}</strong>{" "}
                  <span className="text-muted">({u.city})</span>
                </div>
                <span className="badge bg-secondary">Capacity {u.capacity ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
