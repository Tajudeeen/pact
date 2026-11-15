import { Route, Routes, Navigate, useLocation } from "react-router";
import { useLayoutEffect } from "react";
import { Landing } from "./pages/Landing";
export function App() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* Legacy perps screens are intentionally not exposed in the Access pivot. */}
        <Route path="/app/*" element={<Navigate to="/" replace />} />
        <Route path="/evidence" element={<Navigate to="/#security" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
