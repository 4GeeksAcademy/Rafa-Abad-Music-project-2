import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";
import OfferCard from "../components/OfferCard.jsx";
import UserMiniCard from "../components/UserMiniCard.jsx";

const LIMIT = 10;

// Tiny JWT payload decoder (no lib)
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const Home = () => {
  const backend = import.meta.env.VITE_BACKEND_URL;
  const navigate = useNavigate();
  const { store } = useGlobalReducer();

  // Persist role/city across refresh
  const token = localStorage.getItem("token") || "";
  const cachedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null") || null;
    } catch {
      return null;
    }
  })();
  const tokenClaims = parseJwt(token);

  const role = (
    store.currentUser?.role ||
    cachedUser?.role ||
    tokenClaims?.role ||
    ""
  ).toLowerCase();

  const userCity = store.currentUser?.city || cachedUser?.city || "";

  const isPerformer = role === "performer";
  const isDistributor = role === "distributor" || role === "venue";
  const isAdmin = role === "admin";
  const isGuest = !role;

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  const [latestPerformers, setLatestPerformers] = useState([]);
  const [latestVenues, setLatestVenues] = useState([]);
  const [latestOffers, setLatestOffers] = useState([]);
  const [err, setErr] = useState("");

  // City filter (admins/guests start with "All")
  const [city, setCity] = useState(isAdmin || isGuest ? "" : userCity);

  // Build city options from fetched data + user city
  const cityOptions = useMemo(() => {
    const set = new Set();
    if (userCity) set.add(userCity);
    latestPerformers.forEach((u) => u.city && set.add(u.city));
    latestVenues.forEach((u) => u.city && set.add(u.city));
    latestOffers.forEach((o) => o.city && set.add(o.city));
    return ["", ...Array.from(set).sort()];
  }, [latestPerformers, latestVenues, latestOffers, userCity]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");

        // Public latest users
        const [rp, rv] = await Promise.all([
          fetch(`${backend}/api/users/latest?role=performer&limit=${LIMIT}`),
          fetch(`${backend}/api/users/latest?role=distributor&limit=${LIMIT}`),
        ]);
        const [dp, dv] = await Promise.all([rp.json(), rv.json()]);

        if (alive && rp.ok && Array.isArray(dp))
          setLatestPerformers(dp.slice(0, LIMIT));
        if (alive && rv.ok && Array.isArray(dv))
          setLatestVenues(dv.slice(0, LIMIT));

        // Offers (performers/admin only)
        if (!token || !(isPerformer || isAdmin)) {
          if (alive) setLatestOffers([]);
          return;
        }

        const ro = await fetch(`${backend}/api/offers`, { headers: authHeaders });
        if (!alive) return;

        if (ro.ok) {
          const all = (await ro.json()) || [];
          const filtered = isPerformer
            ? all.filter((o) => (o.status || "").toLowerCase() === "open")
            : all;
          setLatestOffers(filtered.slice(0, LIMIT));
        } else {
          setLatestOffers([]);
        }
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load home data");
      }
    })();

    return () => {
      alive = false;
    };
  }, [backend, authHeaders, isPerformer, isAdmin, token]);

  // Client-side city filter
  const byCity = (arr) =>
    !city ? arr : arr.filter((x) => (x.city || "").toLowerCase() === city.toLowerCase());

  // HERO copy (role-conditional, refresh-safe)
  const heroTitle = (() => {
    if (isPerformer) return "Find the right stage";
    if (isDistributor) return "Find the right performer";
    if (isAdmin) return "Oversee venues and performers";
    return "Find the right stage or performer";
  })();

  const heroSub = (() => {
    // This is the message you asked to make conditional
    if (isPerformer) return "Connect with venues. Apply, chat, and conclude deals.";
    if (isDistributor) return "Connect with artists. Post offers, chat, and conclude deals.";
    if (isAdmin) return "Connect venues and artists. Apply, chat, and conclude deals across all cities.";
    return "Connect venues and artists. Apply, chat, and conclude deals.";
  })();

  // Which blocks to show
  const showPerformers = isDistributor || isAdmin || isGuest;
  const showVenues = isPerformer || isAdmin || isGuest;
  const showOffers = isPerformer || isAdmin; // venues should NOT see offers

  return (
    <div className="container py-4">
      {/* Hero with full image visible and role-conditional copy */}
      <div
        className="hero mb-4"
        style={{
          position: "relative",
          minHeight: 360,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: "rgba(0,0,0,0.25)",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "url('https://images.unsplash.com/photo-1563841930606-67e2bce48b78?auto=format&q=80&w=1600')",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundSize: "contain", // show the whole image
            opacity: 0.45,
            filter: "saturate(1.05) contrast(1.05)",
          }}
        />
        <div className="hero-inner p-5 position-relative">
          <h1 className="display-6 mb-2">{heroTitle}</h1>
          <p className="lead text-eggshell-2 mb-3" style={{ opacity: 0.9 }}>
            {heroSub}
          </p>
          <div className="d-flex gap-2">
            <Link to="/offers" className="btn btn-primary btn-glow">
              Browse Offers
            </Link>
            <Link to="/profile" className="btn btn-outline-secondary">
              Your Profile
            </Link>
          </div>
        </div>
      </div>

      {/* City selector */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <label htmlFor="home-city" className="form-label mb-0">
          City:
        </label>
        <select
          id="home-city"
          className="form-select"
          style={{ maxWidth: 260 }}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          {cityOptions.map((opt) => (
            <option key={`city-${opt || "all"}`} value={opt}>
              {opt ? opt : isAdmin || isGuest ? "All cities" : `All${userCity ? ` (${userCity} + others)` : ""}`}
            </option>
          ))}
        </select>
        {(isPerformer || isDistributor) && userCity && (
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setCity(userCity)}
            title="Use my city"
          >
            Use my city ({userCity})
          </button>
        )}
      </div>

      {err && <div className="alert alert-danger">{err}</div>}

      {/* Offers (performer/admin only, city-filtered) */}
      {showOffers && (
        <section className="mb-4">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h2 className="h5 mb-0">
              {isPerformer ? "Open offers" : "Latest offers"}
              {city ? ` in ${city}` : ""}
            </h2>
            <span className="text-muted small">
              {byCity(latestOffers).length} shown
              {byCity(latestOffers).length > LIMIT ? ` (max ${LIMIT})` : ""}
            </span>
          </div>

          {byCity(latestOffers).length === 0 ? (
            <div className="text-muted">No offers to show{city ? ` for ${city}` : ""}.</div>
          ) : (
            <div className="row g-3">
              {byCity(latestOffers)
                .slice(0, LIMIT)
                .map((o) => (
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
      )}

      {/* Performers list (for venues/admin/guest) */}
      {showPerformers && (
        <section className="mb-4">
          <h2 className="h5 mb-2">
            {isDistributor ? "Performers" : "New performers"}
            {city ? ` in ${city}` : ""}
          </h2>
          {byCity(latestPerformers).length === 0 ? (
            <div className="text-muted">No performers{city ? ` in ${city}` : ""}.</div>
          ) : (
            <div className="row g-3">
              {byCity(latestPerformers)
                .slice(0, LIMIT)
                .map((u) => (
                  <div className="col-12 col-sm-6 col-lg-4" key={`p-${u.userId}`}>
                    <UserMiniCard
                      user={u}
                      onClick={() => navigate(`/profile/${u.userId}`)}
                      clickable
                    />
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* Venues list (for performers/admin/guest) */}
      {showVenues && (
        <section className="mb-4">
          <h2 className="h5 mb-2">
            {isPerformer ? "Venues" : "New venues"}
            {city ? ` in ${city}` : ""}
          </h2>
          {byCity(latestVenues).length === 0 ? (
            <div className="text-muted">No venues{city ? ` in ${city}` : ""}.</div>
          ) : (
            <div className="row g-3">
              {byCity(latestVenues)
                .slice(0, LIMIT)
                .map((u) => (
                  <div className="col-12 col-sm-6 col-lg-4" key={`v-${u.userId}`}>
                    <UserMiniCard
                      user={u}
                      onClick={() => navigate(`/profile/${u.userId}`)}
                      clickable
                    />
                  </div>
                ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
