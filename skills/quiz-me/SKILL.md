---
name: quiz-me
description: Trigger this if the user says quiz me
---

# Quiz Me

The user wants to find out whether they really understand a feature. A quiz that is easy, or wrong, wastes their time. Make it hard, make it right, and treat their wrong answers as data: some are gaps in understanding, and some show the design is not what they want.

## Budget

- Default: 10 questions, about 5 to pick and 5 to write out. Use the user's numbers if they give them.
- One validation round with a second model.
- You can put in more questions if it's a very big feature. The maximum are 20 questions.

## 1. Scope

Read the sources before writing. Every answer must trace to a file:line, a spec line, or a decision the user made.

## 2. Draft

Work in a new directory, `~/.local/state/quiz-me/<slug>/`. Write `questions.js` and
`rubrics.md` (format in [Files](#files)).

Hard questions, not trivia:

- Scenarios with several steps: "X happens, then Y, then the user does Z. What does the system do?"
- Date, money, and count arithmetic the user would have to do in real life.
- Edge cases and failure paths: retries, offline, two devices, races, boundaries (the last day, the exact minute).
- "Why" questions: why this design and not the obvious alternative.
- Questions where a common misconception is the most tempting wrong answer.

Pick-one and pick-all questions:

- One idea per question. 4 options, all plausible, similar length and tone.
- Wrong options are real misconceptions, not jokes. No "all of the above".
- `why` says why the right answer is right in 1-2 sentences. It shows after the user checks, so it should teach.

Written questions:

- Ask for a trace or an explanation: "walk through X from A to B", "why can't we do Y?". Each gets a points rubric in `rubrics.md`. The rubric never goes in the quiz page.

Order the questions so they mix topics and types, easiest first.

## 3. Validate with a second model

Use a model from a different provider, Sol by default. In T3, call
`orchestrator_capabilities`, then `delegate_task` (`role: "review"`).
Elsewhere, use a native subagent on another model. Give it the paths to
`questions.js`, `rubrics.md`, and the sources. Brief:

```
Review only. Do not edit files.
Quiz: <dir>/questions.js, rubrics: <dir>/rubrics.md. Sources: <paths>.
Agreed decisions not yet in code: <list>.
For each question: is the marked answer right per the sources (cite)?
Is any other option also defensible? Rate difficulty 1-5 for someone who
was in the design conversation. Replace any question rated 1-2 with a
harder one on the same topic. Check every date, sum, and count.
Check each rubric covers what a full answer needs.
Reply: per question: id, verdict (ok / wrong / ambiguous / too easy),
difficulty, fix. Then any replacement questions in the same format.
```

Verify every change it proposes against the sources yourself before you take it. Second models are confidently wrong about details too. Redo any arithmetic it touched.

## 4. Build and test

```bash
node <skill-dir>/scripts/build.cjs ~/.local/state/quiz-me/<slug> "<Quiz title>"
```

It checks the questions and writes `quiz.html`. It fails on bad ids, missing rubrics, out-of-range answers, and right answers bunched in one slot after shuffling. Fix the questions, not the check. Read its warnings: if the right answer is often the longest option, rewrite those options.

If a headless browser is available, load the page, answer every question, and confirm `answers.json` fills in.

## 5. Serve

The quiz must save to disk as the user goes, so you can read it later without a paste. A preview rendered in the chat can't save. Don't use it.

Start the server so it outlives your turn:

```bash
systemd-run --user --unit quiz-<slug> --collect \
  node <skill-dir>/scripts/server.cjs ~/.local/state/quiz-me/<slug> <port>
```

No systemd: `nohup node ... &` and note the PID. Pick a free port.

To reach it from another device, if Tailscale is installed:

```bash
tailscale serve --bg --https=<port> http://127.0.0.1:<port>
```

Tell the user the link and how many questions. Say picked answers are
marked as they go and written ones when they say they're done. Then stop
and wait.

## 6. Mark

When the user says they're done, read `~/.local/state/quiz-me/<slug>/answers.json`. It
has `state` (raw answers) and `transcript` (readable).

- Picked answers are already marked. For each miss, give the right answer
  and the reason in one line.
- Mark written answers against `rubrics.md`, point by point, with partial
  credit. Quote what they got right, and say what was missing.
- Lead with the score: picked right out of total, written points out of
  total. Then the weakest topics.
- Some wrong answers are the user telling you what they want. If an answer
  describes a reasonable design that differs from the agreed one, say so,
  and ask which they want. Don't just mark it wrong.

Answer any questions the user asks alongside their answers before you mark.

## 7. Take down

When the user is finished with the quiz:

```bash
systemctl --user stop quiz-<slug>
tailscale serve --https=<port> off
```

Keep `~/.local/state/quiz-me/<slug>/` until the user moves on, in case they want to
retake it. To retake it, they tap Start over on the last screen.

## Files

`questions.js`:

```js
module.exports = [
  { id: 'grace-start', type: 'single',          // single | multi | open
    text: 'The question.',
    options: ['Right', 'Wrong', 'Wrong', 'Wrong'],
    correct: [0],                               // indexes into options
    why: 'Why the right answer is right.' },
  { id: 'trace-renewal', type: 'open',
    text: 'Walk through ... from ... to ...' },
]
```

Ids are lowercase words joined by hyphens, unique. Write the right answer
anywhere in `options`: the page shuffles them.

`rubrics.md`, one section per written question:

```md
## trace-renewal (5 points)
1. First thing a full answer must say.
2. ...
```
