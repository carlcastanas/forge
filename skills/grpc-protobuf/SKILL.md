---
name: grpc-protobuf
description: Proto3 style, wire-compatibility rules, the four streaming modes, deadlines and propagation, interceptors, the gRPC status model, and browser/REST bridges. Use when defining .proto contracts, changing an existing message, choosing a streaming mode, setting deadlines, or exposing a gRPC service to browsers or REST clients.
metadata:
  origin: FORGE
---

# gRPC and Protocol Buffers

Protobuf contracts outlive the code that reads them. A field number reused after a delete corrupts data on old binaries with no error; a service without deadlines leaks goroutines and threads under partial failure; an untyped `error` string forces clients to guess whether to retry. Done means the `.proto` files compile under a breaking-change linter, every field change is provably wire-compatible, every RPC has a deadline that propagates, errors carry a canonical status code plus typed details, and browser or REST clients reach the same service through a documented bridge.

## When to activate

- Writing or reviewing a `.proto` file, especially a change to an existing message
- Choosing between unary, server-streaming, client-streaming, and bidirectional streaming
- Requests hang or pile up; no deadline is set, or a deadline is not propagated downstream
- Adding auth, logging, tracing, or retries across all RPCs; a client cannot tell a retryable failure from a permanent one
- Exposing an internal gRPC service to a browser or to REST/JSON consumers
- User says "proto field numbers", "breaking change in proto", "DEADLINE_EXCEEDED", "grpc-gateway"

## When NOT to use

- Public HTTP/JSON API shape, URL and status-code design — `../api-design/SKILL.md`
- Client-shaped query graphs and per-field batching — `../graphql-patterns/SKILL.md`
- Versioning strategy and deprecation windows — `../api-versioning-deprecation/SKILL.md`
- Async fan-out where the caller does not wait for a reply — `../event-driven-architecture/SKILL.md`

## Prerequisites

- `protoc` or `buf` plus the language plugins for the target stacks
- Generated code committed or produced reproducibly in CI
- A breaking-change checker in CI (`buf breaking`) with a stable baseline branch, and `grpcurl` for probing

## Process

### 1. Write proto3 to the style guide

Consistency is load-bearing here: generated identifiers in every language derive mechanically from these names.

```protobuf
syntax = "proto3";
package acme.billing.v1;

option go_package = "example.internal/billing/gen/billing/v1;billingv1";

import "google/protobuf/timestamp.proto";
import "google/protobuf/field_mask.proto";

// Invoice is the billing document issued to a customer.
message Invoice {
  string id = 1;                                  // opaque, server-assigned
  string customer_id = 2;
  Money total = 3;
  InvoiceStatus status = 4;
  google.protobuf.Timestamp issued_at = 5;
  optional google.protobuf.Timestamp voided_at = 6; // explicit presence
  repeated LineItem line_items = 7;
}

// zero value is always UNSPECIFIED; values prefixed with the enum name
enum InvoiceStatus { INVOICE_STATUS_UNSPECIFIED = 0; INVOICE_STATUS_DRAFT = 1; INVOICE_STATUS_PAID = 2; }

service InvoiceService {
  rpc GetInvoice(GetInvoiceRequest) returns (Invoice);
  rpc ListInvoices(ListInvoicesRequest) returns (ListInvoicesResponse);
  rpc UpdateInvoice(UpdateInvoiceRequest) returns (Invoice);
  rpc WatchInvoices(WatchInvoicesRequest) returns (stream InvoiceEvent);
}

// partial update without ambiguity
message UpdateInvoiceRequest { Invoice invoice = 1; google.protobuf.FieldMask update_mask = 2; }
```

Fixed rules: `snake_case` fields, `PascalCase` messages and services, `UPPER_SNAKE_CASE` enum values prefixed with the enum name, a `_UNSPECIFIED = 0` zero value, a version suffix in the package, one top-level concern per file. Every RPC takes a dedicated request message and returns a dedicated response message even when it looks redundant — that is the only way to add fields later. Proto3 scalars have no presence by default: a `string` set to `""` is indistinguishable from unset, so use `optional` or a wrapper type when the difference matters, and `FieldMask` for partial updates rather than inferring intent from empty values.

### 2. Treat field numbers as permanent

The wire format carries field numbers, not names. Names are free to change; numbers never are.

Safe: adding a new field with an unused number; renaming a field or message; adding an enum value; adding an RPC; changing `optional` to a member of a new `oneof` containing only it; converting between `int32`/`int64`/`uint32`/`uint64`/`bool` (varint family) if values stay in range; `string` and `bytes` interchange for UTF-8 data.

Unsafe: changing a field's number; changing its type across wire-type families (`int32` to `string`, `int32` to `fixed32`); moving a field into or out of an existing `oneof`; changing `repeated` to singular or back; renumbering enum values; changing a field's `json_name` when JSON transcoding is in play. Deleting a field requires reserving what it used, or a future author will silently reuse it.

