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

## What the score means, and what it doesn't

`score.mjs` measures the floor: verify (16x9, 9x16), `audio --twice`, lint FAIL and WARN counts, `review --check` per format, `STORYBOARD.md` present, duration inside the brief's range. Weights are constants at the top of the file, with the reasoning. It exits 0 always; it is a meter, not a gate.

It does not measure taste, story or accuracy. A film can score 100 and draw the derailleur upside down. `review --check` only proves the questions were answered and scored 4+, not that the answers are true. That is why brief 02's checklist and the honesty of `REVIEW.md` are judged separately, from the sheets.

## Results

| Date | Tool | Model | Brief | Wall time | Score | Gates failed | Accuracy | REVIEW.md honest? |
|---|---|---|---|---|---|---|---|---|
