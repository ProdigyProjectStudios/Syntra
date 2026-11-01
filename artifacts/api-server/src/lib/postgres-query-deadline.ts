/** Apply node-postgres's per-query deadline without changing the shared pooled
 * client's configuration. This includes Drizzle BEGIN, SAVEPOINT, COMMIT and
 * ROLLBACK; it does not time out an in-flight model between database operations. */
export function withPostgresQueryDeadline<Client extends object>(client: Client, milliseconds = 5000): Client {
  return new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "query" && typeof value === "function") {
        return (...args: unknown[]) => {
          const input = args[0];
          args[0] = typeof input === "string"
            ? { text: input, query_timeout: milliseconds }
            : { ...(input as Record<string, unknown>), query_timeout: milliseconds };
          return Reflect.apply(value, target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
