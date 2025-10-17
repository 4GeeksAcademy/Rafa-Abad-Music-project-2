import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";

const API = import.meta.env.VITE_BACKEND_URL;

export const OfferDetails = () => {
    const { offerId } = useParams();
    const navigate = useNavigate();
    const { store } = useGlobalReducer();

    const token = localStorage.getItem("token");
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    const role = (store.currentUser?.role || "").toLowerCase();
    const meId = store.currentUser?.userId ?? null;

    const [offer, setOffer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [matches, setMatches] = useState([]);
    const [loadingMatches, setLoadingMatches] = useState(false);

    const [messages, setMessages] = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [msgBody, setMsgBody] = useState("");
    const [chatBlocked, setChatBlocked] = useState(false);

    // apply form
    const [rate, setRate] = useState("");
    const [applyMsg, setApplyMsg] = useState("");
    const [applying, setApplying] = useState(false);

    // review form
    const [showReview, setShowReview] = useState(false);
    const [reviewScore, setReviewScore] = useState(0);
    const [reviewText, setReviewText] = useState("");
    const [savingReview, setSavingReview] = useState(false);
    const [reviewErr, setReviewErr] = useState("");

    const isPerformer = role === "performer";
    const isVenue = role === "distributor" || role === "admin";

    // Only after closed, and only for the two participants
    const canReview = !!(
        offer &&
        (offer.status || "").toLowerCase() === "closed" &&
        meId &&
        ((role === "distributor" && offer.distributorId === meId && offer.acceptedPerformerId) ||
            (role === "performer" && offer.acceptedPerformerId === meId && offer.distributorId))
    );
    const reviewTargetId = canReview
        ? role === "distributor"
            ? offer?.acceptedPerformerId
            : offer?.distributorId
        : null;

    const concluded = useMemo(
        () => (offer?.status || "").toLowerCase() !== "open",
        [offer?.status]
    );

    // Load offer
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setErr("");
                const r = await fetch(`${API}/api/offers/${offerId}`);
                const d = await r.json();
                if (!alive) return;
                if (!r.ok) throw new Error(d?.message || d?.msg || "Offer not found");
                setOffer(d);
            } catch (e) {
                setErr(e.message);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [offerId]);

    // Venue/Admin: load matches
    useEffect(() => {
        if (!isVenue) return;
        let alive = true;
        (async () => {
            try {
                setLoadingMatches(true);
                const r = await fetch(`${API}/api/offers/${offerId}/matches`, {
                    headers: authHeaders,
                });
                const d = await r.json();
                if (!alive) return;
                if (r.ok) setMatches(Array.isArray(d) ? d : []);
            } finally {
                if (alive) setLoadingMatches(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [offerId, isVenue, token]);

    // Load messages (performers may get 403 if not approved)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoadingMsgs(true);
                setChatBlocked(false);
                const r = await fetch(`${API}/api/offers/${offerId}/messages`, {
                    headers: authHeaders,
                });
                const d = await r.json();
                if (!alive) return;
                if (r.ok) setMessages(Array.isArray(d) ? d : []);
                else if (r.status === 403) setChatBlocked(true);
            } finally {
                if (alive) setLoadingMsgs(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [offerId, token]);

    const applyToOffer = async (e) => {
        e.preventDefault();
        if (!isPerformer) return alert("Only performers can apply.");
        if (!token) return alert("You must be logged in.");
        if (rate === "" || Number(rate) < 0) return alert("Rate is required.");

        try {
            setApplying(true);
            const r = await fetch(`${API}/api/offers/${offerId}/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({
                    rate: Number(rate),
                    message: applyMsg || undefined,
                }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not apply");
            alert("Application sent!");
            setRate("");
            setApplyMsg("");
        } catch (e) {
            alert(e.message);
        } finally {
            setApplying(false);
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!msgBody.trim()) return;
        try {
            const r = await fetch(`${API}/api/offers/${offerId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ body: msgBody.trim() }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not send message");
            setMsgBody("");
            // reload
            const r2 = await fetch(`${API}/api/offers/${offerId}/messages`, {
                headers: authHeaders,
            });
            const d2 = await r2.json();
            if (r2.ok) setMessages(Array.isArray(d2) ? d2 : []);
        } catch (e) {
            alert(e.message);
        }
    };

    // Venue-only actions
    const [payOpen, setPayOpen] = useState(false);

    const approveChat = async (performerId, approved = true) => {
        try {
            const r = await fetch(`${API}/api/offers/${offerId}/approve-chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ performerId, approved }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not update chat");
            // refresh matches
            const r2 = await fetch(`${API}/api/offers/${offerId}/matches`, {
                headers: authHeaders,
            });
            const d2 = await r2.json();
            if (r2.ok) setMatches(Array.isArray(d2) ? d2 : []);
        } catch (e) {
            alert(e.message);
        }
    };

    const acceptPerformer = async (performerId) => {
        try {
            const r = await fetch(`${API}/api/offers/${offerId}/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ performerId }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not accept performer");
            if (d?.offer) setOffer(d.offer);
        } catch (e) {
            alert(e.message);
        }
    };

    const concludeOffer = async (status = "closed") => {
        try {
            const r = await fetch(`${API}/api/offers/${offerId}/conclude`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ status }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not update offer status");
            setOffer(d);
        } catch (e) {
            alert(e.message);
        }
    };

    // Submit review
    const submitReview = async (e) => {
        e.preventDefault();
        if (!canReview || !reviewTargetId) return;
        if (reviewScore < 1 || reviewScore > 5)
            return setReviewErr("Please choose a star rating.");

        try {
            setSavingReview(true);
            setReviewErr("");
            const res = await fetch(`${API}/api/reviews`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({
                    raterId: meId,
                    ratedId: reviewTargetId,
                    offerId: Number(offerId),
                    score: reviewScore,
                    comment: reviewText || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok)
                throw new Error(data?.message || data?.msg || "Could not submit review");
            setShowReview(false);
            setReviewScore(0);
            setReviewText("");
            alert("Thanks for your review!");
        } catch (e) {
            setReviewErr(e.message);
        } finally {
            setSavingReview(false);
        }
    };

    if (loading) return <div className="container py-4">Loading…</div>;
    if (err) return <div className="container py-4 text-danger">{err}</div>;
    if (!offer) return <div className="container py-4">Offer not found</div>;

    return (
        <div className="container py-4" style={{ maxWidth: 980 }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h1 className="h3 mb-0">{offer.title}</h1>
                <div className="text-muted">
                    Status:{" "}
                    <span className="badge bg-secondary">
                        {(offer.status || "").toUpperCase()}
                    </span>
                </div>
            </div>

            <div className="row g-3">
                <div className="col-12 col-lg-8">
                    <div className="card mb-3">
                        <div className="card-body">
                            <div className="mb-2">
                                <b>Venue:</b> {offer.venueName}
                            </div>
                            <div className="mb-2">
                                <b>City:</b> {offer.city}
                            </div>
                            <div className="mb-2">
                                <b>Date:</b>{" "}
                                {offer.eventDate ? new Date(offer.eventDate).toLocaleString() : "—"}
                            </div>
                            {offer.genre && (
                                <div className="mb-2">
                                    <b>Genre:</b> {offer.genre}
                                </div>
                            )}
                            {offer.capacity && (
                                <div className="mb-2">
                                    <b>Capacity:</b> {offer.capacity}
                                </div>
                            )}
                            {typeof offer.budget === "number" && (
                                <div className="mb-2">
                                    <b>Budget:</b> €{offer.budget}
                                </div>
                            )}
                            <div className="mb-0">
                                <b>Description:</b> {offer.description}
                            </div>
                        </div>
                    </div>

                    {/* Chat */}
                    <div className="card">
                        <div className="card-header">Chat</div>
                        <div className="card-body">
                            {loadingMsgs && <div className="text-muted">Loading messages…</div>}
                            {chatBlocked && (
                                <div className="alert alert-warning">
                                    The venue hasn’t approved chat for you yet.
                                </div>
                            )}
                            {!loadingMsgs && !chatBlocked && (
                                <>
                                    <div className="mb-3" style={{ maxHeight: 300, overflowY: "auto" }}>
                                        {Array.isArray(messages) && messages.length > 0 ? (
                                            <ul className="list-group">
                                                {messages.map((m) => (
                                                    <li
                                                        className="list-group-item d-flex justify-content-between"
                                                        key={m.messageId}
                                                    >
                                                        <div className="me-3">
                                                            <div>{m.body}</div>
                                                            <small className="text-muted">
                                                                {m.createdAt
                                                                    ? new Date(m.createdAt).toLocaleString()
                                                                    : ""}
                                                            </small>
                                                        </div>
                                                        <span className="badge bg-secondary align-self-start">
                                                            author #{m.authorId}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-muted">No messages yet.</div>
                                        )}
                                    </div>
                                    <form className="d-flex gap-2" onSubmit={sendMessage}>
                                        <input
                                            className="form-control"
                                            placeholder="Write a message…"
                                            value={msgBody}
                                            onChange={(e) => setMsgBody(e.target.value)}
                                        />
                                        <button className="btn btn-primary">Send</button>
                                    </form>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Review trigger */}
                    {canReview && (
                        <div className="card mt-3">
                            <div className="card-body d-flex justify-content-between align-items-center">
                                <div>
                                    <strong>Event completed</strong>
                                    <div className="text-muted small">
                                        Leave a review for {role === "distributor" ? "the performer" : "the venue"}.
                                    </div>
                                </div>
                                <button
                                    className="btn btn-success"
                                    onClick={() => setShowReview(true)}
                                >
                                    Write a review
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Review Modal */}
                    <div
                        className={`modal ${showReview ? "show d-block" : ""}`}
                        tabIndex="-1"
                        role="dialog"
                        aria-hidden={!showReview}
                    >
                        <div className="modal-dialog" role="document">
                            <div className="modal-content">
                                <form onSubmit={submitReview}>
                                    <div className="modal-header">
                                        <h5 className="modal-title">Leave a review</h5>
                                        <button
                                            type="button"
                                            className="btn-close"
                                            onClick={() => setShowReview(false)}
                                        />
                                    </div>
                                    <div className="modal-body">
                                        {reviewErr && (
                                            <div className="alert alert-danger py-2">{reviewErr}</div>
                                        )}
                                        <div className="mb-3">
                                            <label className="form-label d-block">Rating</label>
                                            <div className="star-input" role="radiogroup" aria-label="Star rating">
                                                {[1, 2, 3, 4, 5].map((n) => (
                                                    <button
                                                        key={n}
                                                        type="button"
                                                        className={"star" + (reviewScore >= n ? " active" : "")}
                                                        aria-checked={reviewScore === n}
                                                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                                                        onClick={() => setReviewScore(n)}
                                                        onMouseEnter={() => setReviewScore(n)}
                                                    >
                                                        ★
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label">Comment (optional)</label>
                                            <textarea
                                                className="form-control"
                                                rows={3}
                                                value={reviewText}
                                                onChange={(e) => setReviewText(e.target.value)}
                                                placeholder="How did it go?"
                                            />
                                        </div>
                                    </div>
                                    <div className="modal-footer">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={() => setShowReview(false)}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="btn btn-success"
                                            disabled={savingReview || reviewScore < 1}
                                        >
                                            {savingReview ? "Submitting…" : "Submit review"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                    {showReview && (
                        <div
                            className="modal-backdrop fade show"
                            onClick={() => setShowReview(false)}
                        />
                    )}

                    {err && <div className="alert alert-danger mt-3">{err}</div>}
                </div>

                <div className="col-12 col-lg-4">
                    <div className="card">
                        <div className="card-header">Actions</div>
                        <div className="card-body">
                            {isVenue ? (
                                <>
                                    <div className="d-flex gap-2 mb-2">
                                        <button
                                            className="btn btn-outline-primary"
                                            onClick={() => setPayOpen(true)}
                                        >
                                            Pay
                                        </button>
                                        <button
                                            className="btn btn-outline-success"
                                            onClick={() => concludeOffer("closed")}
                                            disabled={concluded}
                                        >
                                            Mark as concluded
                                        </button>
                                        <button
                                            className="btn btn-outline-danger"
                                            onClick={() => concludeOffer("cancelled")}
                                            disabled={concluded}
                                        >
                                            Cancel offer
                                        </button>
                                    </div>

                                    <div className="mt-3">
                                        <div className="fw-bold mb-2">Applications</div>
                                        {loadingMatches ? (
                                            <div className="text-muted">Loading…</div>
                                        ) : matches.length === 0 ? (
                                            <div className="text-muted">No applicants yet.</div>
                                        ) : (
                                            <div className="table-responsive">
                                                <table className="table table-sm align-middle">
                                                    <thead>
                                                        <tr>
                                                            <th>Performer</th>
                                                            <th>Rate</th>
                                                            <th>Status</th>
                                                            <th>Chat</th>
                                                            <th>Message</th>
                                                            <th></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {matches.map((m) => (
                                                            <tr key={m.matchId}>
                                                                <td>
                                                                    <Link to={`/profile/${m.performerId}`}>
                                                                        p{m.performerId}
                                                                    </Link>
                                                                    {offer?.acceptedPerformerId === m.performerId && (
                                                                        <span className="badge bg-success ms-2">
                                                                            Accepted
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td>€{m.rate}</td>
                                                                <td>{m.status}</td>
                                                                <td>
                                                                    {m.chatApproved ? (
                                                                        <span className="badge bg-primary">Approved</span>
                                                                    ) : (
                                                                        <span className="badge bg-secondary">Blocked</span>
                                                                    )}
                                                                </td>
                                                                <td style={{ maxWidth: 260 }}>
                                                                    {m.message || "—"}
                                                                </td>
                                                                <td className="text-end">
                                                                    <div className="btn-group">
                                                                        <button
                                                                            className="btn btn-sm btn-outline-primary"
                                                                            onClick={() =>
                                                                                approveChat(m.performerId, !m.chatApproved)
                                                                            }
                                                                        >
                                                                            {m.chatApproved ? "Block chat" : "Approve chat"}
                                                                        </button>
                                                                        <button
                                                                            className="btn btn-sm btn-outline-success"
                                                                            onClick={() => acceptPerformer(m.performerId)}
                                                                        >
                                                                            Accept
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <form onSubmit={applyToOffer} className="vstack gap-2">
                                    <div>
                                        <label className="form-label">Your rate (€)</label>
                                        <input
                                            className="form-control"
                                            type="number"
                                            value={rate}
                                            onChange={(e) => setRate(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="form-label">Message (optional)</label>
                                        <textarea
                                            className="form-control"
                                            rows={2}
                                            value={applyMsg}
                                            onChange={(e) => setApplyMsg(e.target.value)}
                                        />
                                    </div>
                                    <button className="btn btn-primary" disabled={applying || !rate}>
                                        {applying ? "Sending…" : "Apply"}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mock pay modal */}
            {payOpen && (
                <div className="modal show d-block" tabIndex="-1">
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Pay performer</h5>
                                <button className="btn-close" onClick={() => setPayOpen(false)} />
                            </div>
                            <div className="modal-body">
                                <div className="mb-2">Payment details go here (demo).</div>
                            </div>
                            <div className="modal-footer">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setPayOpen(false)}
                                >
                                    Close
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        alert("Payment submitted (demo).");
                                        setPayOpen(false);
                                    }}
                                >
                                    Pay now
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {err && <div className="alert alert-danger mt-3">{err}</div>}
        </div>
    );
};
