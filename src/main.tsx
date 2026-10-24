import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router";
import { Provider } from "./state";
import { App } from "./App";
import "./styles.css";
import "./identity.css";
import { MarketProvider } from "./components/LiveMarkets";
const preview = import.meta.env.MODE === "preview";
const Router = preview ? HashRouter : BrowserRouter;
if (preview) document.body.classList.add("preview-mode");
createRoot(document.getElementById("root")!).render(
  <Router>
    <Provider>
      <MarketProvider>
        <App />
      </MarketProvider>
    </Provider>
  </Router>,
);
