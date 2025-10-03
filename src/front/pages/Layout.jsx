import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar.jsx";
import { Footer } from "../components/Footer.jsx";

const Layout = () => (
  <div className="d-flex flex-column min-vh-100">
    <Navbar />
    <div className="flex-fill container my-4">
      <Outlet />
    </div>
    <Footer />
  </div>
);

export default Layout;   // 👈 default export
