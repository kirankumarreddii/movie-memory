# Movie Memory

Small app where you sign in with Google, save your favorite movie, and get a fun fact about it from OpenAI.

I went with **Variant A** (backend: caching and correctness).

Stack: Next.js 15 (App Router), React, Tailwind, Postgres, Prisma, NextAuth with Google, OpenAI, Vitest for tests.

## Setup

You need Node 20+ and Docker.

```bash
npm install
cp .env.example .env        # fill in the values (see below)
npm run db:up               # starts Postgres in Docker on port 5433
npx prisma migrate deploy   # creates the tables
npm run dev                 # http://localhost:3000
```

I mapped Postgres to port 5433 instead of 5432 because I already had another Postgres running locally. If you change it, update `DATABASE_URL` too.

### Environment variables

- `DATABASE_URL`: Postgres connection string. The one in `.env.example` works with the docker-compose file.
- `NEXTAUTH_URL`: `http://localhost:3000` for local.
- `NEXTAUTH_SECRET`: any random string. I used `openssl rand -base64 32`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: from Google Cloud Console. The redirect URI should be `http://localhost:3000/api/auth/callback/google`.
- `OPENAI_API_KEY`: your OpenAI key. It's only used on the server.
- `OPENAI_MODEL`: optional, defaults to `gpt-4o-mini`.

### Migrations

The migrations are in `prisma/migrations`. `npx prisma migrate deploy` applies them. If you change the schema, run `npm run db:migrate -- --name something` to create a new one.

### Tests

```bash
npm test          # unit + route tests, no database needed
npm run test:db   # tests the locking SQL against the real Postgres (needs db:up first)
```

## How it's put together

```
src/
  app/
    page.tsx                  landing page with the Google button
    onboarding/               favorite movie form + server action
    dashboard/page.tsx        profile, movie, fact
    api/auth/[...nextauth]/   NextAuth
    api/fact/route.ts         GET /api/fact
  components/                 buttons, avatar, fact card
  lib/
    auth.ts                   NextAuth config + helpers to get the current user
    movie.ts                  movie title validation
    facts/
      service.ts              the cache / lock / fallback logic
      prisma-repository.ts    database queries, including the lock
      openai-generator.ts     the OpenAI call
      in-memory-repository.ts fake version used in tests
prisma/schema.prisma
```

### Auth

NextAuth with the Prisma adapter, using database sessions instead of JWTs. When you log out, the session row gets deleted, so the old cookie stops working.

After login everyone is sent to `/dashboard`, and each page does its own redirects on the server:
- `/dashboard` with no session goes to `/`. With no movie saved yet, it goes to `/onboarding`.
- `/onboarding` with no session goes to `/`. If a movie is already saved, it goes to `/dashboard`.
- `/` with a session goes to whichever of those makes sense.

I treat "first-time user" as "doesn't have a favorite movie yet" instead of using NextAuth's `isNewUser` flag. That way, if someone closes the tab halfway through onboarding, they still get sent back to it next time.

### Database

- **User**: the normal NextAuth fields plus `favoriteMovie` (nullable, max 200 chars). One favorite per user, so I just put it on the user table.
- **Fact**: one row per generated fact, with `userId`, `movie`, `content` and `createdAt`. There's an index on `(userId, movie, createdAt desc)` so getting the latest fact is fast. I store the movie title on each fact so the cache is per user and per movie. If the movie ever changes, you won't get a fact about the old one.
- **FactGenerationLock**: at most one row per user. It means "a fact is being generated for this user right now" and has an expiry time.

### Fact generation (the Variant A part)

All of this is in `src/lib/facts/service.ts`. When someone asks for a fact:

1. Look up their movie. If they don't have one yet, return an error.
2. If the newest fact for this user and movie is less than 60 seconds old, return it.
3. Otherwise, try to grab the lock. This is a single SQL statement: insert the lock row, or take it over if the old one has expired. Postgres makes sure only one request can win. I tested this with 20 requests at the same time and exactly one got it.
4. The request that gets the lock checks the cache once more, because another request might have just finished. Then it calls OpenAI, saves the fact, and releases the lock.
5. The other requests (fast refreshes, other tabs) don't call OpenAI. They wait and check every 250ms for the new fact, so everyone ends up with the same one.
6. If OpenAI fails or takes longer than 10 seconds, the user gets their last fact back. If they have no facts yet, they get a friendly error.

The lock expires after 30 seconds. That's longer than the 10 second OpenAI timeout, so it never expires while a request is still working on it. But if the server crashes, the lock frees itself. When releasing, I delete the lock only if it still has my token, so one request can't accidentally remove another request's lock.

### Security

- `/api/fact` doesn't take a user id at all. It always uses the logged-in user from the session, and every query filters by that user id.
- The movie title is validated on the server: trimmed, extra spaces collapsed, 1 to 200 characters. The minimum is 1 because there are real one-letter titles like "M".
- The onboarding save checks the session again and only updates the user's own row, and only if the movie isn't set yet.
- The OpenAI and Google secrets are only read on the server. Nothing uses `NEXT_PUBLIC_`.
- The movie title goes to OpenAI as plain data, with a system prompt telling the model to treat it that way.
- If there's no Google photo, I show the first letter of the name. If there's no name, it says "Movie fan".

## Why Variant A

The interesting part of this app is calling OpenAI, which is slow, costs money and sometimes fails. Variant A is about handling that properly: caching, not making duplicate calls, and falling back when it fails. I also prefer backend work, and this kind of logic is easy to test.

## Tradeoffs

- **Lock row vs. Postgres advisory lock.** An advisory lock would keep a database transaction open for the whole OpenAI call. The lock row is two quick queries, works with multiple servers, and cleans itself up after a crash. The downside is that waiting requests have to poll.
- **Waiting instead of erroring.** If a second tab asks while a fact is being generated, it waits for that fact instead of getting an error. Nicer for the user, but the request can hang for a few seconds.
- **Server clock for timestamps.** This makes testing easy because I can fake the clock. With multiple servers whose clocks differ a bit, the 60 second window would be slightly off.
- **Keeping all facts.** I keep every fact instead of overwriting one row. It uses more space, but the fallback is simple and there's a history.
- **Database sessions.** Logout really kills the session, but every request does a DB lookup.
- **Fact loads in the browser.** The dashboard loads first and the fact comes in after, so a slow OpenAI call doesn't block the whole page.

## With 2 more hours

- Rate limit `/api/fact` per user.
- Let users change their favorite movie. The schema already handles it.
- Update the Google name and photo on every login. Right now they're only saved on the first one.
- Use the database clock for the 60 second check.
- Run the database tests in CI.
- Better logging for things like OpenAI failures and cache hits.

## Testing status

I ran the typecheck, lint, build, all 19 unit tests and the 3 database tests, and checked the logged-out redirects by hand. My OpenAI account had no credit while I was testing, so the live call failed. The app showed the friendly error, which is how it's supposed to handle failures. With a key that has credit, it generates facts normally.

## AI usage

- I used Claude Code (an AI coding assistant) to help build this: setting up the project, writing a lot of the code and tests, and drafting this README.
- I picked Variant A and Docker for Postgres, and went through the design choices like the lock approach and the 60 second check.
- I read through the code so I can explain how it works, especially the cache and locking logic.
- I ran the tests and the build myself to check everything works.
