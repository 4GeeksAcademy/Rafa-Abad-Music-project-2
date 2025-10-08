// src/front/components/FloatingChat.jsx
import { useEffect, useMemo, useState } from "react";
import useGlobalReducer from "../hooks/useGlobalReducer";

export default function FloatingChat() {

  const API = import.meta.env.VITE_BACKEND_URL;
  const token = localStorage.getItem("token") || "";
  const { store } = useGlobalReducer();

  const role = (store.currentUser?.role || "").toLowerCase();
  const userId = store.currentUser?.userId ?? null;
  const isLoggedIn = Boolean(token && userId);

  const [open, setOpen] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [offersErr, setOffersErr] = useState("");
  const [offers, setOffers] = useState([]);
  const [activeOfferId, setActiveOfferId] = useState(null);

  const [msgs, setMsgs] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgErr, setMsgErr] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [chatBlocked, setChatBlocked] = useState(false);

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // Expose a global helper to open the panel (optionally for a specific offer)
  useEffect(() => {
    const openFn = (offerId = null) => {
      setOpen(true);
      if (offerId) setActiveOfferId(Number(offerId));
    };
    window.openChat = openFn;
    return () => {
      if (window.openChat === openFn) delete window.openChat;
    };
  }, []);

  // Load user's relevant offers when the panel opens
  useEffect(() => {
    if (!open || !isLoggedIn) return;

    let alive = true;
    (async () => {
      try {
        setLoadingOffers(true);
        setOffersErr("");
        let url;
        if (role === "distributor" || role === "admin") {
          url = `${API}/api/users/${userId}/offers/created`;
        } else {
          url = `${API}/api/users/${userId}/offers/applied`;
        }
        const r = await fetch(url, { headers: authHeaders });
        const d = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(d?.message || "Error loading offers");
        const arr = Array.isArray(d) ? d : [];
        setOffers(arr);

        // If no active offer picked yet, select the first
        if (!activeOfferId && arr.length > 0) {
          setActiveOfferId(arr[0].offerId);
        }
      } catch (e) {
        if (!open) return;
        setOffersErr(e.message);
      } finally {
        if (open) setLoadingOffers(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoggedIn, role, userId, token]);

  // Load messages when activeOfferId changes
  const loadMessages = async () => {
    if (!activeOfferId || !token) return;
    setLoadingMsgs(true);
    setMsgErr("");
    setChatBlocked(false);
    try {
      const r = await fetch(`${API}/api/offers/${activeOfferId}/messages`, {
        headers: authHeaders
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 403) {
          setChatBlocked(true);
        } else {
          throw new Error(d?.message || "Error loading messages");
        }
      } else {
        setMsgs(Array.isArray(d) ? d : []);
      }
    } catch (e) {
      setMsgErr(e.message);
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOfferId, open, token]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!msgBody.trim() || !activeOfferId || !token) return;

    try {
      const r = await fetch(`${API}/api/offers/${activeOfferId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({ body: msgBody.trim() })
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 403) setChatBlocked(true);
        throw new Error(d?.message || "Could not send message");
      }
      setMsgBody("");
      loadMessages();
    } catch (e) {
      setMsgErr(e.message);
    }
  };

  if (!isLoggedIn) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          className="btn btn-primary"
          style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1050 }}
          onClick={() => setOpen(true)}
          title="Open chat"
        >
          Chat
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="card shadow-lg"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            width: 380,
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            zIndex: 1050
          }}
        >
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>Messages</strong>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>

          {/* Offer selector */}
          <div className="p-2 border-bottom">
            {loadingOffers ? (
              <div className="text-muted small">Loading your offers…</div>
            ) : offersErr ? (
              <div className="text-danger small">{offersErr}</div>
            ) : offers.length === 0 ? (
              <div className="text-muted small">
                {role === "distributor" || role === "admin"
                  ? "You haven’t created any offers yet."
                  : "You haven’t applied to any offers yet."}
              </div>
            ) : (
              <select
                className="form-select form-select-sm"
                value={activeOfferId ?? ""}
                onChange={(e) => setActiveOfferId(Number(e.target.value))}
              >
                {offers.map((o) => (
                  <option key={o.offerId} value={o.offerId}>
                    #{o.offerId} — {o.title?.slice(0, 30) || "Untitled"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Messages */}
          <div className="p-2" style={{ overflowY: "auto" }}>
            {chatBlocked && (
              <div className="alert alert-warning py-2">
                The venue hasn’t approved chat for you yet.
              </div>
            )}
            {msgErr && <div className="alert alert-danger py-2">{msgErr}</div>}
            <div className="mb-2 d-flex justify-content-between align-items-center">
              <small className="text-muted">
                {loadingMsgs
                  ? "Loading…"
                  : activeOfferId
                    ? `Offer #${activeOfferId}`
                    : "Select an offer"}
              </small>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={loadMessages}
                disabled={!activeOfferId || loadingMsgs}
              >
                Refresh
              </button>
            </div>

            {(!msgs || msgs.length === 0) ? (
              <div className="text-muted small">No messages yet.</div>
            ) : (
              <ul className="list-group mb-2">
                {msgs.map((m) => (
                  <li key={m.messageId} className="list-group-item">
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

            {/* Input */}
            <form className="d-flex gap-2" onSubmit={sendMessage}>
              <input
                className="form-control"
                placeholder={chatBlocked ? "Chat disabled by venue" : "Write a message…"}
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                disabled={!activeOfferId || chatBlocked}
              />
              <button className="btn btn-primary" disabled={!activeOfferId || chatBlocked || !msgBody.trim()}>
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}