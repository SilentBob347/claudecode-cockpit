---
name: ss
description: "Find a past Cockpit session — any project, any engine, any date — from a one-line description, and link to it."
argument-hint: "<what the session was about>"
---

Find the past session the user is describing. The user rarely remembers the exact words, so do NOT search their sentence verbatim — expand it into keywords, search, read the snippets, and judge.

## 1. Expand the description into keywords

Write 3–8 short keywords that would literally appear in that conversation:

- The distinctive nouns of the topic (a file, API, error, product, library name)
- Both languages when the topic is technical: e.g. `快照` and `snapshot`, `跨站` and `CSRF`
- Synonyms and the words the assistant would have used in its reply
- Short is fine — 2-character Chinese words match. Avoid generic words (`问题`, `代码`, `fix`) that hit hundreds of sessions

## 2. Search

Each `q` is one keyword; repeat `q` for more (or join alternatives with `|`). Always URL-encode:

```bash
curl -fsS --get "{{BASE_URL}}/api/sessions/search" \
  --data-urlencode "q=<keyword 1>" \
  --data-urlencode "q=<keyword 2>" \
  --data-urlencode "q=<keyword 3>"
```

Optional filters:

- `--data-urlencode "cwd=/abs/project/dir"` — only that project (and its subdirectories)
- `--data-urlencode "since=2026-09-01"` — only sessions updated since (ISO date or epoch ms)
- `--data-urlencode "limit=20"` — default 10, max 30

Response: `results[]`, best first, each with `engine`, `cwd`, `title`, `updatedAt` (epoch ms), `matchedTerms`, `matchCount`, `snippets`, and `link` (null when the project directory is unknown). `corpus` reports indexing stats; the first call on a machine may take several seconds while the corpus is built.

## 3. Judge, refine if needed

- Read the snippets; ranking is keyword-based, the judgment is yours
- Too many plausible hits → add a distinctive keyword, or use `cwd` / `since` if the user hinted at a project or time
- No hits → try synonyms, the other language, or shorter keywords
- Stop after 3 rounds; say what you tried

## 4. Reply

Give 1–3 candidates, most likely first. For each: title, project (basename of `cwd`), engine, date, one line on why it matches, and the link exactly as returned, as a markdown link:

```markdown
1. **<title>** — <project> · <engine> · <YYYY-MM-DD>
   <why this is the one>
   [Open session](<link>)
```

If `link` is null, give the `cwd` and `sessionId` instead. Never invent or rewrite a link.
