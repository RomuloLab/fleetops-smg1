export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "fleetops:theme:v1";
export const THEME_CHANGE_EVENT = "fleetops:theme-change";

// Runs in <head> before the page is painted. Only the two supported values are
// applied, so a saved preference never becomes arbitrary markup or styles.
export const THEME_BOOTSTRAP = `(()=>{let theme="light";try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")theme="dark";}catch{}document.documentElement.dataset.theme=theme;})();`;
