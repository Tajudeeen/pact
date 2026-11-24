import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router";
import { App } from "./App";
import "./styles.css";
import "./identity.css";
import "./workspace.css";
const preview = import.meta.env.MODE === "preview";
const Router = preview ? HashRouter : BrowserRouter;
if (preview) document.body.classList.add("preview-mode");
createRoot(document.getElementById("root")!).render(
  <Router>
    <App />
  </Router>,
);
