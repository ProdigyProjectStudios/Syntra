import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

const SyntraPortalContext = createContext<ShadowRoot | null>(null);
export const SyntraPortalProvider = SyntraPortalContext.Provider;

/** Directs Radix/Drawer popovers and dialogs into the isolated original-style root. */
export function SyntraPortal({
  Primitive,
  children,
  ...props
}: {
  Primitive: ComponentType<any>;
  children?: ReactNode;
  [key: string]: unknown;
}) {
  const container = useContext(SyntraPortalContext);
  return <Primitive container={container ?? undefined} {...props}>{children}</Primitive>;
}
