// src/front/components/FloatingChat.jsx
import { useEffect, useState } from "react";
import useGlobalReducer from "../hooks/useGlobalReducer";

export default function FloatingChat() {
  const API = import.meta.env.VITE_BACKEND_URL;
  const { store } = useGlobalReducer();

  const getToken = () => localStorage.getItem("token") || "";
  const getAuthHeaders = () => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const role = (store.currentUser?.role || "").toLowerCase();
  const userId = store.currentUser?.userId ?? null;
  const isLoggedIn = Boolean(getToken() && userId);

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
  const [nameCache, setNameCache] = useState({});

  const youLabel = "You";

  /* ----------------- Helpers ----------------- */
  const ensureNameLoaded = async (uid) => {
    if (!uid || nameCache[uid]) return;
    try {
      const r = await fetch(`${API}/api/users/${uid}`);
      const d = await r.json();
      if (r.ok) {
        setNameCache((p) => ({ ...p, [uid]: d?.name || `User #${uid}` }));
      } else setNameCache((p) => ({ ...p, [uid]: `User #${uid}` }));
    } catch {
      setNameCache((p) => ({ ...p, [uid]: `User #${uid}` }));
    }
  };

  const labelFor = (uid) =>
    !uid ? "" : uid === userId ? youLabel : nameCache[uid] || `User #${uid}`;

  const otherIdForOffer = (o) => {
    if (!o) return null;
    if (o.distributorId && o.distributorId !== userId) return o.distributorId;
    if (o.acceptedPerformerId && o.acceptedPerformerId !== userId)
      return o.acceptedPerformerId;
    if (o.performerId && o.performerId !== userId) return o.performerId;
    return null;
  };

  /* ----------------- Effects ----------------- */
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

  // Load offers
  useEffect(() => {
    if (!open || !isLoggedIn) return;
    let alive = true;

    (async () => {
      try {
        setLoadingOffers(true);
        setOffersErr("");

        const url =
          role === "distributor" || role === "admin"
            ? `${API}/api/users/${userId}/offers/created`
            : `${API}/api/users/${userId}/offers/applied`;

        const r = await fetch(url, { headers: getAuthHeaders() });
        const d = await r.json();
        if (!alive) return;
        if (!r.ok) throw new Error(d?.message || "Error loading conversations");

        const arr = Array.isArray(d) ? d : [];
        setOffers(arr);

        // Prefetch counterpart names
        arr.forEach((o) => {
          const oid = otherIdForOffer(o);
          if (oid) ensureNameLoaded(oid);
        });

        if (!activeOfferId && arr.length > 0) setActiveOfferId(arr[0].offerId);
      } catch (e) {
        if (alive) setOffersErr(e.message);
      } finally {
        if (alive) setLoadingOffers(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoggedIn, role, userId]);

  // Load messages
  const loadMessages = async () => {
    if (!activeOfferId || !getToken()) return;
    setLoadingMsgs(true);
    setMsgErr("");
    setChatBlocked(false);
    try {
      const r = await fetch(`${API}/api/offers/${activeOfferId}/messages`, {
        headers: getAuthHeaders(),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 403) {
          setChatBlocked(true);
          setMsgs([]);
        } else throw new Error(d?.message || "Error loading messages");
      } else {
        const arr = Array.isArray(d) ? d : [];
        setMsgs(arr);
        [...new Set(arr.map((m) => m.authorId))].forEach((id) => {
          if (id !== userId) ensureNameLoaded(id);
        });
      }
    } catch (e) {
      setMsgErr(e.message);
    } finally {
      setLoadingMsgs(false);
    }
  };

  useEffect(() => {
    if (open) loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOfferId, open]);

  /* ----------------- Derived ----------------- */
  const activeOffer = offers.find((o) => o.offerId === activeOfferId) || null;
  const convTitle = activeOffer
    ? `#${activeOffer.offerId} — ${activeOffer.title?.slice(0, 40) || "Untitled"
    }`
    : "Messages";

  const otherId =
    msgs.find((m) => m.authorId !== userId)?.authorId ||
    (role === "distributor"
      ? activeOffer?.acceptedPerformerId
      : activeOffer?.distributorId) ||
    otherIdForOffer(activeOffer);

  const otherName = otherId ? labelFor(otherId) : "";

  // prefetch header counterpart (safe outside conditionals)
  useEffect(() => {
    if (open && otherId) ensureNameLoaded(otherId);
  }, [open, otherId]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!msgBody.trim() || !activeOfferId || !getToken()) return;
    try {
      const r = await fetch(`${API}/api/offers/${activeOfferId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ body: msgBody.trim() }),
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

  /* ----------------- Render ----------------- */
  if (!isLoggedIn) return null;

  return (
    <>
      {!open && (
        <button
          className="btn btn-primary btn-fab"
          onClick={() => setOpen(true)}
          title="Open chat"
        >
          Chat
        </button>
      )}

      {open && (
        <div className="floating-chat">
          <div className="header">
            <div className="d-flex flex-column">
              <strong className="mb-0">{convTitle}</strong>
              <small className="text-muted">
                {otherName ? `Chat with ${otherName}` : "Select a conversation"}
              </small>
            </div>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="chat-pane">
            {/* Sidebar */}
            <aside className="chat-sidebar">
              <div className="px-2 py-1 border-bottom">
                <strong>Conversations</strong>
              </div>
              <div className="chat-conv-list">
                {loadingOffers ? (
                  <div className="text-muted small p-2">
                    Loading your conversations…
                  </div>
                ) : offersErr ? (
                  <div className="text-danger small p-2">{offersErr}</div>
                ) : offers.length === 0 ? (
                  <div className="text-muted small p-2">
                    {role === "distributor" || role === "admin"
                      ? "You haven’t created any offers yet."
                      : "You haven’t applied to any offers yet."}
                  </div>
                ) : (
                  offers.map((o) => {
                    const isActive = o.offerId === activeOfferId;
                    const otherId = otherIdForOffer(o);
                    const otherLabel =
                      otherId && nameCache[otherId]
                        ? nameCache[otherId]
                        : otherId
                          ? `User #${otherId}`
                          : "—";
                    return (
                      <button
                        key={o.offerId}
                        className={`chat-conv-item ${isActive ? "active" : ""
                          }`}
                        onClick={() => setActiveOfferId(o.offerId)}
                      >
                        <div className="title">
                          #{o.offerId} — {o.title?.slice(0, 34) || "Untitled"}
                        </div>
                        <div className="meta small text-muted">
                          {otherLabel}
                          {o.city ? ` · ${o.city}` : ""}
                          {o.venueName ? ` · ${o.venueName}` : ""}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Thread */}
            <section className="chat-thread">
              <div className="chat-thread-top">
                <small className="text-muted">
                  {loadingMsgs
                    ? "Loading…"
                    : activeOfferId
                      ? `Offer #${activeOfferId}`
                      : "Select a conversation"}
                </small>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={loadMessages}
                  disabled={!activeOfferId || loadingMsgs}
                >
                  Refresh
                </button>
              </div>

              <div className="px-3">
                {chatBlocked && (
                  <div className="alert alert-warning py-2 mb-2">
                    The venue hasn’t approved chat for you yet.
                  </div>
                )}
                {msgErr && (
                  <div className="alert alert-danger py-2 mb-2">{msgErr}</div>
                )}
              </div>

              <div className="chat-msgs">
                {(!msgs || msgs.length === 0) && !loadingMsgs ? (
                  <div className="text-muted small px-3">No messages yet.</div>
                ) : (
                  msgs.map((m) => {
                    const mine = m.authorId === userId;
                    return (
                      <div
                        key={m.messageId}
                        className={`chat-row ${mine ? "mine" : "theirs"}`}
                      >
                        {!mine && (
                          <div className="sender small">
                            {labelFor(m.authorId)}
                          </div>
                        )}
                        <div className="chat-bubble">
                          <div className="text">{m.body}</div>
                          <div className="time">
                            {m.createdAt
                              ? new Date(m.createdAt).toLocaleString()
                              : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form className="chat-compose" onSubmit={sendMessage}>
                <input
                  className="form-control"
                  placeholder={
                    chatBlocked ? "Chat disabled by venue" : "Write a message…"
                  }
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  disabled={!activeOfferId || chatBlocked}
                />
                <button
                  className="btn btn-primary"
                  disabled={!activeOfferId || chatBlocked || !msgBody.trim()}
                >
                  Send
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
