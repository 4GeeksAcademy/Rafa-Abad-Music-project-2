import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";

const API = import.meta.env.VITE_BACKEND_URL;

export const Login = () => {
  const { dispatch } = useGlobalReducer();
  const navigate = useNavigate();

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("performer"); // performer | venue
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState("");

  const resetErrors = () => setError("");

  const handleLogin = async () => {
    const res = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.msg || "Login failed");

    localStorage.setItem("token", data.token);
    dispatch({ type: "set_user", payload: data.user });
    navigate("/profile");
  };


  const handleRegister = async () => {
    // minimal client-side validation
    if (!email || !password) throw new Error("Email and password are required");
    if (role === "performer" && (!name || !city)) {
      throw new Error("Name and city are required for performers");
    }
    if (role === "venue" && (!name || !city)) {
      throw new Error("Venue name and city are required");
    }

    const payload = {
      email,
      password,
      role,              // "performer" or "venue" -> backend aliases "venue" to "distributor"
      name,              // for venue, this is the venue name (label changes below)
      city,
      avatarUrl: avatarUrl || undefined,
      capacity: role === "venue" && capacity !== "" ? Number(capacity) : undefined,
    };

    const res = await fetch(`${API}/api/new-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.msg || "Registration failed");

    if (data.token) localStorage.setItem("token", data.token);
    if (data.user) dispatch({ type: "set_user", payload: data.user });
    navigate("/profile");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    resetErrors();
    try {
      if (mode === "login") await handleLogin();
      else await handleRegister();
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  };

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="d-flex justify-content-center mt-4 mb-3 gap-2">
        <button
          type="button"
          className={`btn ${mode === "login" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setMode("login")}
        >
          Login
        </button>
        <button
          type="button"
          className={`btn ${mode === "register" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>

      <h1 className="h4 text-center mb-3">{mode === "login" ? "Login" : "Create your account"}</h1>

      <form className="d-grid gap-2" onSubmit={onSubmit}>
        {/* Common fields */}
        <input
          className="form-control"
          placeholder="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
        />
        <input
          className="form-control"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "register" && (
          <>
            {/* Role */}
            <div className="form-floating">
              <select
                id="role"
                className="form-select"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="performer">Performer</option>
                <option value="venue">Venue</option>
              </select>
              <label htmlFor="role">Account type</label>
            </div>

            {/* Name (label changes with role) */}
            <input
              className="form-control"
              placeholder={role === "venue" ? "venue name" : "name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {/* City */}
            <input
              className="form-control"
              placeholder="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />

            {/* Capacity (only for venue) */}
            {role === "venue" && (
              <input
                className="form-control"
                placeholder="capacity (e.g. 150)"
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            )}

            {/* Optional avatar */}
            <input
              className="form-control"
              placeholder="avatar URL (optional)"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
          </>
        )}

        <button className="btn btn-primary">
          {mode === "login" ? "Login" : "Create account"}
        </button>

        {error && <div className="text-danger small mt-1">{error}</div>}
      </form>

      <div className="text-center mt-3">
        <Link to="/">Back to Home</Link>
      </div>
    </div>
  );
};