```protobuf
message Invoice {
  reserved 9, 12 to 14;                 // numbers of deleted fields
  reserved "legacy_tax_code", "vat_id"; // names, so JSON/text formats also reject them
}
```

```bash
buf lint && buf breaking --against '.git#branch=main'   # fails on any wire-incompatible change
```

### 3. Pick the streaming mode from the data shape

- Unary: one request, one response. Default. Retryable, cacheable, trivially load-balanced.
- Server streaming: one request, a stream of responses. Use for large result sets, tailing changes, progress. The client controls nothing after the request; back-pressure comes from HTTP/2 flow control when the client stops reading.
- Client streaming: a stream of requests, one response. Use for uploads and batched ingest.
- Bidirectional streaming: both directions independent. Use for long-lived sessions and interactive protocols. Ordering is guaranteed within each direction, not across them.

```go
func (s *server) WatchInvoices(req *billingv1.WatchInvoicesRequest,
	stream billingv1.InvoiceService_WatchInvoicesServer) error {
	ctx := stream.Context()
	events, err := s.bus.Subscribe(ctx, req.GetCustomerId())
	if err != nil {
		return status.Errorf(codes.Internal, "subscribe: %v", err)
	}
	for {
		select {
		case <-ctx.Done():
			return status.FromContextError(ctx.Err()).Err() // CANCELLED or DEADLINE_EXCEEDED
		case ev, ok := <-events:
			if !ok {
				return nil // clean end of stream
			}
			if err := stream.Send(ev); err != nil {
				return err // client went away; return as-is
			}
		}
	}
}
```

A stream is not a message bus: if the consumer must survive a disconnect without losing data, put a queue behind it (`../event-driven-architecture/SKILL.md`).

### 4. Set deadlines and propagate them

A gRPC deadline is absolute and travels on the wire as `grpc-timeout`. A server that ignores the incoming context and starts a fresh one converts a bounded request into an unbounded one.

```go
// caller: every outbound RPC gets a deadline, no exceptions
ctx, cancel := context.WithTimeout(ctx, 800*time.Millisecond)
defer cancel()
inv, err := client.GetInvoice(ctx, &billingv1.GetInvoiceRequest{Id: id})

// server: derive downstream calls from the inbound ctx so the budget shrinks, never grows
func (s *server) GetInvoice(ctx context.Context, req *billingv1.GetInvoiceRequest) (*billingv1.Invoice, error) {
	if dl, ok := ctx.Deadline(); ok {
		if time.Until(dl) < 50*time.Millisecond {
			return nil, status.Error(codes.DeadlineExceeded, "insufficient budget remaining")
		}
		var cancel context.CancelFunc // headroom to still build an error response
		ctx, cancel = context.WithDeadline(ctx, dl.Add(-30*time.Millisecond))
		defer cancel()
	}
	return s.repo.Load(ctx, req.GetId())
}
```

Budget deadlines top-down from the user-facing SLO, not bottom-up from what each hop happens to take. Detached background work must use a context derived from the process lifetime, not the request — otherwise it is cancelled the moment the caller disconnects.

### 5. Put cross-cutting concerns in interceptors

Four interceptor slots exist: unary and stream, client and server. Register all four or the concern is silently absent on streaming RPCs.

```go
func AuthUnary(verify TokenVerifier) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		md, _ := metadata.FromIncomingContext(ctx)
		vals := md.Get("authorization")
		if len(vals) == 0 {
			return nil, status.Error(codes.Unauthenticated, "missing authorization metadata")
		}
		principal, err := verify(ctx, strings.TrimPrefix(vals[0], "Bearer "))
		if err != nil {
			return nil, status.Error(codes.Unauthenticated, "invalid token") // never echo why
		}
		return handler(WithPrincipal(ctx, principal), req)
	}
}

srv := grpc.NewServer(
	grpc.ChainUnaryInterceptor(RecoverUnary(), TraceUnary(), AuthUnary(verify), LogUnary()),
	grpc.ChainStreamInterceptor(RecoverStream(), TraceStream(), AuthStream(verify), LogStream()),
)
```

Stream interceptors receive a `grpc.ServerStream`; to inspect or mutate messages, wrap it and override `RecvMsg`/`SendMsg`. On the client side, interceptors are where retry policy, deadline defaults, and metadata injection belong — but prefer the built-in service config `retryPolicy` over hand-rolled loops, and never retry a non-idempotent method (see `../idempotency-patterns/SKILL.md`).

### 6. Use the canonical status codes and typed details

Callers branch on the code, log the message, and program against the details. Pick by what the caller should do next.

| Code | Meaning | Caller action |
| --- | --- | --- |
| `INVALID_ARGUMENT` | Request malformed regardless of state | Fix and do not retry |
| `FAILED_PRECONDITION` | Valid request, wrong system state | Fix state, then retry |
| `ABORTED` | Concurrency conflict | Retry at a higher level |
| `NOT_FOUND` / `ALREADY_EXISTS` | Resource identity | Do not retry |
| `RESOURCE_EXHAUSTED` | Quota or rate limit | Back off, honour `RetryInfo` |
| `UNAVAILABLE` | Transient; service down or connection lost | Retry with backoff |
| `DEADLINE_EXCEEDED` / `UNIMPLEMENTED` | Budget spent / method absent | Fresh budget, or fix the version skew |

