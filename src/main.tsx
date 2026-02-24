import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const storedLanguage = localStorage.getItem("duma_ui_language");
const initialLanguage = storedLanguage === "en" ? "en" : "ar";
document.documentElement.lang = initialLanguage;
document.documentElement.dir = initialLanguage === "ar" ? "rtl" : "ltr";

createRoot(document.getElementById("root")!).render(<App />);
