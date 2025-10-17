import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar.jsx";
import { Footer } from "../components/Footer.jsx";
import FloatingChat from "../components/FloatingChat.jsx";



export const Layout = () => {
  return (
    <>
      <Navbar />
      <main className="flex-grow-1">
        <Outlet />
      </main>
      <Footer />
      <FloatingChat />
    </>
  );
}