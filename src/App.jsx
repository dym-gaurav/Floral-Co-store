import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Navbar from "./components/common/Navbar";
import PageTransition from "./components/common/PageTransition";
import SmoothScroll from "./components/common/SmoothScroll";
import ScrollToHash from "./components/common/ScrollToHash";
import RouteAnnouncer from "./components/common/RouteAnnouncer";
import Loader from "./components/common/Loader";
import { scrollToTop } from "./utils/scroll";

import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Trending from "./pages/Trending";
import Collections from "./pages/Collections";
import Cart from "./pages/Cart";
import About from "./pages/About";
import NotFound from "./pages/NotFound";

const page = (element) => <PageTransition>{element}</PageTransition>;

export default function App() {
  const location = useLocation();

  // Switching tabs: jump straight to the top of the new page (no waiting for exit animations)
  useEffect(() => {
    if (!location.hash) scrollToTop();
  }, [location.pathname, location.hash]);

  return (
    <>
      <Loader />
      <SmoothScroll />
      <ScrollToHash />
      <RouteAnnouncer />
      <a href="#main" className="skip-link">Skip to content</a>
      <Navbar />
      <Routes location={location}>
        <Route path="/" element={page(<Home />)} />
        <Route path="/shop" element={page(<Shop />)} />
        <Route path="/trending" element={page(<Trending />)} />
        <Route path="/collections" element={page(<Collections />)} />
        <Route path="/cart" element={page(<Cart />)} />
        <Route path="/about" element={page(<About />)} />
        <Route path="*" element={page(<NotFound />)} />
      </Routes>
    </>
  );
}
