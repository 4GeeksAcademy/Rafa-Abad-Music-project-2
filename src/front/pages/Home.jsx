import { useEffect, useState } from "react";
import UserMiniCard from "../components/UserMiniCard.jsx";
import { Link } from "react-router-dom";

export const Home = () => {
  const backend = import.meta.env.VITE_BACKEND_URL;
  const [venues, setVenues] = useState([]);
  const [performers, setPerformers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true); setErr("");
        const [rv, rp] = await Promise.all([
          fetch(`${backend}/api/users/latest?role=distributor&limit=3`),
          fetch(`${backend}/api/users/latest?role=performer&limit=3`)
        ]);
        const [dv, dp] = await Promise.all([rv.json(), rp.json()]);
        if (!rv.ok) throw new Error(dv?.message || "Error loading venues");
        if (!rp.ok) throw new Error(dp?.message || "Error loading performers");
        if (!alive) return;
        setVenues(Array.isArray(dv) ? dv : []);
        setPerformers(Array.isArray(dp) ? dp : []);
      } catch (e) {
        if (!alive) return;
        setErr(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [backend]);

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Welcome to Music Match</h1>
        <div className="d-flex gap-2">
          <Link to="/login" className="btn btn-outline-secondary">Login</Link>
          <Link to="/profile" className="btn btn-outline-secondary">Profile</Link>
          <Link to="/offers" className="btn btn-primary">Offers</Link>
        </div>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      {loading ? (
        <div className="text-center py-5">Loading latest users…</div>
      ) : (
        <div className="row g-4">
          {/* Left: latest venues (distributors) */}
          <div className="col-12 col-lg-6">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h2 className="h5 mb-0">Newest Venues</h2>
              <span className="text-muted small">{venues.length} shown</span>
            </div>
            {venues.length === 0 ? (
              <div className="text-muted">No venues yet.</div>
            ) : (
              venues.map(u => (
                <UserMiniCard
                  key={u.userId}
                  name={u.name}
                  email={u.email}
                  city={u.city}
                  avatarUrl={u.avatarUrl}
                  createdAt={u.createdAt}
                />
              ))
            )}
          </div>

          {/* Right: latest performers */}
          <div className="col-12 col-lg-6">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <h2 className="h5 mb-0">Newest Performers</h2>
              <span className="text-muted small">{performers.length} shown</span>
            </div>
            {performers.length === 0 ? (
              <div className="text-muted">No performers yet.</div>
            ) : (
              performers.map(u => (
                <UserMiniCard
                  key={u.userId}
                  name={u.name}
                  email={u.email}
                  city={u.city}
                  avatarUrl={u.avatarUrl}
                  createdAt={u.createdAt}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
