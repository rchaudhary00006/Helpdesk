# Development guide

How we build features here: conventions, recipes and gotchas.

## Golden rules

1. **Validate with the shared zod schema** at the route (`schema.parse(req.body)`). Add new schemas to `packages/shared/src/schemas.ts` so the UI form uses the same one.
2. **Permissions live in `tickets/rules.ts`** (pure functions with unit tests), not scattered in routes or components.
3. **Write data and its audit row in one `prisma.$transaction`.** Emit domain events **after** the transaction commits.
4. **Side effects go in subscribers** (`apps/api/src/events/subscribers.ts`) or worker jobs, never inline in a request.
5. **Customers must never receive internal notes.** Filter at the query (`getTicket`). Socket payloads are IDs only.
6. **Jobs must be idempotent.** BullMQ retries, so re-check state in the DB before acting.
7. **Throw typed errors** (`badRequest`, `forbidden`, `notFound`, `conflict` from `lib/errors.ts`). Express 5 forwards async errors to the error handler, so no try/catch boilerplate is needed.

## Recipes

### Add a field to tickets (end to end)

Example: a free-text `category`.

1. **Schema.** In `packages/db/prisma/schema.prisma`, add `category String?` to `model Ticket`, then create the migration:
   ```bash
   cd packages/db && npx dotenv -e ../../.env -- prisma migrate dev --name add_ticket_category
   ```
   Commit the generated folder under `prisma/migrations/`.
2. **Contracts.** In `packages/shared/src/schemas.ts`, add `category: z.string().max(50)` to `updateTicketSchema` (and to `createTicketSchema` if it's set on create). In `types.ts`, add `category: string | null` to `TicketListItem`.
3. **API.**
   - *Update:* nothing to do. `updateTicket` diffs whatever the schema allows, persists it and writes the audit entry automatically.
   - *Create:* pass `category: input.category` in `createTicket` (its data object is explicit on purpose).
   - *Permissions:* customers can already only change `status`. If agents-only isn't the rule you want, edit `assertCanUpdate` **and add a test** in `rules.test.ts`.
4. **UI.** Add a control in `components/ticket/properties.tsx` that calls `set({ category })`. Add `category: 'category'` to `FIELD_LABELS` in `components/ticket/activity.tsx` so it shows in the activity feed.
5. **Verify:** `npm run typecheck && npm test`, then click through it.

### Add an API endpoint

```ts
// apps/api/src/modules/<feature>/routes.ts
router.get('/:id/something', requireAuth, async (req, res) => {
  const input = somethingSchema.parse(req.query);               // shared zod schema
  res.json(await service.doSomething(currentUser(req), String(req.params.id), input));
});
```

Mount new routers in `apps/api/src/app.ts`. Add a typed call in `apps/web/src/lib/api.ts` and a hook in `hooks/queries.ts` using the `qk` key helpers.

### React to something that happened

Subscribe in `events/subscribers.ts`. Don't add more code to the service:

```ts
bus.on('ticket.updated', async ({ ticket, changes, actor }) => {
  if (changes.priority?.to === 'URGENT') await postToSlack(ticket);
});
```

Handlers run asynchronously and errors are logged, never thrown back into the request. To add a new event type, extend `DomainEvents` in `events/bus.ts`.

### Add a background job

1. Add the queue name or payload type to `packages/shared/src/contracts.ts`.
2. Produce it: `queue.add(name, data, { jobId })`. Use a deterministic `jobId` if duplicates matter. **Job IDs can't contain `:`.**
3. Consume it: add a processor in `apps/worker/src/processors/`, then register it in `apps/worker/src/index.ts`. For recurring work, use `automationsQueue.upsertJobScheduler(...)`.
4. Emit realtime from the worker via `socketEmitter.to(rooms.staff).emit(...)`.

### Add an environment variable

Add it to the zod schema in `apps/api/src/config/env.ts` and/or `apps/worker/src/env.ts`, to `.env.example` (with a comment), and to [configuration.md](./configuration.md). Browser-visible values must be prefixed `NEXT_PUBLIC_`, and they're baked in at build time.

### Change a Prisma enum

Enums are mirrored in `packages/shared/src/enums.ts`, so the browser bundle never imports Prisma. **Update both.** `npm run typecheck` catches most mismatches.

## Frontend conventions

- Pages are client components that fetch with TanStack Query. All hooks and query keys live in `hooks/queries.ts`. Invalidate with `qk.*` helpers so socket-driven refreshes keep working.
- Styling: Tailwind utility classes plus the `.field` and `.card` component classes in `globals.css`. Small primitives live in `components/ui/`.
- Render user content as text (`whitespace-pre-wrap`), never `dangerouslySetInnerHTML`.
- Pages that read `useSearchParams` need a `<Suspense>` boundary, or `next build` fails.

## Testing

| Layer | Where | How |
| --- | --- | --- |
| Business rules | `apps/api/src/modules/tickets/rules.test.ts` | Vitest, pure functions |
| SLA math, email parsing | `packages/shared/src/*.test.ts` | Vitest |
| Everything | `npm test` | Runs all of the above |

There's no integration test harness yet (it's on the roadmap). Until then, before merging a change to ticket flows, run this manual check: as a customer, create a ticket. As an agent, assign it, add an internal note, then reply with *Submit as Pending*. Confirm the customer view updates live without the note and that Mailpit received the email.

New rules or parsing logic **must** come with unit tests. Keep them pure so they need no database.

## Gotchas we've hit

| Gotcha | Detail |
| --- | --- |
| `npm run db:migrate -- --name x` ignores the name | npm swallows `--name` across workspace hops. Run Prisma from `packages/db` (see above), or answer the prompt. |
| `NODE_ENV` in `.env` breaks `next build` | It mixes React dev and prod bundles. Never put it in `.env`. |
| Express 5 `req.params` typed as `string \| string[]` | Happens when middleware precedes the handler. Use `String(req.params.id)`. |
| Express 5 `req.query` is read-only | Parse it into a local (`schema.parse(req.query)`). Don't reassign it. |
| Node 18 has no `--env-file` | We load `.env` with `dotenv-cli` in npm scripts. |
| Workspace packages ship TS source | Next uses `transpilePackages`, and API/worker builds bundle them with `tsup` (`noExternal`). |
| Mutation `onSuccess` returns a promise | `mutateAsync` waits for the refetch. Clear form state *before* awaiting (see `reply-box.tsx`), or fast typists lose keystrokes. |

## Pull request checklist

- [ ] `npm run typecheck`, `npm test` and `npm run build` pass
- [ ] Migration committed (if the schema changed) and is safe on existing data
- [ ] New permission or parsing logic has unit tests
- [ ] Internal notes still never reach customers (if you touched comments, tickets or sockets)
- [ ] `.env.example` and docs updated for new config or behaviour
