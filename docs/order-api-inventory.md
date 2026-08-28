# Public Order API scope

The public OpenAPI contract retains the legitimate OrderModel fields and supported non-organization search parameters while intentionally omitting Trustgrid-internal Order surfaces.

## Deliberate public-doc omissions

- Organization filtering (`orderOrg` / `org`) is not exposed as a public query parameter.
- Internal detail fields `tgHyperlinks` and `tgNotes` are not part of the public `OrderModel` schema.
- `/orders/orgs`, `orders.stream`, `/config/assignees`, the shipping webhook, and ShipStation endpoints are omitted because they are internal plumbing rather than customer-facing API.
- `shipStationOrderId` remains on `OrderModel` because it is a legitimate OrderModel field even though the ShipStation management endpoints are private.

The remaining Order endpoints and model fields were reconciled from the existing Order API inventory. `orgId` remains a string and `createdAt` remains an RFC3339 date-time. Server-managed fields are marked read-only because the request body reuses `OrderModel`.

The regression tests in `tests/orders.test.js` protect this public scope and the lowercase `x-total-count` pagination header. A future generation or diff step should live with the service that owns the Go model and routes, then publish a reviewed OpenAPI fragment; this repository cannot generate that fragment without the service source.
