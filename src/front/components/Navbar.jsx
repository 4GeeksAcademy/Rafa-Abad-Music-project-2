// src/front/components/Navbar.jsx
import { Link, useNavigate } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Navbar = () => {
  const { store, dispatch } = useGlobalReducer();
  const navigate = useNavigate();

  const token = localStorage.getItem("token");

  // Fallback to cached user if store is not ready yet (page refresh)
  let cachedUser = null;
  try {
    cachedUser = JSON.parse(localStorage.getItem("user") || "null");
  } catch { /* ignore */ }

  const user = store.currentUser || cachedUser || null;
  const isLoggedIn = Boolean(token);

  const initials = (txt = "") =>
    txt.split(" ").map(w => w[0]?.toUpperCase()).join("").slice(0, 2) || "?";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");              // <- clear cached user
    dispatch({ type: "set_user", payload: null });
    navigate("/login");
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark px-3 fixed-top">
      <Link className="navbar-brand fw-bold" to="/">Rafa Abad Music</Link>

      <button
        className="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarNav"
        aria-controls="navbarNav"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span className="navbar-toggler-icon"></span>
      </button>

      <div className="collapse navbar-collapse" id="navbarNav">
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item"><Link className="nav-link" to="/">Home</Link></li>
          <li className="nav-item"><Link className="nav-link" to="/offers">Offers</Link></li>
        </ul>

        <ul className="navbar-nav ms-auto align-items-center">
          {isLoggedIn && (
            <li className="nav-item me-2">
              <Link className="btn btn-outline-light d-flex align-items-center gap-2" to="/profile">
                {/* Small avatar or initials */}
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name || "Profile"}
                    style={{ width: 24, height: 24, objectFit: "cover" }}
                    className="rounded-circle"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <span
                    className="rounded-circle d-inline-flex justify-content-center align-items-center"
                    style={{ width: 24, height: 24, background: "rgba(255,255,255,.2)" }}
                  >
                    <small className="fw-bold text-white">
                      {initials(user?.name || user?.email || "")}
                    </small>
                  </span>
                )}
                <span className="d-none d-sm-inline">
                  {user?.name || "Profile"}
                </span>
              </Link>
            </li>
          )}

          {!isLoggedIn ? (
            <li className="nav-item">
              <Link className="btn btn-outline-light" to="/login">Log in</Link>
            </li>
          ) : (
            <li className="nav-item">
              <button className="btn btn-outline-light" onClick={handleLogout}>
                Log out
              </button>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
};
