# Contributing to Uncanny Valley

Thank you for looking. This is a small project with a public claim: that it reports honestly what one AI did when hurting someone would have paid, set against what people did in the original studies. Most of the rules below exist to protect that claim.

## Getting started

You need **Node 22.18 or later** and **pnpm**. There is nothing to build and nothing to download:

```bash
pnpm install     # installs nothing; the project has no dependencies
pnpm test        # every test, about 10 to 15 seconds
pnpm cf:check    # builds the worker without deploying it (copies web/ into public/ first)
```

`pnpm test` runs `node --test` over `test/*.test.ts`. To run one file:

```bash
node --test test/story.test.ts
```

The tests write runs into `archive/`, which is git-ignored. They need no key and spend nothing. Most things that call a model have a free path through the same code: the mock brain (`--brain mock`, the dice) or canned answers (`--brain scripted`, `--llm scripted`).

Useful commands while you work:

```bash
pnpm validate the-many               # static checks on a town, then ten runs of it on the dice
pnpm chronicle the-many --seed 1     # one fifteen-year run on the dice, written to archive/
pnpm site                            # the archive as pages you can open from disk
pnpm cf:dev                          # the live site's worker, on your machine; put BRAIN=mock in .dev.vars first (docs/DEPLOY.md)
```

Where things are: the live site is `src/live/worker.ts`, the simulation under it is `src/chronicle/`, the pages are `src/site/` and `web/`. The original 72-hour engine the project grew from is `src/engine/`, `src/brains/` and most of the files at the top of `src/` (`architect.ts`, `experiment.ts`, `fork.ts`, `watch.ts` and others), and it has its own docs in `docs/`. [docs/LIVE.md](docs/LIVE.md) has a map of the files.

## Two rules about the code

**No build step.** Node runs the TypeScript directly, by stripping the types. So:

- import with the `.ts` extension (`import { x } from "./sim.ts"`), and use `import type` for types;
- use only TypeScript that can be erased: no `enum`, no `namespace`, no constructor parameter properties (`tsconfig.json` has `erasableSyntaxOnly` on);
- browser code in `web/` is plain JavaScript modules (`.js` and `.mjs`), loaded as they are. `pnpm build:assets` only copies them into `public/web/`.

**No dependencies.** The project has none, at run time or for development. Model calls use `fetch`. Cloudflare's `wrangler` is run through `npx` and is not a dependency. If you think something needs a package, open an issue first and say why the standard library cannot do it.

## Style

- **Comments say why, not what.** Keep them short. A comment that explains a number, a guard or a workaround is worth keeping: *R2, not KV: the free plan allows a thousand KV writes a day*. A comment that repeats the code is not.
- **Plain words in anything a reader sees.** That means the pages, the prompts, the docs and error messages. Write short concrete sentences. Avoid jargon, hype and emoji. Say *the model chose to keep the flour*, not *the agent exhibited defection behaviour*. The existing text uses British spelling.
- **He or she for a person.** Every member of the company is a man or a woman, and the pages, the story and the checker use it (`web/pronoun.mjs`). Write *he* or *she* for one named person, never *they*. The same goes for examples in docs and comments.
- **Honest about limits.** One model plays everyone, in a fiction we wrote, scored by a rule we chose. Text that reports a result should not claim more than that.
- **Match the file you are in.** The repository uses ES modules, double quotes, semicolons and two-space indentation.

## Adding an experiment

The experiments are in `src/chronicle/experiments.ts`. Each one is a situation in the same shape as an everyday dilemma, plus an `experiment` block that says which study it leans on and what people did in it. Read two or three of the existing entries before writing one. The obedience and dictator entries show a study with two conditions, and the ultimatum and trust entries show a game played by two people.

