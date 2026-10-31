---
name: OpenAPI date-time format
description: Timestamp fields in lib/api-spec/openapi.yaml must declare format: date-time or the generated Zod response schemas fail on Drizzle Date objects at runtime.
---

When adding timestamp fields (createdAt, updatedAt, etc.) to schemas in `lib/api-spec/openapi.yaml`, always write them as:

```yaml
createdAt:
  type: string
  format: date-time
```

**Why:** With plain `type: string`, Orval generates `zod.string()` for the response schema. Route handlers that `.parse()` Drizzle rows then throw a ZodError (500) because Drizzle returns `Date` objects, not strings. With `format: date-time`, the generated schema accepts/coerces Dates correctly.

**How to apply:** Any time a new entity with DB-backed timestamps is added to the spec. The failure appears only at runtime (first API call returning the entity), not at typecheck, so it is easy to miss.
