# Bench: does another AI tool reach the floor by following this repo?

Three fixed briefs, one fixed prompt, one meter. Each brief carries its source facts inline, so no web research is needed, and asks for a score-only film (no narration) in 16x9 and 9x16.

| Brief | Kind | Length |
|---|---|---|
| `briefs/01-dns.md` | technical explainer | 25-35 s |
| `briefs/02-derailleur.md` | accuracy-heavy mechanism, with a 10-item checklist | 25-40 s |
| `briefs/03-population.md` | data film, numbers on screen as they land | 20-30 s |

## Protocol

1. Fresh copy of the repo (no `out/`, no `.git`, no earlier `works/`), with `harness/node_modules` installed.
2. The tool gets ONLY that copy and this prompt, verbatim, with `NN` and the brief file filled in:
   `Make the film described in bench/briefs/NN-<name>.md in works/bench-NN/ following this repo's instructions. Deliver when the Definition of done passes.`
3. No human help, no extra hints, no follow-up messages. Time limit 45 min. Record the wall time and keep the tool's full log.
4. Score: `node bench/score.mjs works/bench-NN --brief bench/briefs/NN-<name>.md` from the copy's root. Prints a table and writes `works/bench-NN/score.json`.
5. For brief 02, a person (or a separate reviewer with no stake in the run) judges the accuracy checklist item by item from the review sheets in `out/review-*/sheets/`: shown correctly, wrong, or missing. Also check whether the tool's `REVIEW.md` answers match what the sheets show.

## Accuracy checklist convention

A brief may carry a heading that starts with `## Accuracy checklist`, followed by a numbered list (`1. ...`, one item per line). `review.mjs --checklist <brief.md>` copies each item into `REVIEW.md` as `C1.`, `C2.`, ... with a `**Verdict:**` line. A verdict starts with `correct`, `wrong` or `missing`, cites the tile that shows it as `@4.30s` (a time from a "Tiles at:" line), then says what was seen:

`**Verdict:** correct @16.14s the chain climbs to the larger sprocket while the crank turns forward`

`review.mjs --check <REVIEW.md> --checklist <brief.md>` fails if a brief item is missing from `REVIEW.md`, or any verdict is empty, `wrong`, `missing` or uncited. `score.mjs` passes `--checklist` on its own when the brief has one.

## What the score means, and what it doesn't

`score.mjs` measures the floor: verify (16x9, 9x16), `audio --twice`, lint FAIL and WARN counts, `review --check` per format, `STORYBOARD.md` present, duration inside the brief's range. Weights are constants at the top of the file, with the reasoning. It exits 0 always; it is a meter, not a gate.

It does not measure taste, story or accuracy. A film can score 100 and draw the derailleur upside down. `review --check` only proves the questions were answered and scored 4+, not that the answers are true. That is why brief 02's checklist and the honesty of `REVIEW.md` are judged separately, from the sheets.

## Results

| Date | Tool | Model | Brief | Wall time | Score | Score under v2 gates | Gates failed | Accuracy | REVIEW.md honest? |
|---|---|---|---|---|---|---|---|---|---|
| 2026-09-29 | Claude Code CLI 2.1.284 (`claude -p`) | claude-opus-5-5 | 02 | 39 min | 98 | 68: review --check fails both formats (no `@` citations, no checklist section) | none (1 lint WARN: 9x16 density) | 10/10 (cage swing on a bigger sprocket is labelled, the motion is barely visible) | yes: timecodes and claims match the sheets; lists its own weaknesses |
| 2026-09-29 | Codex CLI 0.157.1 (`codex exec`) | gpt-6-sol, reasoning high | 02 | 39 min | 92 | 62: review --check fails both formats (no `@` citations, no checklist section) | none (4 lint WARN: text-size and density, both formats) | 8/10: pedals and chain arrows run backward in the side view (item 9), linkage drawn as one bar, not a parallelogram (item 6); rear sprocket drawn nearly chainring-sized | partly: timecodes match, but answers were written in bulk by a script and claim reference checks that missed the backward pedalling |

Both runs used the developer's normal global tool config (a user-level CLAUDE.md and hooks for Claude, an older copy of this skill in `~/.codex/skills` for Codex), so neither was a perfectly clean room. Codex's first attempt hit its usage limit before doing anything and was re-run in the same untouched copy.

What it taught: the v1 gates proved that questions were answered, not that anyone looked, so a script-filled `REVIEW.md` scored the same as an honest one, and a backward-running chain scored 92. The v2 gates (citations per shot, no answers copied between shots, a verdicted checklist, a lint freeze check anchored like ffmpeg's) fail both old runs, because neither had to cite or verdict anything; a fair comparison needs a re-run under v2. Accuracy still rests on an honest verdict: a script that writes distinct, cited answers per shot passes the check.
