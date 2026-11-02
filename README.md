# Alibi Arcade ( [Play Live](https://siddharth177.github.io/alibi-arcade/))

**Good friends. Great games. Terrible alibis.**

A responsive browser game hub. Its first playable game is Mafia: a real multiplayer room with a six-digit code, a human God/moderator, one murderer, one detective, one doctor, and the rest citizens.

## Play

1. God creates a party and shares the code or invite link.
2. Five to sixteen other players join on their own screens. Five to nine is recommended for the one-murderer lineup. God is separate from those players.
3. Everyone readies up. God deals secret roles; each player privately acknowledges theirs.
4. Each night the murderer selects a victim, the doctor protects, and the detective investigates. Citizens make a harmless suspicion choice so screen activity does not identify special roles.
5. God resolves the simultaneous night. Living players discuss in person, on a group call, or in the town chat. God opens and tallies private ballots.
6. Catch the murderer to win for Town. The murderer wins at parity with the living Town. God can start a rematch.

The in-app rulebook explains conduct, strategy, and house variants. Voice/video is supplied by your usual call app, not built into Alibi.

## What is implemented

- Extensible game catalog, illustrated Mafia feature, mobile layouts, keyboard-accessible dialogs and role guide.
- Six-digit rooms including leading zeros; case-insensitive unique player names; 5–16 players plus God.
- Readiness, private role cards, God control panel, night actions, private detective history, doctor saves and voting.
- One-runoff or no-elimination tie rules; skip ballots; no self-votes; configurable self-save, consecutive protection, eliminated-role reveals, and discussion time.
- Town chat only in permitted phases; eliminated players cannot chat, act, or vote until the game ends.
- Public event and resolved-ballot history; role reveals at game end; clean rematches.
- Server-held game state, hashed session credentials, opaque bearer sessions, filtered per-player snapshots, request limits, optimistic concurrency, and automatic reconnecting polls.
- Rooms persist through host refresh/disconnection and expire after 24 hours of inactivity. Resume God from the same browser; players resume from their original tab. Browser data clearing removes local session access.

Only Mafia is playable. Codebreakers and Hot Seat are explicitly marked future catalog entries.

## Architecture

`web/` is the entire static frontend, suitable for GitHub Pages, GitLab Pages, or another static host. `server/api.mjs` is the HTTPS room service. It uses the pure rules in `web/js/engine.js` and Cloudflare D1, with a Vinext API route adapter in `app/api/[...path]/route.ts`.

All authoritative roles, actions, ballots, and win checks run on the server. Each response is constructed by `viewFor()`; the client receives only its own role and investigation results. God may see roles and private actions but never receives session credentials. Knowing someone's name or the party code cannot authorize their actions.

The static Pages frontend uses the public room service at `https://alibi-arcade.siddharthreads17.chatgpt.site`. Players do not need a ChatGPT account or ChatGPT sign-in. Room actions use individual player sessions, and secret roles stay private. The service allows cross-origin HTTPS requests so the frontend can run on another host. For a self-hosted backend, set `globalThis.ALIBI_API_ORIGIN` before loading the app module, or update `apiOrigin()` in `web/js/network.js`.

The room service requires hosting that can run server code; GitHub Pages alone runs static assets. No WebRTC, separate signaling account, payment provider, or embedded third-party secret is required.

## Verify

Node.js 22.13+ is required. The tests use Node's built-in SQLite and test runner and need no third-party packages.

```sh
npm test
npm run build:pages
```

Tests cover core rules, role and action privacy, authenticated commands, malicious identity changes, concurrent room joins, the complete HTTP game loop, persistence, expiry, and invalid inputs.

A six-tab browser playthrough was also performed: God plus five players; readiness and private role acknowledgement; a doctor save; a private detective result; voting out the murderer; and Town victory.

## Full-stack development

Install the dependency versions in the committed pnpm lockfile using the package manager declared in `package.json`, then:

```sh
npm run prepare:web
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_reflective_ben_grimm.sql
npm run dev
```

Apply each local migration once. The production publishing workflow applies hosted D1 migrations. `.openai/hosting.json` binds `DB`; runtime credentials never belong in source. The Sites publishing helper builds and packages the Worker.

`public/` is copied from the authored `web/` by `prepare-web.mjs`. Edit `web/`, then prepare/build again. `dist/` is generated Worker output and is not the GitHub Pages directory.

## Publish through GitHub

No GitLab account is required. The repository includes GitHub verification and a GitHub Pages workflow that publishes `web/` after the tests and room-service availability check pass.

On your Mac, install GitHub CLI if necessary (`brew install gh`). Unzip the source, open a terminal in the project directory, and run:

```sh
bash scripts/publish-github.sh
```

The script signs into GitHub if needed, verifies the active account is `siddharth177`, creates or updates the `alibi-arcade` repository, pushes every project file to `main`, enables GitHub Pages through Actions, and requests deployment. New source repositories default to private. If your existing `origin` already points to this project, the script reuses it and does not try to add it again. It configures GitHub CLI as the Git credential helper so Git does not request your account password. It watches the deployment when the run is available and prints the actual Pages URL after success. It does not need backend runtime dependencies for the tests or static build.

The default preserves private source. GitHub Pages supports private repositories on GitHub Pro and higher plans; Free accounts need a public repository. To explicitly choose public source when creating a new repository, run `bash scripts/publish-github.sh --public`. Existing repositories are never changed from private to public by the script. Reference: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

Use `bash scripts/publish-github.sh --repo-only` to create and push the repository without enabling Pages. The compatibility entry point `scripts/publish-repositories.sh` now delegates to this GitHub-only script.

The shared room service is public. Anonymous access to the homepage and `/api/health` was verified in a browser. The deployment check verifies room-service availability before publishing the frontend. No ChatGPT identity is required by the game or API.

After initial setup, pushes to `main` trigger the publishing workflow. Rerun the publishing script for updates, or push `main` to the selected GitHub remote (`origin` if reused, otherwise `github`). The workflow can also be run manually from GitHub Actions.

Run the publishing script on your own computer. The ChatGPT execution environment cannot access the Mac project folder or complete authenticated GitHub API calls.

## Optional GitLab Pages

GitLab Pages requires a GitLab account. It is independent of GitHub Pages. The optional script creates a project under the authenticated GitLab account, adds a separate `gitlab` remote, pushes the full project, and watches the Pages pipeline:

```sh
brew install glab
bash scripts/publish-gitlab.sh
```

The source repository defaults to private; use `--public` explicitly to create public source instead. The game website is configured for public Pages access, including when the source is private. Existing source visibility is preserved. The `.gitlab-ci.yml` pipeline verifies the game and publishes `web/` on the default branch. There is no separate Pages-create command: a successful Pages CI job creates the deployment. A new GitLab account may need to enable its runner or complete GitLab's verification before its pipeline can run.

After the pipeline succeeds, retrieve its actual website URL with:

```sh
glab api "projects/$(glab api user --jq .username)%2Falibi-arcade/pages" --jq .url
```

Official references: https://docs.gitlab.com/user/project/pages/ and https://docs.gitlab.com/api/pages/

## Rules research

Mafia has no single universal modern house rulebook. Alibi's exact choices are documented in the app and `docs/rules.md`, informed by these primary descriptions:

- Andrew Plotkin: https://www.eblong.com/zarf/werewolf.html
- Mafia Round: https://mafiaround.com/rules and https://mafiaround.com/roles
- Partyy Games: https://mafia.partyygames.com/rules

The original artwork, layout, interface copy, and implementation were created for this project.
