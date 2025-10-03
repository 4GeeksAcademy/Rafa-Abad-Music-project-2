import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useGlobalReducer from "../hooks/useGlobalReducer";

export const Login = () => {
  const { dispatch } = useGlobalReducer();
  const [email, setEmail] = useState("");
  const [name, setName]   = useState(""); 
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = (e) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Email is required");
      return;
    }

    // fake login user
    const fakeUser = { userId: 1, email, name: name || "Anonymous" };
    dispatch({ type: "set_user", payload: fakeUser });
    navigate("/profile");
  };

  return (
    <div className="container" style={{ maxWidth: 480 }}>
      <h1 className="h3 mt-4 mb-3 text-center">Login</h1>

      <form className="d-grid gap-2" onSubmit={submit}>
        <input 
          className="form-control" 
          placeholder="email" 
          value={email} 
          onChange={e=>setEmail(e.target.value)} 
        />
        <input 
          className="form-control" 
          placeholder="name" 
          value={name} 
          onChange={e=>setName(e.target.value)} 
        />
        <button className="btn btn-primary">Login</button>
        {error && <div className="text-danger">{error}</div>}
      </form>

      <div className="text-center mt-3">
        <Link to="/">Back to Home</Link>
      </div>
    </div>
  );
};
