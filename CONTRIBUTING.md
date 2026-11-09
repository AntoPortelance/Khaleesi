# Contributing to Khaleesi

## Team workflow

1. Create a short-lived branch from the latest `main`, for example `feat/valve-feedback`, `fix/sensor-timeout`, or `docs/setup`.
2. Keep each change focused. Write code, comments, commits, and pull requests in English.
3. Run the relevant checks locally and open a pull request targeting `main`.
4. Request review from another team member. Explain the change and how it was validated.
5. Address review comments and obtain at least one approval from someone other than the author.
6. Merge with **Squash and merge**, using the validated pull request title as the final commit subject.

Do not push directly to `main`. This workflow becomes enforceable once a repository administrator activates the protections described in `.github/REPOSITORY_SETUP.md`.

## Step-by-step tutorial

This walkthrough takes you from your first local setup to a reviewed, merged change. Commands are run in a terminal. Use a separate branch and pull request for each focused task.

### 1. Prepare your account and tools (once)

- Accept the repository invitation using your own GitHub account.
- Install Git, Python 3.11 or newer, and Node.js 22 if you work on web files.
- Authenticate Git with your GitHub account using your credential manager or SSH. Do not use your account password for Git HTTPS authentication or put a token in a command or repository file.
- Configure the author identity for your commits. Replace the example values with your name and an email linked to GitHub, or your GitHub-provided private commit email.

```sh
git --version
python3 --version
node --version
```

### 2. Open a local copy

**If you do not have a local copy**, open a terminal in the parent folder where you want the project, then run:

```sh
git clone https://github.com/AntoPortelance/Khaleesi.git
cd Khaleesi
```

**If you already have a local copy**, open a terminal in that repository instead. For Antoine's existing copy, this is the `Project/code` folder. Do not clone a second repository inside it.

Check that you are in the correct repository:

```sh
git rev-parse --show-toplevel
git remote -v
```

The remote should point to `AntoPortelance/Khaleesi`. Set your author identity for this repository:

```sh
git config user.name "Your Name"
git config user.email "your-github-email@example.com"
```

These two settings identify your commits; they do not sign you in to GitHub.

### 3. Start from an up-to-date main branch

```sh
git status
git switch main
git pull --ff-only
```

Start with a clean working tree. If `git status` shows unfinished work, commit it on its own task branch or save it before switching. Do not discard it just to make the command succeed. If `git pull --ff-only` refuses to proceed, your local and remote histories have diverged; inspect the situation with a teammate rather than forcing the update.

### 4. Create a task branch

For example, to improve the contribution documentation:

```sh
git switch -c docs/contribution-guide
```

Use a short descriptive name, such as `feat/valve-feedback`, `fix/sensor-timeout`, or `docs/contribution-guide`. Replace the example name consistently in later commands. Confirm your current branch:

```sh
git branch --show-current
```

You should see your task branch, not `main`.

### 5. Make and inspect your changes

Edit the relevant files in your editor. Keep unrelated changes for another branch. Then inspect what changed:

```sh
git status
git diff
```

`git status` lists modified and new files. `git diff` shows unstaged edits to files already tracked by Git; it does not display the contents of new, untracked files. Open new files in your editor too.

Do not include `.env` files, credentials, local databases, or private test recordings. Review every file you intend to send.

### 6. Run the relevant checks

For Python development, create the environment once:

```sh
python3 -m venv .venv
```

Activate it in each new terminal:

```sh
# macOS / Linux
source .venv/bin/activate
```

On Windows PowerShell, use `.venv\Scripts\Activate.ps1` instead. If your Python executable is named `python` rather than `python3`, use it for environment creation too.

Install the development tools and check Python code:

```sh
python -m pip install -r requirements-dev.txt
ruff check .
ruff format --check .
```

If an application `requirements.txt` exists, install it with `python -m pip install -r requirements.txt`. If a `tests/` directory exists, run:

```sh
python -m pytest tests
```