```go
st, _ := status.New(codes.InvalidArgument, "invoice validation failed").WithDetails(
	&errdetails.BadRequest{FieldViolations: []*errdetails.BadRequest_FieldViolation{
		{Field: "line_items[0].quantity", Description: "must be greater than zero"},
	}},
	&errdetails.RequestInfo{RequestId: reqID})
return nil, st.Err()
```

Details ride in the `grpc-status-details-bin` trailer as a serialised `google.rpc.Status`. Use the standard `google.rpc` detail messages (`BadRequest`, `PreconditionFailure`, `QuotaFailure`, `RetryInfo`, `ErrorInfo`) before inventing one — clients and tooling already understand them. Never put a stack trace or an internal identifier in the message; that is what logs and `RequestInfo` are for.

### 7. Bridge to browsers and REST

Browsers cannot speak gRPC over HTTP/2 directly: the fetch API exposes no trailers and no frame control. gRPC-Web needs a proxy (Envoy `grpc_web` filter, or an in-process wrapper) that translates framing and moves trailers into the body; bidirectional and client streaming are unsupported, server streaming works. grpc-gateway or built-in transcoding instead maps RPCs onto REST/JSON via annotations, generating an OpenAPI document from the same source of truth.

```protobuf
import "google/api/annotations.proto";

service InvoiceService {
  rpc GetInvoice(GetInvoiceRequest) returns (Invoice) {
    option (google.api.http) = { get: "/v1/invoices/{id}" };
  }
  rpc UpdateInvoice(UpdateInvoiceRequest) returns (Invoice) {
    option (google.api.http) = { patch: "/v1/invoices/{invoice.id}", body: "invoice" };
  }
}
```

```bash
grpcurl -plaintext -d '{"id":"inv_01H9"}' localhost:9090 acme.billing.v1.InvoiceService/GetInvoice
curl -s localhost:8080/v1/invoices/inv_01H9   # same call through the gateway
```

Transcoding maps gRPC codes onto HTTP status codes (`NOT_FOUND` to 404, `PERMISSION_DENIED` to 403, `RESOURCE_EXHAUSTED` to 429). Verify that mapping against the contract published to REST clients rather than assuming it — see `../api-design/SKILL.md`.

## Checklist

- [ ] Package carries a version suffix, language options set, every enum has an `_UNSPECIFIED = 0`, and every RPC has dedicated request and response messages
- [ ] Deleted field numbers and names are `reserved`; `buf lint` and `buf breaking` run in CI
- [ ] Presence handled explicitly (`optional`, wrappers, `FieldMask`) wherever empty differs from unset
- [ ] Streaming mode matches the data shape; disconnect-durable consumers sit behind a queue
- [ ] Every outbound RPC sets a deadline; servers derive child contexts from the inbound context, and background work uses a process-lifetime context
- [ ] Unary and stream interceptors registered on client and server for auth, tracing, logging, recovery
- [ ] Errors return a canonical code plus `google.rpc` details; messages leak no internals
- [ ] Retries restricted to idempotent methods, driven by service config
- [ ] gRPC-Web or transcoding path documented, code-to-HTTP-status mapping verified

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Old clients read garbage in a field | Field number reused after deletion | `reserved` the number; assign a fresh one |
| Field silently drops between versions | Type changed across wire-type families | Add a new field, migrate readers, then reserve the old |
| Server work continues after client disconnect | Handler started `context.Background()` | Derive from the handler's `ctx`; check `ctx.Err()` in loops |
| Cascading `DEADLINE_EXCEEDED` under load | Deadlines not budgeted; every hop uses the full timeout | Shrink the budget at each hop; fail fast when headroom is gone |
| Auth passes on streaming RPCs but not unary (or vice versa) | Only one interceptor slot registered | Register both unary and stream chains |
| Client retries a non-idempotent write and double-charges | Blanket retry policy | Restrict `retryPolicy` per method; add an idempotency key |
| Browser client fails with a transport error | gRPC-Web proxy missing, or an unsupported streaming mode | Add the proxy; switch to server streaming or unary |

## References

- Protocol Buffers language guide (proto3); Protocol Buffers style guide; gRPC Core concepts, architecture and lifecycle; gRPC status codes and their use in gRPC
- `google.rpc.Status`, `google/rpc/error_details.proto`, `google/api/http.proto`; Google API Improvement Proposals (AIP) for resource-oriented gRPC design
- `../api-design/SKILL.md`, `../api-versioning-deprecation/SKILL.md`, `../idempotency-patterns/SKILL.md`, `../event-driven-architecture/SKILL.md`, `../golang-patterns/SKILL.md`, `../latency-critical-systems/SKILL.md`
