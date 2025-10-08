import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";
import ReviewCard from "../components/ReviewCard.jsx";
import OfferCard from "../components/OfferCard.jsx";

function initials(text = "") {
  return text.split(" ").map(w => w[0]?.toUpperCase()).join("").slice(0, 2) || "?";
}

export const Profile = () => {
  const backend = import.meta.env.VITE_BACKEND_URL;
  const { store, dispatch } = useGlobalReducer();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  // Logged-in user
  const userId = store.currentUser?.userId ?? null;
  const getToken = () => localStorage.getItem("token") || "";

  // -------- UI (modals) --------
  const [showEdit, setShowEdit] = useState(false);
  const [showOfferForm, setShowOfferForm] = useState(false);

  // -------- User form state --------
  const [form, setForm] = useState({
    email: "",
    name: "",
    city: "",
    role: "performer",
    avatarUrl: "",
    capacity: ""
  });
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [errUser, setErrUser] = useState("");

  // -------- Offer form state --------
  const [offer, setOffer] = useState({
    title: "",
    description: "",
    city: "",
    venueName: "",
    genre: "",
    budget: "",
    eventDate: "",
    capacity: ""
  });
  const [savingOffer, setSavingOffer] = useState(false);
  const [errOffer, setErrOffer] = useState("");
  const [lastCreatedOffer, setLastCreatedOffer] = useState(null);

  // -------- Reviews & city-offers for performers --------
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [cityOffers, setCityOffers] = useState([]); // offers in the user's city (for performers)
  const [loadingCityOffers, setLoadingCityOffers] = useState(false);

  // Load user
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingUser(true); setErrUser("");
        const t = getToken();
        if (!t) { throw new Error("Not logged in"); }
        const res = await fetch(`${backend}/api/auth/me`, {
          headers: { "Authorization": `Bearer ${t}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Error loading user");

        dispatch({ type: "set_user", payload: data });
        setForm({
          email: data.email || "",
          name: data.name || "",
          city: data.city || "",
          role: data.role || "performer",
          avatarUrl: data.avatarUrl || "",
          capacity: data.capacity ?? ""
        });

        // pre-fill offer defaults from user
        setOffer(o => ({
          ...o,
          city: data.city || "",
          capacity: data.capacity ?? ""
        }));
      } catch (e) {
        setErrUser(e.message);
      } finally {
        setLoadingUser(false);
      }
    };
    load();
  }, [backend, userId, dispatch]);

  // Load reviews
  useEffect(() => {
    const loadReviews = async () => {
      try {
        setLoadingReviews(true);
        const res = await fetch(`${backend}/api/users/${userId}/reviews`);
        const data = await res.json();
        if (res.ok) setReviews(Array.isArray(data) ? data : []);
      } finally {
        setLoadingReviews(false);
      }
    };
    loadReviews();
  }, [backend, userId]);

  // If performer, show offers in their city (client-side filtered)
  useEffect(() => {
    const fetchCityOffers = async () => {
      if (form.role !== "performer" || !form.city) {
        setCityOffers([]); return;
      }
      try {
        setLoadingCityOffers(true);
        const res = await fetch(`${backend}/api/offers`, { headers: authHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || data?.msg || "Error loading offers");
        const inCity = (Array.isArray(data) ? data : []).filter(o => {
          const sameCity =
            (o.city || "").toLowerCase().trim() === form.city.toLowerCase().trim();
          const isOpen = (o.status || "").toLowerCase() === "open";
          return sameCity && isOpen;
        });

        setCityOffers(inCity.slice(0, 6)); // show a few
      } catch {
        setCityOffers([]);
      } finally {
        setLoadingCityOffers(false);
      }
    };
    fetchCityOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, form.role, form.city, token]);

  const onChange = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // PUT user
  const saveUser = async (e) => {
    e.preventDefault();
    try {
      setSavingUser(true); setErrUser("");
      if (!token) throw new Error("You must be logged in.");
      const res = await fetch(`${backend}/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          city: form.city,
          role: form.role,
          avatarUrl: form.avatarUrl || null,
          capacity: form.role === "distributor" && form.capacity !== "" ? Number(form.capacity) : null
        })
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated?.message || updated?.msg || "Error updating profile");

      dispatch({ type: "set_user", payload: updated });
      setShowEdit(false);
      alert("Profile saved!");
    } catch (e) {
      setErrUser(e.message);
    } finally {
      setSavingUser(false);
    }
  };

  // POST offer
  const createOffer = async (e) => {
    e.preventDefault();
    try {
      setSavingOffer(true); setErrOffer("");
      if (!token) throw new Error("You must be logged in.");

      const payload = {
        distributorId: userId, // backend will still require JWT; this is for record/validation
        title: offer.title,
        description: offer.description,
        city: offer.city,
        venueName: offer.venueName,
        genre: offer.genre || undefined,
        budget: offer.budget ? Number(offer.budget) : undefined,
        eventDate: offer.eventDate,
        capacity: offer.capacity ? Number(offer.capacity) : undefined
      };

      const res = await fetch(`${backend}/api/offers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.msg || "Error creating offer");

      setLastCreatedOffer(data);
      setShowOfferForm(false);
      alert(`Offer created (#${data.offerId})`);
    } catch (e) {
      setErrOffer(e.message);
    } finally {
      setSavingOffer(false);
    }
  };

  if (loadingUser) {
    return <div className="container py-5 text-center">Loading profile…</div>;
  }

  return (
    <div className="container py-4" style={{ maxWidth: 980 }}>
      {/* Header */}
      <div className="card mb-3">
        <div className="card-body d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            {form.avatarUrl ? (
              <img
                src={form.avatarUrl}
                alt={form.name}
                className="rounded-circle me-3"
                style={{ width: 64, height: 64, objectFit: "cover" }}
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            ) : (
              <div
                className="rounded-circle bg-secondary text-white d-flex justify-content-center align-items-center me-3"
                style={{ width: 64, height: 64 }}
              >
                {initials(form.name || form.email)}
              </div>
            )}
            <div>
              <h2 className="h4 mb-1">{form.name || "Unnamed User"}</h2>
              <div className="text-muted small">
                <span className="me-3"><b>Role:</b> {form.role || "—"}</span>
                <span className="me-3"><b>City:</b> {form.city || "—"}</span>
                <span className="me-3"><b>Email:</b> {form.email || "—"}</span>
              </div>
            </div>
          </div>
          <div className="text-end">
            <div>⭐ {store.currentUser?.ratingAvg ?? 0} <small className="text-muted">/ 5</small></div>
            <div className="text-muted small">{store.currentUser?.ratingCount ?? 0} reviews</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-3 d-flex gap-2">
        <button className="btn btn-outline-primary" onClick={() => setShowEdit(true)}>
          Edit profile
        </button>

        {form.role === "distributor" && (
          <button className="btn btn-primary" onClick={() => setShowOfferForm(true)}>
            Create Offer
          </button>
        )}

        <Link to="/offers" className="btn btn-outline-secondary">Your Offers</Link>
      </div>

      {/* Performer: offers from your city */}
      {form.role === "performer" && (
        <div className="card mb-3">
          <div className="card-header">Offers in {form.city || "your city"}</div>
          <div className="card-body">
            {loadingCityOffers && <div>Loading…</div>}
            {!loadingCityOffers && cityOffers.length === 0 && (
              <div className="text-muted">No offers found for your city yet.</div>
            )}
            {!loadingCityOffers && cityOffers.length > 0 && (
              <div className="row g-3">
                {cityOffers.map(o => (
                  <div className="col-12 col-md-6 col-lg-4" key={`city-${o.offerId}`}>
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
          </div>
        </div>
      )}

      {/* Last created offer preview */}
      {lastCreatedOffer && (
        <div className="card mb-3">
          <div className="card-header">Last created offer</div>
          <div className="card-body">
            <OfferCard
              title={lastCreatedOffer.title}
              city={lastCreatedOffer.city}
              venueName={lastCreatedOffer.venueName}
              eventDate={lastCreatedOffer.eventDate}
              genre={lastCreatedOffer.genre}
              budget={lastCreatedOffer.budget}
              capacity={lastCreatedOffer.capacity}
              distributorId={lastCreatedOffer.distributorId}
              onAction={() => navigate(`/offers/${lastCreatedOffer.offerId}`)}
              actionText="Details"
            />
          </div>
        </div>
      )}

      {/* Reviews */}
      <div className="card">
        <div className="card-header">Reviews</div>
        <div className="card-body">
          {loadingReviews && <div>Loading…</div>}
          {!loadingReviews && reviews.length === 0 && (
            <div className="text-muted">No reviews yet.</div>
          )}
          {!loadingReviews && reviews.length > 0 && (
            <ul className="list-group">
              {reviews.map(r => (
                <ReviewCard
                  key={r.reviewId}
                  score={r.score}
                  comment={r.comment}
                  raterId={r.raterId}
                  offerId={r.offerId}
                  createdAt={r.createdAt}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* --------- Edit Profile Modal --------- */}
      <div className={`modal ${showEdit ? "show d-block" : ""}`} tabIndex="-1" role="dialog" aria-hidden={!showEdit}>
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <form onSubmit={saveUser}>
              <div className="modal-header">
                <h5 className="modal-title">Edit profile</h5>
                <button type="button" className="btn-close" onClick={() => setShowEdit(false)} />
              </div>
              <div className="modal-body">
                {errUser && <div className="alert alert-danger">{errUser}</div>}
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Email</label>
                    <input className="form-control" type="email" value={form.email} onChange={onChange("email")} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Name</label>
                    <input className="form-control" value={form.name} onChange={onChange("name")} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">City</label>
                    <input className="form-control" value={form.city} onChange={onChange("city")} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Role</label>
                    <select className="form-select" value={form.role} onChange={onChange("role")}>
                      <option value="performer">performer</option>
                      <option value="distributor">distributor</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  {form.role === "distributor" && (
                    <div className="col-md-4">
                      <label className="form-label">Capacity (venue)</label>
                      <input className="form-control" type="number" value={form.capacity}
                        onChange={onChange("capacity")} placeholder="e.g., 120" />
                    </div>
                  )}
                  <div className="col-md-12">
                    <label className="form-label">Avatar URL</label>
                    <input className="form-control" value={form.avatarUrl} onChange={onChange("avatarUrl")} />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
                <button className="btn btn-success" disabled={savingUser}>
                  {savingUser ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      {showEdit && <div className="modal-backdrop fade show" onClick={() => setShowEdit(false)} />}

      {/* --------- Create Offer Modal --------- */}
      <div className={`modal ${showOfferForm ? "show d-block" : ""}`} tabIndex="-1" role="dialog" aria-hidden={!showOfferForm}>
        <div className="modal-dialog modal-lg" role="document">
          <div className="modal-content">
            <form onSubmit={createOffer}>
              <div className="modal-header">
                <h5 className="modal-title">New Offer</h5>
                <button type="button" className="btn-close" onClick={() => setShowOfferForm(false)} />
              </div>
              <div className="modal-body">
                {errOffer && <div className="alert alert-danger">{errOffer}</div>}
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Title *</label>
                    <input className="form-control" value={offer.title}
                      onChange={e => setOffer({ ...offer, title: e.target.value })} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">City *</label>
                    <input className="form-control" value={offer.city}
                      onChange={e => setOffer({ ...offer, city: e.target.value })} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Venue name *</label>
                    <input className="form-control" value={offer.venueName}
                      onChange={e => setOffer({ ...offer, venueName: e.target.value })} required />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Event date *</label>
                    <input type="datetime-local" className="form-control" value={offer.eventDate}
                      onChange={e => setOffer({ ...offer, eventDate: e.target.value })} required />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Description *</label>
                    <textarea className="form-control" rows={3} value={offer.description}
                      onChange={e => setOffer({ ...offer, description: e.target.value })} required />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Genre (optional)</label>
                    <input className="form-control" value={offer.genre}
                      onChange={e => setOffer({ ...offer, genre: e.target.value })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Budget (optional)</label>
                    <input type="number" className="form-control" value={offer.budget}
                      onChange={e => setOffer({ ...offer, budget: e.target.value })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label">Capacity *</label>
                    <input type="number" className="form-control" value={offer.capacity}
                      onChange={e => setOffer({ ...offer, capacity: e.target.value })}
                      placeholder={String(form.capacity ?? "")} />
                    <div className="form-text">
                      If empty, your profile capacity will be used (if set).
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowOfferForm(false)}>Cancel</button>
                <button className="btn btn-success" disabled={savingOffer}>
                  {savingOffer ? "Creating…" : "Create Offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      {showOfferForm && <div className="modal-backdrop fade show" onClick={() => setShowOfferForm(false)} />}
    </div>
  );
};
