import { createContext, useContext } from "react";

/** A modal can fully cover the consultation without unmounting its state. */
const VisualActivity = createContext(true);
export const VisualActivityProvider = VisualActivity.Provider;
export function useVisualActivity() {
  return useContext(VisualActivity);
}
