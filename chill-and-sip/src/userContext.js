import { createContext, useContext } from "react";

// The context UserProvider fills; components read it with useUser().

export const UserContext = createContext();

export function useUser() {
  return useContext(UserContext);
}