For web-file changes, run the Prettier command in [Local checks](#local-checks). Fix failures and rerun affected checks before continuing. Documentation-only changes do not require application tests; read the text and check the Markdown preview. GitHub still runs its configured checks on the pull request.

### 7. Stage only the intended files

For this documentation example:

```sh
git add CONTRIBUTING.md
git diff --cached
git diff --cached --check
git status
```

Replace `CONTRIBUTING.md` with the actual paths you changed, separated by spaces. Quote any path containing spaces. Staging selects the content that will go into the next commit. `git diff --cached` lets you inspect that exact content, including new files.

If you staged a file by mistake, remove it from the staging area without deleting your edits:

```sh
git restore --staged CONTRIBUTING.md
```

If you edit a file again after staging it, run `git add` again to include the latest edits.

### 8. Create a commit

```sh
git commit -m "docs: add contribution walkthrough"
git status
git log -1 --oneline
```

A commit records the staged changes locally. It does not send them to GitHub. Use the title format described in [Commit and pull request titles](#commit-and-pull-request-titles). A clean working tree means all intended edits have been recorded; inspect any remaining changes before proceeding.

### 9. Push your branch to GitHub

```sh
git push -u origin docs/contribution-guide
```

The first push publishes your branch and links it to the remote branch. For subsequent commits on the same branch, use `git push`. Do not push to `main` or use a force push.

### 10. Open a pull request

1. Open the repository on GitHub and click **Compare & pull request**, or open **Pull requests → New pull request**.
2. Set the base branch to `main` and the compare branch to your task branch.
3. Give the pull request a title such as `docs: add contribution walkthrough`.
4. Complete the template: purpose, validation, checklist, and hardware impact. Link any relevant issue; use `Closes #12` only if this change actually completes issue 12.
5. Inspect **Files changed** for accidental files or unrelated edits.
6. Open the pull request and request a review from another team member with write access. Use a draft if the work is not ready.

### 11. Respond to checks and review

Inspect failing checks in the **Checks** tab and address review comments on the same branch. You do not need a new pull request for each correction:

```sh
# Edit files and rerun the relevant checks first.
git add CONTRIBUTING.md
git diff --cached
git commit -m "docs: clarify contribution instructions"
git push
```

The existing pull request updates automatically. New reviewable commits invalidate earlier approvals under the configured rules, so request another review when ready. Resolve conversations after addressing the feedback and confirming the outcome with the reviewer.

If GitHub says your branch is behind `main`, use **Update branch** when available. Alternatively, with a clean working tree on your task branch:

```sh
git fetch origin
git merge origin/main
```

If Git reports conflicts, open each conflicted file, combine the intended changes, and remove the `<<<<<<<`, `=======`, and `>>>>>>>` markers. Do not blindly keep one side. Stage each resolved file, finish with `git commit`, rerun the relevant checks, and `git push`. To abandon an in-progress conflict resolution and return to the pre-merge state, use `git merge --abort`.

A merge of `main` into a task branch is compatible with the workflow: the final **squash** keeps `main` linear. Do not resolve conflicts by force pushing.

### 12. Merge and prepare the next task

Once required checks pass, conversations are resolved, and another member has approved the latest changes:

1. Click **Squash and merge**.
2. Confirm that the final commit subject follows the agreed title format.
3. Confirm the merge. GitHub should delete the remote task branch automatically if configured.

Refresh your local copy:

```sh
git switch main
git pull --ff-only
git fetch --prune
```

Optionally delete the completed local task branch:

```sh
git branch -d docs/contribution-guide
```

After a squash merge, Git may refuse `-d` because the original branch commits are not individually present in `main`. It is fine to keep the local branch; verify the pull request is merged and all work is preserved before considering forced deletion.

Start the next task by creating a new branch from this updated `main`.

### Common situations

| Situation | What to do |
| --- | --- |
| `Permission denied` or `Repository not found` | Check the remote URL, accepted invitation, and the GitHub account used by your Git credentials. |
| `Nothing to commit` | Check that files were saved and intended changes were staged with `git add`. |
| Push rejected because the remote branch changed | Fetch and inspect the changes with a teammate; do not force push. |
| Merge button is blocked | Read the reason: missing approval, failed check, unresolved conversation, outdated branch, or conflict. |
| You edited files on `main` but have not committed | Create a task branch with `git switch -c your-task-branch` before staging and committing. |
| You accidentally committed a credential | Treat it as exposed: revoke or rotate it immediately and notify the repository owner through your team's private channel. Deleting it in a later commit does not remove it from history. |

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
