import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

const PortalContext = createContext<HTMLElement | ShadowRoot | undefined>(undefined);
export const SyntraPortalProvider = PortalContext.Provider;
/** Defaults to the library's existing body portal in Replit; keeps overlays in the host ShadowRoot. */
export function SyntraPortal({ Primitive, ...props }: {
  Primitive: ComponentType<any>; children?: ReactNode; [key: string]: unknown;
}) {
  const root = useContext(PortalContext);
  return <Primitive {...props} {...(root ? { container: root } : {})} />;
}
