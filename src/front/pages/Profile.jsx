import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";
import ReviewCard from "../components/ReviewCard.jsx";
import OfferCard from "../components/OfferCard.jsx";

function initials(text = "") {
  return text.split(" ").map(w => w[0]?.toUpperCase()).join("").slice(0, 2) || "?";
}

export const Profile = () => {
  const { id: routeId } = useParams(); // allow /profile/:id
  const backend = import.meta.env.VITE_BACKEND_URL;
  const { store, dispatch } = useGlobalReducer();
  const navigate = useNavigate();

  // ---- Fresh auth helpers (prevents stale token -> 401) ----
  const getToken = () => localStorage.getItem("token") || "";
  const getAuthHeaders = () => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  // Logged-in user
  const myId = store.currentUser?.userId ?? null;
  const viewingOther = !!routeId && String(routeId) !== String(myId);
  const targetUserId = viewingOther ? routeId : myId;
  const canEdit = !viewingOther || store.currentUser?.role === "admin"; // self or admin
  const canDelete = canEdit;

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
  const [cityOffers, setCityOffers] = useState([]);
  const [loadingCityOffers, setLoadingCityOffers] = useState(false);

  // ----- Load either me or a specific user -----
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingUser(true); setErrUser("");

        if (viewingOther) {
          // View another user's public profile
          const res = await fetch(`${backend}/api/users/${targetUserId}`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.message || "User not found");

          // Do NOT persist someone else's profile into current user
          setForm({
            email: data.email || "",
            name: data.name || "",
            city: data.city || "",
            role: data.role || "performer",
            avatarUrl: data.avatarUrl || "",
            capacity: data.capacity ?? ""
          });

          setOffer(o => ({ ...o, city: data.city || "", capacity: data.capacity ?? "" }));
        } else {
          // Own profile
          const t = getToken();
          if (!t) throw new Error("Not logged in");

          const res = await fetch(`${backend}/api/auth/me`, {
            headers: getAuthHeaders(),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.message || "Error loading user");

          // Update app state + persist me (prevents navbar flicker after refresh)
          dispatch({ type: "set_user", payload: data });
          localStorage.setItem("user", JSON.stringify(data));

          setForm({
            email: data.email || "",
            name: data.name || "",
            city: data.city || "",
            role: data.role || "performer",
            avatarUrl: data.avatarUrl || "",
            capacity: data.capacity ?? ""
          });

          setOffer(o => ({ ...o, city: data.city || "", capacity: data.capacity ?? "" }));
        }
      } catch (e) {
        setErrUser(e.message);
      } finally {
        setLoadingUser(false);
      }
    };
    load();
  }, [backend, viewingOther, targetUserId, dispatch]);

  // ----- Load reviews for the viewed user (me or other) -----
  useEffect(() => {
    const loadReviews = async () => {
      if (!targetUserId) return;
      try {
        setLoadingReviews(true);
        const res = await fetch(`${backend}/api/users/${targetUserId}/reviews`);
        const data = await res.json();
        if (res.ok) setReviews(Array.isArray(data) ? data : []);
      } finally {
        setLoadingReviews(false);
      }
    };
    loadReviews();
  }, [backend, targetUserId]);

  // ----- If performer, show offers in their city -----
  useEffect(() => {
    const fetchCityOffers = async () => {
      if (form.role !== "performer" || !form.city) {
        setCityOffers([]); return;
      }
      try {
        setLoadingCityOffers(true);
        const res = await fetch(`${backend}/api/offers`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || data?.msg || "Error loading offers");
        const inCity = (Array.isArray(data) ? data : []).filter(o => {
          const sameCity =
            (o.city || "").toLowerCase().trim() === form.city.toLowerCase().trim();
          const isOpen = (o.status || "").toLowerCase() === "open";
          return sameCity && isOpen;
        });
        setCityOffers(inCity.slice(0, 6));
      } catch {
        setCityOffers([]);
      } finally {
        setLoadingCityOffers(false);
      }
    };
    fetchCityOffers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, form.role, form.city]);

  const onChange = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // ----- PUT user (self, or admin editing someone else) -----
  const saveUser = async (e) => {
    e.preventDefault();
    if (!canEdit) return;

    try {
      setSavingUser(true); setErrUser("");

      const res = await fetch(`${backend}/api/users/${targetUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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

      // If I edited my own profile, sync store + localStorage
      if (!viewingOther) {
        dispatch({ type: "set_user", payload: updated });
        localStorage.setItem("user", JSON.stringify(updated));
      }

      setShowEdit(false);
      alert("Profile saved!");
    } catch (e) {
      setErrUser(e.message);
    } finally {
      setSavingUser(false);
    }
  };

  // ----- POST offer (own venue flow) -----
  const createOffer = async (e) => {
    e.preventDefault();
    try {
      setSavingOffer(true); setErrOffer("");

      const payload = {
        distributorId: myId,
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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

  // ----- DELETE user (self or admin) -----
  const onDelete = async () => {
    if (!canDelete) return;
    if (!window.confirm("Are you sure you want to delete this account? This cannot be undone.")) return;

    try {
      const res = await fetch(`${backend}/api/users/${targetUserId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      let msg = "Failed to delete user.";
      try {
        const data = await res.json();
        if (!res.ok) msg = data?.message || data?.msg || msg;
        else {
          // success
          alert("Account deleted.");
          if (!viewingOther) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            dispatch({ type: "set_user", payload: null });
          }
          return navigate("/");
        }
      } catch {
        if (!res.ok) alert(msg);
      }
    } catch (e) {
      alert("Error deleting user: " + e.message);
    }
  };

  if (loadingUser) return <div className="container py-5 text-center">Loading profile…</div>;
  if (errUser) return <div className="container py-5 text-center text-danger">{errUser}</div>;

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

          {/* keep your own rating UI only on self */}
          {!viewingOther && (
            <div className="text-end">
              <div>⭐ {store.currentUser?.ratingAvg ?? 0} <small className="text-muted">/ 5</small></div>
              <div className="text-muted small">{store.currentUser?.ratingCount ?? 0} reviews</div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mb-3 d-flex gap-2 flex-wrap">
        {canEdit && (
          <button className="btn btn-outline-primary" onClick={() => setShowEdit(true)}>
            Edit profile
          </button>
        )}

        {!viewingOther && form.role === "distributor" && (
          <button className="btn btn-primary" onClick={() => setShowOfferForm(true)}>
            Create Offer
          </button>
        )}

        {!viewingOther && <Link to="/offers" className="btn btn-outline-secondary">Your Offers</Link>}

        {canDelete && (
          <button className="btn btn-danger ms-auto" onClick={onDelete}>
            Delete account
          </button>
        )}
      </div>

      {/* Performer: offers in this user's city */}
      {form.role === "performer" && (
        <div className="card mb-3">
          <div className="card-header">Offers in {form.city || "their city"}</div>
          <div className="card-body">
            {loadingCityOffers && <div>Loading…</div>}
            {!loadingCityOffers && cityOffers.length === 0 && (
              <div className="text-muted">No offers found for this city yet.</div>
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
      {lastCreatedOffer && !viewingOther && (
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

      {/* ---- Edit Profile Modal (self/admin) ---- */}
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
                <button className="btn btn.success" disabled={savingUser}>
                  {savingUser ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      {showEdit && <div className="modal-backdrop fade show" onClick={() => setShowEdit(false)} />}

      {/* ---- Create Offer Modal (self only) ---- */}
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
