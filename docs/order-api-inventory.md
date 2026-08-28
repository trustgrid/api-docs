# Order API inventory

This note records the sources used to reconcile the Order section for issue #47. The implementation source is the `cloud` repository (janine), principally `internal/api/order.go`, `internal/data/order.go`, `internal/controllers/order.go`, and `cmd/server/main.go`. Those files were not available in this checkout, so facts that could not be confirmed from the live API are marked **UNVERIFIED** rather than inferred.

## Verified API facts

- `GET /provisioning/api/v1/orders` returns an array and sets lowercase `x-total-count` to the total matching the query, not the current page. Verified by live API probe.
- `orgId` is a string and `createdAt` is an RFC3339 date-time string. Verified by live API probe.
- `GET /provisioning/api/v1/orders/status-counts` returns an object mapping status strings to integer counts; `production ready` is a live status. Verified by live API probe.
- `GET /provisioning/api/v1/orders/creators` and `/labels` return arrays of strings. `/orders/{uid}/history` returns an array. Verified by live API probe.
- All customer-facing sibling routes use the `/provisioning/api/v1/` prefix. Verified by live API probe and route inventory.

## Query parameters

The 16 names are bound by `api.OrderSearch` in `internal/api/order.go` (the issue identifies the binding at approximately line 40): `assignee`, `label`, `creator`, `q`, `projectID`, `page`, `perPage`, `priority`, `sort`, `status`, `createdAfter`, `excludeStatus`, `createdBefore`, `transition-status`, `transition-from`, and `transition-to`. The OpenAPI types and RFC3339 date formats are documented, but default values and repeatability were not confirmed from janine in this checkout and are intentionally not asserted.

## Schema decisions

The 34 public fields from the issue are present in `OrderModel`. `orgId` and `createdAt` use the observed wire types. Server-managed identifiers, timestamps, validation results, transitions, attachments, and shipping results are marked `readOnly` because the existing request body reuses the response schema. This avoids advertising server-managed fields as writable without introducing a second schema that can drift. The three stale fields `domain`, `nodeName`, and `routedNetworks` were removed because they were not present in the source-of-truth field list and no write acceptance evidence was available.

Shapes that were not available from the source checkout are represented conservatively as arrays or objects and are candidates for a future janine-generated schema fragment. `custom` is explicitly free-form.

## Sibling routes

The customer-facing sibling routes represented in the spec are:

- `GET /orders/status-counts`, `/creators`, and `/labels`: enumeration/read routes.
- `GET /orders/{uid}/history`: order history.
- `POST /orders/{uid}/clone`: clone an order.
- `POST /orders/{uid}/attachment`: multipart attachment upload.
- `GET /orders/{uid}/attachment/{attachmentID}`: retrieve an order attachment.
