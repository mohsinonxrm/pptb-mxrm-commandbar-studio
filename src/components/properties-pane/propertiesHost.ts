import { createContext } from "react";

/**
 * Set by a host that can close Properties (the narrow-window drawer, #179):
 * its close button becomes the header's, so there's only one (#184).
 */
export const PropertiesHostContext = createContext<{ onClose?: () => void }>({});
