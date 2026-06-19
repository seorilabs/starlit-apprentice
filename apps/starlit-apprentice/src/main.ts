import "./styles.css";
import { StarlitApp } from "./app";
import { createBackgroundGame } from "./scene";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("App root is missing.");
}

const game = createBackgroundGame("background-root");

new StarlitApp(root, game);
