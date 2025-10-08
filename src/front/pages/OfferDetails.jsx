import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";
import ChatBox from "../components/FloatingChat.jsx";

const API = import.meta.env.VITE_BACKEND_URL;

export const OfferDetails = () => {
    const { offerId } = useParams();              // from /offers/:offerId
    const navigate = useNavigate();
    const { store } = useGlobalReducer();

    const token = localStorage.getItem("token");
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    const role = (store.currentUser?.role || "").toLowerCase();
    const isVenue = role === "distributor" || role === "admin";
    const isPerformer = role === "performer" || role === "admin";
    const currentUserId = store.currentUser?.userId ?? null;

    // ---- offer + matches + messages ----
    const [offer, setOffer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [matches, setMatches] = useState([]);      // venue/admin view
    const [loadingMatches, setLoadingMatches] = useState(false);

    const [messages, setMessages] = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [msgBody, setMsgBody] = useState("");
    const [chatBlocked, setChatBlocked] = useState(false); // performer-only gate

    // ---- performer apply form ----
    const [rate, setRate] = useState("");
    const [applyMsg, setApplyMsg] = useState("");
    const [applying, setApplying] = useState(false);

    // ---- venue controls ----
    const [working, setWorking] = useState(false);

    // ---- payment modal ----
    const [payOpen, setPayOpen] = useState(false);
    const [payForm, setPayForm] = useState({ card: "", name: "", amount: "" });

    const canMessage = useMemo(() => {
        if (!token) return false;
        if (!offer) return false;
        if (isVenue) return true;
        return !chatBlocked; // performer can message only if approved
    }, [token, offer, isVenue, chatBlocked]);

    // Load offer (public endpoint)
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true); setErr("");
                const r = await fetch(`${API}/api/offers/${offerId}`);
                const d = await r.json();
                if (!r.ok) throw new Error(d?.message || d?.msg || "Error loading offer");
                if (!alive) return;
                setOffer(d);
            } catch (e) {
                if (!alive) return;
                setErr(e.message);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [offerId]);

    // Venue/admin: load matches
    useEffect(() => {
        if (!isVenue || !token) return;
        let alive = true;
        (async () => {
            try {
                setLoadingMatches(true);
                const r = await fetch(`${API}/api/offers/${offerId}/matches`, { headers: authHeaders });
                const d = await r.json();
                if (!alive) return;
                if (r.ok) setMatches(Array.isArray(d) ? d : []);
            } finally {
                if (alive) setLoadingMatches(false);
            }
        })();
        return () => { alive = false; };
    }, [offerId, isVenue, token]);

    // Load messages (performers might get 403 if chat not approved)
    const loadMessages = async () => {
        if (!token) return;
        setLoadingMsgs(true); setChatBlocked(false);
        try {
            const r = await fetch(`${API}/api/offers/${offerId}/messages`, { headers: authHeaders });
            const d = await r.json();
            if (!r.ok) {
                if (r.status === 403) setChatBlocked(true);
                else throw new Error(d?.message || d?.msg || "Error loading messages");
            } else {
                setMessages(Array.isArray(d) ? d : []);
            }
        } catch (e) {
            if (isVenue) setErr(e.message);
        } finally {
            setLoadingMsgs(false);
        }
    };
    useEffect(() => { loadMessages(); /* eslint-disable-next-line */ }, [offerId, token]);

    // ---- performer apply (RATE IS REQUIRED) ----
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
                body: JSON.stringify({ rate: Number(rate), message: applyMsg || undefined }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not apply");
            alert("Application sent!");
            setRate("");
            setApplyMsg("");

            // If venue/admin is viewing, refresh matches; if performer, nothing else to do
            if (isVenue) {
                const r2 = await fetch(`${API}/api/offers/${offerId}/matches`, { headers: authHeaders });
                const d2 = await r2.json();
                if (r2.ok) setMatches(Array.isArray(d2) ? d2 : []);
            }
        } catch (e) {
            alert(e.message);
        } finally {
            setApplying(false);
        }
    };

    // ---- messages ----
    const sendMessage = async (e) => {
        e.preventDefault();
        if (!token) return alert("You must be logged in.");
        if (!msgBody.trim()) return;

        try {
            // NOTE: backend still expects authorId in your current code; send it to be safe
            const r = await fetch(`${API}/api/offers/${offerId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ authorId: currentUserId, body: msgBody.trim() }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not send message");
            setMsgBody("");
            loadMessages();
        } catch (e) {
            if (e.message?.toLowerCase().includes("chat not approved")) {
                setChatBlocked(true);
            }
            alert(e.message);
        }
    };

    // ---- venue actions ----
    const approveChat = async (performerId, approved = true) => {
        if (!isVenue) return;
        try {
            setWorking(true);
            const r = await fetch(`${API}/api/offers/${offerId}/approve-chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ performerId, approved }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not update chat approval");

            // refresh matches + messages
            await Promise.all([
                (async () => {
                    const r2 = await fetch(`${API}/api/offers/${offerId}/matches`, { headers: authHeaders });
                    const d2 = await r2.json();
                    if (r2.ok) setMatches(Array.isArray(d2) ? d2 : []);
                })(),
                loadMessages(),
            ]);
        } catch (e) {
            alert(e.message);
        } finally {
            setWorking(false);
        }
    };

    const acceptPerformer = async (performerId) => {
        if (!isVenue) return;
        try {
            setWorking(true);
            const r = await fetch(`${API}/api/offers/${offerId}/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ performerId }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not accept performer");
            setOffer(d.offer);

            const r2 = await fetch(`${API}/api/offers/${offerId}/matches`, { headers: authHeaders });
            const d2 = await r2.json();
            if (r2.ok) setMatches(Array.isArray(d2) ? d2 : []);
        } catch (e) {
            alert(e.message);
        } finally {
            setWorking(false);
        }
    };

    const concludeOffer = async (status = "closed") => {
        if (!isVenue) return;
        try {
            setWorking(true);
            const r = await fetch(`${API}/api/offers/${offerId}/conclude`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ status }),
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.message || d?.msg || "Could not conclude offer");
            setOffer(d);
            alert(`Offer marked as ${status}.`);
        } catch (e) {
            alert(e.message);
        } finally {
            setWorking(false);
        }
    };

    const concluded = offer?.status !== "open";
    const acceptedPerformerId = offer?.acceptedPerformerId ?? null;

    if (loading) return <div className="container py-5 text-center">Loading offer…</div>;

    return (
        <div className="container py-4" style={{ maxWidth: 960 }}>
            <div className="d-flex align-items-center justify-content-between mb-3">
                <h1 className="h4 mb-0">{offer?.title}</h1>
                <Link to="/offers" className="btn btn-outline-secondary btn-sm">Back to offers</Link>
            </div>

            {/* Offer meta */}
            <div className="card mb-3">
                <div className="card-body">
                    <div className="d-flex flex-wrap gap-4 mb-2">
                        <div><b>City:</b> {offer?.city || "—"}</div>
                        <div><b>Venue:</b> {offer?.venueName || "—"}</div>
                        <div><b>Date:</b> {offer?.eventDate ? new Date(offer.eventDate).toLocaleString() : "—"}</div>
                        <div><b>Capacity:</b> {offer?.capacity ?? "—"}</div>
                        <div><b>Status:</b> <span className={`badge ${concluded ? "bg-secondary" : "bg-success"}`}>{offer?.status}</span></div>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{offer?.description || "No description"}</div>
                </div>
            </div>

            {/* Performer Apply (always with a rate) */}
            {isPerformer && !concluded && (
                <div className="card mb-3">
                    <div className="card-header">Apply to this offer</div>
                    <div className="card-body">
                        <form className="row g-3" onSubmit={applyToOffer}>
                            <div className="col-md-4">
                                <label className="form-label">Your rate *</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="form-control"
                                    value={rate}
                                    onChange={(e) => setRate(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="col-md-8">
                                <label className="form-label">Message (optional)</label>
                                <input
                                    className="form-control"
                                    placeholder="Short note to the venue"
                                    value={applyMsg}
                                    onChange={(e) => setApplyMsg(e.target.value)}
                                />
                            </div>
                            <div className="col-12">
                                <button className="btn btn-primary" disabled={applying || !token}>
                                    {applying ? "Applying…" : "Apply"}
                                </button>
                                {!token && <span className="text-muted ms-2">Login required</span>}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Venue: Applicants */}
            {isVenue && (
                <div className="card mb-3">
                    <div className="card-header d-flex justify-content-between align-items-center">
                        <span>Applicants</span>
                        <span className="text-muted small">
                            {loadingMatches ? "Loading…" : `${matches.length} total`}
                        </span>
                    </div>
                    <div className="card-body">
                        {matches.length === 0 ? (
                            <div className="text-muted">No applications yet.</div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table align-middle">
                                    <thead>
                                        <tr>
                                            <th>Performer</th>
                                            <th>Rate</th>
                                            <th>Status</th>
                                            <th>Chat</th>
                                            <th>Message</th>
                                            <th className="text-end">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matches.map(m => (
                                            <tr key={m.matchId}>
                                                <td>#{m.performerId}</td>
                                                <td>{m.rate != null ? Number(m.rate).toFixed(2) : "—"}</td>
                                                <td>
                                                    {m.status}
                                                    {acceptedPerformerId === m.performerId && (
                                                        <span className="badge bg-success ms-2">Accepted</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {m.chatApproved ? (
                                                        <span className="badge bg-primary">Approved</span>
                                                    ) : (
                                                        <span className="badge bg-secondary">Blocked</span>
                                                    )}
                                                </td>
                                                <td style={{ maxWidth: 260 }}>{m.message || "—"}</td>
                                                <td className="text-end">
                                                    <div className="btn-group">
                                                        <button
                                                            className={`btn btn-sm ${m.chatApproved ? "btn-outline-secondary" : "btn-outline-success"}`}
                                                            disabled={working}
                                                            onClick={() => approveChat(m.performerId, !m.chatApproved)}
                                                        >
                                                            {m.chatApproved ? "Revoke chat" : "Approve chat"}
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-outline-primary"
                                                            disabled={working || concluded}
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

                        <div className="d-flex gap-2 mt-3">
                            <button
                                className="btn btn-outline-primary"
                                onClick={() => setPayOpen(true)}
                                disabled={!acceptedPerformerId}
                                title={acceptedPerformerId ? "Proceed to payment" : "Accept a performer first"}
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
                    </div>
                </div>
            )}

            {/* Messages */}
            <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                    <span>Conversation</span>
                    <button className="btn btn-sm btn-outline-secondary" onClick={loadMessages} disabled={loadingMsgs}>
                        {loadingMsgs ? "Refreshing…" : "Refresh"}
                    </button>
                </div>
                <div className="card-body">
                    {chatBlocked && isPerformer && (
                        <div className="alert alert-warning">
                            The venue hasn’t approved chat for you yet. You’ll be able to message once approved.
                        </div>
                    )}

                    {messages.length === 0 ? (
                        <div className="text-muted">No messages yet.</div>
                    ) : (
                        <ul className="list-group mb-3">
                            {messages.map(m => (
                                <li className="list-group-item" key={m.messageId}>
                                    <div className="d-flex justify-content-between">
                                        <strong>Author #{m.authorId}</strong>
                                        <span className="text-muted small">
                                            {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
                                        </span>
                                    </div>
                                    <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <form className="d-flex gap-2" onSubmit={sendMessage}>
                        <input
                            className="form-control"
                            placeholder={canMessage ? "Write a message…" : "Chat disabled"}
                            value={msgBody}
                            onChange={(e) => setMsgBody(e.target.value)}
                            disabled={!canMessage}
                        />
                        <button className="btn btn-primary" disabled={!canMessage || !msgBody.trim()}>
                            Send
                        </button>
                    </form>
                </div>
            </div>

            {/* ---- Payment Modal (Bootstrap-styled, React-controlled) ---- */}
            {payOpen && (
                <div className="modal d-block" tabIndex="-1" role="dialog" style={{ background: "rgba(0,0,0,.5)" }}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">Payment</h5>
                                <button type="button" className="btn-close" onClick={() => setPayOpen(false)} />
                            </div>
                            <div className="modal-body">
                                <p className="text-muted">Demo form (non-functional).</p>
                                <div className="mb-3">
                                    <label className="form-label">Cardholder name</label>
                                    <input
                                        className="form-control"
                                        value={payForm.name}
                                        onChange={(e) => setPayForm({ ...payForm, name: e.target.value })}
                                        placeholder="John Doe"
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Card number</label>
                                    <input
                                        className="form-control"
                                        value={payForm.card}
                                        onChange={(e) => setPayForm({ ...payForm, card: e.target.value })}
                                        placeholder="4242 4242 4242 4242"
                                    />
                                </div>
                                <div className="mb-3">
                                    <label className="form-label">Amount</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className="form-control"
                                        value={payForm.amount}
                                        onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                                        placeholder="e.g. 250.00"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setPayOpen(false)}>Close</button>
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

            {/* Error */}
            {err && <div className="alert alert-danger mt-3">{err}</div>}
        </div>
    );
};