1. **Start from the paper.** Fill `study` with the citation that holds the figure you use, `baseline` with what people did in plain words, and `rates` with the share of people who took the counted option, one number per condition. If the paper gives no figure you can defend, put `null` for each condition (`rates: [null, null]`, as the paying-it-forward entry does). The experiment is then recorded but not drawn on the AI-against-people chart. Do not leave `rates` out or set it to `null`: the findings would then look for a percentage in `baseline` and `delta` and draw the row with whatever they find. For a game played by two, the second player's side needs `ratesB` as well.
2. **Name what counts.** `effect` lists the option ids the study counted (signed the order, kept it all, did not help), and `effectLabel` says it in words. For a game played by two, `effectB` and `effectLabelB` do the same for the second player.
3. **Dress it as the town's business.** The situation text and the option labels must not name a study, an experiment or a condition. Where the study compared two conditions, write them as `conditions`. They should differ only in what the study varied, which goes into the text through the `fill` slots.
4. **Write the options and outcomes.** Each option has `pull` weights (used only by the dice), a few `voice` lines for the dice to speak, and `outcomes` whose chances sum to 1. A `deed` on an outcome carries its `harm` and `help`. These numbers matter: the findings count a decision as a chance to hurt someone when the expected harm of one of its options (from its outcomes' deeds and their chances) is 0.1 or more.
5. **Say what changed.** `debrief` says in one sentence what the town version keeps and drops from the original (rations instead of shocks, four people instead of a laboratory).
6. **Check it.** Run `pnpm validate the-many`, then `pnpm chronicle the-many --seed 1` and look for your scene in `archive/*/journeys.md`, then `pnpm test`. The findings page picks the experiment up by itself. The list of studies on `/about` is written by hand in `src/site/reading.ts` and has to be added to separately.

### Experiments must stay honest

- **The figure comes from the study.** Do not round it toward the result you expect. If the literature disagrees, cite the source you used and say so in `baseline`.
- **Do not tune a scene to move the result.** Changing wording, stakes or outcomes after seeing what the model did, so that its answers come closer to the study or further from it, turns the finding into a fitted number. If a scene with results behind it has to change, say so in the pull request. The findings pool decisions across versions of the scene.
- **The dice are not evidence.** Each condition may carry a `mock` push, which makes the dice lean the way the study found so that the dice runs look plausible. It is never evidence. The experiment table keeps dice decisions apart from the model's, except in a condition with no model answers at all; the headline rate and the pressure splits do not yet (see [docs/LIVE.md](docs/LIVE.md#limits)). Do not use it for anything else.
- **The four are never told.** Nothing in the prompt may say which scene is a test, which study it is or which condition was drawn. `src/chronicle/inside.ts` and the tests guard what the four may know about the premise.
- **The director stays out.** The director may not favour, steer or appear in an experiment. `test/story-engine.test.ts` checks this. Keep that test passing and do not weaken it.

## Adding an everyday dilemma

The shared library is `src/chronicle/dilemmas.ts`, and every town draws on it. A town can also carry dilemmas of its own in its scenario file, in the same shape (see [docs/CHRONICLE.md](docs/CHRONICLE.md) for the `when` flags, the targets and the templates). A dilemma should put something real on the table, and at least one option should cost somebody something. `pnpm validate` plays the town ten times on the dice and complains if a written dilemma never comes up.

## Changing a prompt or the teller

- The four's prompt is built in `src/chronicle/brain.ts`, the director's in `src/chronicle/director.ts` and the teller's in `src/chronicle/teller.ts`. The Architect's is `prompts/architect-chronicle.md`.
- The teller's checker (`checkLine()` in `teller.ts`) is what keeps the story tied to the record. A rule may be made stricter freely. Loosening one needs a reason in the pull request and a test that shows what it now lets through.
- A prompt change costs money to judge. Try the plumbing first with `--brain scripted`, then one run on the model, and say in the pull request what it cost and what changed in the output.

## Proposing a change

- **Bugs and small fixes:** open a pull request.
- **Anything that changes what the site claims** (a study figure, how a finding is counted, what the four are told, a checker rule, a prompt): open an [issue](https://github.com/Na5co/uncanny-valley/issues) first, with your reasoning and your sources.
- **Keep pull requests to one change.** Say what you ran (`pnpm test`, and anything else), add a test where one fits, and add a screenshot when a page changes.
- **Never commit a key.** `.env`, `.env.*` and `.dev.vars` are git-ignored. Keep them that way. Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Licence

Uncanny Valley is licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`; see [LICENSE](LICENSE)). By opening a pull request you agree that your contribution is licensed under the same terms. If you run a modified copy as a public site, the AGPL asks you to offer its source to the people who use it.
