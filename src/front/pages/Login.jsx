import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";

const API = import.meta.env.VITE_BACKEND_URL; // e.g. http://localhost:3001

function Login() {
  const { dispatch } = useGlobalReducer();
  const navigate = useNavigate();

  // "login" | "register"
  const [mode, setMode] = useState("login");

  // form state
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "performer", // performer | distributor | admin (for register)
    name: "",
    city: "",
    avatarUrl: "",
    capacity: "", // venues only; keep as string
  });

  const [status, setStatus] = useState(null); // { type: "error"|"success", msg: string }
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const switchMode = () => {
    setStatus(null);
    setMode((m) => (m === "login" ? "register" : "login"));
  };

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`${API}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Login failed");

      // persist token + user immediately to prevent navbar flicker on refresh
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      dispatch({ type: "set_user", payload: data.user });

      navigate("/profile");
    } catch (err) {
      setStatus({ type: "error", msg: err.message || "Login error" });
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      // prepare payload; cast capacity to int if present
      const payload = {
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        name: form.name.trim(),
        city: form.city.trim(),
        avatarUrl: form.avatarUrl.trim(),
      };

      if (form.role === "distributor" || form.role === "venue") {
        const cap = parseInt(form.capacity, 10);
        if (!Number.isNaN(cap)) payload.capacity = cap;
      }

      const res = await fetch(`${API}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Registration failed");

      // persist on success
      if (data.token) localStorage.setItem("token", data.token);
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        dispatch({ type: "set_user", payload: data.user });
      }

      navigate("/profile");
    } catch (err) {
      setStatus({ type: "error", msg: err.message || "Registration error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 560 }}>
      <div className="card">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4 className="mb-0">{mode === "login" ? "Log in" : "Create an account"}</h4>
            <button className="btn btn-outline-secondary btn-sm" onClick={switchMode} type="button">
              {mode === "login" ? "Need an account?" : "Have an account?"}
            </button>
          </div>

          {status?.type === "error" && (
            <div className="alert alert-danger py-2">{status.msg}</div>
          )}

          <form onSubmit={mode === "login" ? handleLogin : handleRegister} className="vstack gap-3">
            <div>
              <label className="form-label">Email</label>
              <input
                name="email"
                type="email"
                className="form-control"
                value={form.email}
                onChange={onChange}
                required
              />
            </div>

            <div>
              <label className="form-label">Password</label>
              <input
                name="password"
                type="password"
                className="form-control"
                value={form.password}
                onChange={onChange}
                required
              />
            </div>

            {mode === "register" && (
              <>
                <div>
                  <label className="form-label">Role</label>
                  <select name="role" className="form-select" value={form.role} onChange={onChange}>
                    <option value="performer">Performer</option>
                    <option value="distributor">Venue / Distributor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Name</label>
                  <input
                    name="name"
                    className="form-control"
                    value={form.name}
                    onChange={onChange}
                    placeholder="Stage or venue name"
                    required
                  />
                </div>

                <div>
                  <label className="form-label">City</label>
                  <input
                    name="city"
                    className="form-control"
                    value={form.city}
                    onChange={onChange}
                    placeholder="e.g. Valencia"
                  />
                </div>

                <div>
                  <label className="form-label">Avatar URL (optional)</label>
                  <input
                    name="avatarUrl"
                    className="form-control"
                    value={form.avatarUrl}
                    onChange={onChange}
                    placeholder="https://…"
                  />
                </div>

                {(form.role === "distributor" || form.role === "venue") && (
                  <div>
                    <label className="form-label">Capacity (optional)</label>
                    <input
                      name="capacity"
                      className="form-control"
                      value={form.capacity}
                      onChange={onChange}
                      placeholder="e.g. 300"
                    />
                  </div>
                )}
              </>
            )}

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
export { Login }; // also export as a named export to match routes importing { Login }
