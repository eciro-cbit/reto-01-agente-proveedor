// Punto de entrada del front: monta App en #app (Svelte 5 usa `mount`, no `new App(...)`).
import { mount } from "svelte";
import App from "./App.svelte";
import "./app.css";

const destino = document.getElementById("app");
if (destino === null) throw new Error("Falta el elemento #app en index.html");

export default mount(App, { target: destino });
