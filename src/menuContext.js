import { createContext, useContext } from "react";

// What MenuProvider shares. The default is "still loading", so a screen rendered without the
// provider (some tests) shows its loading state instead of crashing.
export const MenuContext = createContext({
  status: "loading", // "loading" | "live" | "cached" | "unavailable"
  categories: [],
  store: null,
  cachedAt: null, // when the remembered copy was saved, while status is "cached"
});

export function useMenu() {
  return useContext(MenuContext);
}
