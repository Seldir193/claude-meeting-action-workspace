# Meeting & Action Workspace — frontend

Standalone Angular app (TypeScript, SCSS, zoneless, signals). No router, state library or UI framework.

## Run

```bash
npm install
npm start        # http://localhost:4200
npm run build    # production build into dist/
npm test         # unit tests (Vitest)
```

The app calls the NestJS API at `http://localhost:3001/api`, which matches `PORT=3001` in
`apps/backend/.env.example`. The URL is the default of the `API_BASE_URL` injection token in
`src/app/api.config.ts`. To point the app elsewhere, provide the token in `src/app/app.config.ts`:

```ts
{ provide: API_BASE_URL, useValue: 'http://localhost:4000/api' }
```

The frontend holds no secrets; the Anthropic key lives only in the backend environment.

## Tests

`src/app/app.spec.ts` drives the workspace through the DOM and answers every request with
`HttpTestingController`, so no backend or network is needed. It covers the meeting list and its
loading state, analysis rendering, a status change and a manual edit (both via `PATCH`, rendering
the item the server returns), and API error states.

## Structure

| File | Purpose |
| --- | --- |
| `src/app/models.ts` | API types, labels and the provenance rule (AI proposal / human-reviewed / human-created) |
| `src/app/api.config.ts` | API base URL token |
| `src/app/meeting-api.service.ts` | `HttpClient` calls for the seven endpoints, plus error formatting |
| `src/app/app.*` | Workspace shell: meeting list, create form, notes, AI Workspace |
| `src/app/action-item-card/` | One action item: review, status change, edit, delete |
| `src/app/action-item-form/` | Action item fields, shared by edit and add |
| `src/styles.scss` | Design tokens and shared primitives (buttons, fields, badges, alerts) |
