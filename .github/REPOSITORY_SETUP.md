# GitHub repository settings

These settings are a manual setup checklist. Adding this file does not activate GitHub protections.

## General → Pull Requests

- Enable squash merging and use the pull request title as the default commit subject.
- Disable merge commits and rebase merging to keep one consistent merge strategy.
- Enable automatic deletion of head branches after merging.

## Collaborators

Invite the five other team members and give them the access needed to push branches and review changes. Do not share credentials. At least one other collaborator with write access must be available to approve pull requests.

## Rules → Rulesets → New branch ruleset

Create an active branch ruleset named `Protect main`, targeting `main`:

- Require a pull request before merging.
- Require one approving review.
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merging.
- Require status checks to pass: `Python quality`, `Web formatting`, and `Conventional PR title`.
- Require the branch to be up to date before merging.
- Block force pushes and restrict deletion.
- Require linear history.
- Leave the bypass list empty for ordinary development.
- Do not enable "Restrict updates", which would also prevent normal merges without a bypass.

Publish the workflow files and run a first pull request before selecting the required status checks; GitHub needs to see those checks first. Confirm the exact displayed check names in that pull request.

Rulesets for private personal repositories require GitHub Pro or an eligible higher plan. If the current plan does not support them, the documented workflow remains a team agreement rather than an enforced restriction. Keep the repository private unless the team explicitly decides otherwise.

## Actions → General

- Use read-only workflow permissions by default.
- Leave permission for Actions to create and approve pull requests disabled.

## Validation

Use a small documentation pull request to verify that a malformed title fails, a valid title passes, and merging is blocked until required checks and another member's approval are present. Then merge using squash.

References:

- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- https://docs.astral.sh/ruff/integrations/
