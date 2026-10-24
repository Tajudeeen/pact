import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Provider } from "./state";
import { App } from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Provider>
      <App />
    </Provider>
  </BrowserRouter>,
);
