import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home.jsx";
import { Login } from "./pages/Login.jsx";
import { Profile } from "./pages/Profile.jsx";
import { Offers } from "./pages/Offers.jsx";
import { OfferDetails } from "./pages/OfferDetails.jsx";
import { Layout } from "./pages/Layout.jsx"; // if you use it

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/offers" element={<Offers />} />
          <Route path="/offers/:offerId" element={<OfferDetails />} />
          <Route path="*" element={<div>Not found</div>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/:id" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
