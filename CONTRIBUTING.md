# Contributing to Khaleesi

## Team workflow

1. Create a short-lived branch from the latest `main`, for example `feat/valve-feedback`, `fix/sensor-timeout`, or `docs/setup`.
2. Keep each change focused. Write code, comments, commits, and pull requests in English.
3. Run the relevant checks locally and open a pull request targeting `main`.
4. Request review from another team member. Explain the change and how it was validated.
5. Address review comments and obtain at least one approval from someone other than the author.
6. Merge with **Squash and merge**, using the validated pull request title as the final commit subject.

Do not push directly to `main`. This workflow becomes enforceable once a repository administrator activates the protections described in `.github/REPOSITORY_SETUP.md`.

## Commit and pull request titles

Use `type(scope): short description`. The scope is optional. Use `!` before the colon for a breaking change and explain the impact in the description.

Examples:

- `feat(control): add valve state display`
- `fix(acquisition): handle disconnected sensors`
- `test(api): cover invalid actuator commands`
- `docs: explain simulation setup`
- `ci: add Python quality checks`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`.

CI enforces pull request titles. Individual branch commits follow the same convention by agreement; they are not automatically checked. Squashing produces one final commit per pull request. Configure GitHub to use the pull request title as its default squash commit subject.

## Code standards

- Python baseline: 3.11 or newer, with CI running Python 3.11.
- Use four spaces for Python and two for web files; keep files UTF-8 with LF line endings.
- Use Ruff for Python formatting, import order, and selected correctness checks. The Python line-length target is 100 characters.
- Use Prettier for HTML, CSS, JavaScript, TypeScript, and JSON formatting.
- Use descriptive names, small focused functions, and type hints for new Python interfaces.
- Keep acquisition, hardware communication, server logic, and display responsibilities separate.
- Validate incoming commands and handle invalid values, disconnected devices, and state-feedback mismatches explicitly.
- Never commit credentials, private test recordings, or local databases. `.gitignore` is not a secret scanner.

Formatting is automated. Design, naming, typing, and behavior are checked during review. Front-end linting, type checking, and runtime tests must be added when the front-end framework is selected.

## Local checks

Create and activate a Python virtual environment, then run:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
ruff check .
ruff format --check .
```

To apply Python formatting, run `ruff format .`. To apply safe automatic lint fixes, run `ruff check --fix .` and review the changes.

With Node.js 22 installed, check web formatting with:

```sh
npx --yes prettier@3.6.2 --check '**/*.{js,mjs,cjs,jsx,ts,tsx,css,scss,html,json}' --no-error-on-unmatched-pattern
```

Replace `--check` with `--write` to format these files.

## Tests and reviews

Place Python tests in `tests/`. Once this directory exists, CI runs `python -m pytest tests`; no collected tests is a failure. Application dependencies will be installed from `requirements.txt` when present. Update CI if the project adopts another dependency layout.

Until tests exist, the Python job only verifies code quality; a green result does not demonstrate functional correctness.

Add relevant tests for new behavior and bug fixes. Prioritize command verification, invalid sensor data, acquisition/display separation, data recording, and connection loss. Automated checks must use simulation rather than operate physical test equipment.

Reviewers should check correctness, error handling, maintainability, test evidence, and hardware impact. Changes to actuator commands or hardware communication should be reviewed by a back-end team member. Add automated code-owner routing once all GitHub usernames and source paths are agreed.
