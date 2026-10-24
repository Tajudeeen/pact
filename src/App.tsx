import { Route, Routes, Link } from "react-router";
import { Shell } from "./components/ui";
import { Landing } from "./pages/Landing";
import { Setups, Positions } from "./pages/Workspace";
import { PlanPage } from "./pages/Plan";
import { OrderPage } from "./pages/Order";
import { Rules, NewPlan, AccountPage } from "./pages/Settings";
import { Evidence } from "./pages/Evidence";
export function App() {
  return (
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
  );
}
