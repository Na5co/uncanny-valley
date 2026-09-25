# Security

## Reporting a problem

Please report security problems **privately**, through GitHub's private vulnerability reporting for this repository:

<https://github.com/Na5co/uncanny-valley/security/advisories/new>

Do not open a public issue for a security problem, and do not test against the live site in a way that costs money or disturbs the run (see [Testing](#testing)).

A useful report says:

- what the problem is and where it is (file and line, or route);
- how to reproduce it, against a local copy if you can;
- what an attacker gains: money spent on the operator's model key, the ops token, a secret, control of the run, script in a page;
- whether you have told anyone else.

The project is maintained by one person. You will get an answer in the advisory thread, and a fix will be credited to you unless you would rather it were not.

## What is in scope

- **The worker** (`src/live/worker.ts`) and everything it serves: the stored pages, `/state`, `/record.json`, `/health`, `/ops` and the `/ops/*` routes. For example: a way to make the worker call a model, change the run or write to R2 without the ops token; a way to read something the worker should not serve; a way to get script into a page. Model output, a town written by the Architect and the teller's story all end up in pages, so an escape that lets any of them run as HTML or script is in scope.
- **The ops token.** It is kept as the R2 object `state/ops:token` (or, for older copies, the KV key `ops:token`), sent as `Authorization: Bearer <token>` or `?token=`, and compared in constant time. A way to bypass it, guess it or recover it is in scope.
- **Secrets handling.** The model key is a Cloudflare secret (`DEEPSEEK_API_KEY`) for the worker, and `.env` or `.dev.vars` (both git-ignored) for local runs. A way for the code, the logs, a trace in R2 (`calls/...`), an archive written by the command line or the pages to expose a key or the token is in scope.
- **Spending.** A way for a visitor to make a copy spend significantly more on its model key than normal running does.

## What is not in scope

- **Things that are public on purpose.** `/ops` (the cost and model-health page), `/ops?format=json`, `/state`, `/record.json` and `/health` are public and read-only by design. So are the prompts, the rules and the example decision on `/how`.
- **What the AI people say or do in the story.** It is fiction played by a model. If a finding is wrong or a study figure is misquoted, please open an ordinary [issue](https://github.com/Na5co/uncanny-valley/issues).
- **Volume.** Flooding the site with requests, or using up a free-plan allowance by volume alone.
- **Problems in Cloudflare, DeepSeek, Node or wrangler themselves.** Report those to them.
- **Copies run by other people.** Each operator is responsible for his or her own deployment, key and token.

## Supported versions

Only the current `main` branch and the live deployment are supported. There are no releases.

## Testing

Test against your own copy: [docs/DEPLOY.md](docs/DEPLOY.md#local-development) shows how to run the worker locally with `pnpm cf:dev` on the dice, with `BRAIN=mock` in `.dev.vars`, so that it spends nothing. Please do not call the ops routes or other paid paths on the live site, and do not try to guess its token.

## If you run a copy

- Keep the model key only in `npx wrangler secret put DEEPSEEK_API_KEY`, and in `.env` or `.dev.vars` on your own machine. Never commit it. If a key was ever committed or pasted somewhere public, revoke it with the provider.
- Make the ops token long and random (`openssl rand -hex 32`), and send it in the `Authorization` header. A token in a URL is written into the Workers logs and your browser history. If it has ever been in a URL someone else could see, set a new one.
- `/ops` is public. It shows your spend and the model's recent refused replies. Keep that in mind before you put anything private in a town or a prompt.
