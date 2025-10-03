import React from "react";
import { createBrowserRouter } from "react-router-dom";

// 👇 all paths are relative to src/front/
import Layout from "./pages/Layout.jsx";
import { Home } from "./pages/Home.jsx";
import { Profile } from "./pages/Profile.jsx";
import { Offers } from "./pages/Offers.jsx";
import { Login } from "./pages/Login.jsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,           // default export
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "profile", element: <Profile /> },
      { path: "offers", element: <Offers /> },
    ],
  },
]);
