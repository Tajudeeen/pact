import { Route, Routes, Link, useLocation } from "react-router";
import { useLayoutEffect } from "react";
import { Shell } from "./components/ui";
import { Landing } from "./pages/Landing";
import { Setups, Positions } from "./pages/Workspace";
import { PlanPage } from "./pages/Plan";
import { OrderPage } from "./pages/Order";
import { Rules, NewPlan, AccountPage } from "./pages/Settings";
import { Evidence } from "./pages/Evidence";
import { browserPreview } from "./api";
import { BrandAtmosphere } from "./components/BrandAtmosphere";
export function App() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    document.scrollingElement?.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  }, [pathname]);
  return (
    <>
      <BrandAtmosphere />
      {browserPreview && (
        <div className="preview-banner" role="note">
          Live testnet quotes · Trades simulated in this browser
          <button
            type="button"
            onClick={() =>
              void import("./preview/runtime").then((m) => m.resetPreview())
            }
          >
            Reset preview
          </button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/evidence" element={<Evidence />} />
        <Route
          path="/app"
          element={
            <Shell>
              <Setups />
            </Shell>
          }
        />
        <Route
          path="/app/positions"
          element={
            <Shell>
              <Positions />
            </Shell>
          }
        />
        <Route
          path="/app/rules"
          element={
            <Shell>
              <Rules />
            </Shell>
          }
        />
        <Route
          path="/app/new"
          element={
            <Shell>
              <NewPlan />
            </Shell>
          }
        />
        <Route
          path="/app/account"
          element={
            <Shell>
              <AccountPage />
            </Shell>
          }
        />
        <Route
          path="/p/:id"
          element={
            <Shell>
              <PlanPage />
            </Shell>
          }
        />
        <Route
          path="/orders/:id"
          element={
            <Shell>
              <OrderPage />
            </Shell>
          }
        />
        <Route
          path="*"
          element={
            <Shell>
              <h1>This page isn’t here.</h1>
              <Link to="/app">Back to setups</Link>
            </Shell>
          }
        />
      </Routes>
    </>
  );
}
