import { Link } from "react-router-dom";

export const Navbar = () => (
  <nav className="navbar navbar-light bg-light">
    <div className="container">
      <Link to="/"><span className="navbar-brand mb-0 h1">Music Match</span></Link>
      <div className="ml-auto d-flex gap-2">
        <Link to="/login"><button className="btn btn-outline-secondary">Login</button></Link>
        <Link to="/profile"><button className="btn btn-outline-secondary">Profile</button></Link>
        <Link to="/offers"><button className="btn btn-outline-secondary">Offers</button></Link>
      </div>
    </div>
  </nav>
);
