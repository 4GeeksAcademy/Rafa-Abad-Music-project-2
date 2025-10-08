import { Link, useNavigate } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Navbar = () => {
  const { store, dispatch } = useGlobalReducer();
  const navigate = useNavigate();

  // Consider a user "logged in" if we have either a user in store or a token in storage
  const token = localStorage.getItem("token");
  const isLoggedIn = Boolean(store.currentUser || token);

  const user = store.currentUser || null;
  const initials = (txt = "") =>
    txt.split(" ").map(w => w[0]?.toUpperCase()).join("").slice(0, 2) || "?";

  const handleLogout = () => {
    localStorage.removeItem("token");
    dispatch({ type: "set_user", payload: null });
    navigate("/login");
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark px-3 fixed-top">
      {/* Brand */}
      <Link className="navbar-brand fw-bold" to="/">
        Rafa Abad Music
      </Link>

      {/* Toggler */}
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

      {/* Content */}
      <div className="collapse navbar-collapse" id="navbarNav">
        {/* Left links */}
        <ul className="navbar-nav me-auto mb-2 mb-lg-0">
          <li className="nav-item">
            <Link className="nav-link" to="/">Home</Link>
          </li>
          <li className="nav-item">
            <Link className="nav-link" to="/offers">Offers</Link>
          </li>
        </ul>

        {/* Right side */}
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
                    <small className="fw-bold text-white">{initials(user?.name || "")}</small>
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
              <Link className="btn btn-outline-light" to="/login">
                Log in
              </Link>
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
