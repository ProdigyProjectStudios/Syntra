// Keep one anonymous session contract across consultation and intelligence tools.
// The newer Replit privacy middleware also enforces same-origin requests.
export { privateSession as visitorSession } from "./privacy";
