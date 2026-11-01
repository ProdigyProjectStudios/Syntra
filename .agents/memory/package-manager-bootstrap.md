---
name: Pinned pnpm bootstrap
description: Replit's preinstalled pnpm can recurse when bootstrapping a different pinned version.
---

When a branch pins a pnpm version different from Replit's preinstalled version, automatic version installation can recurse into itself until Node exhausts worker threads.

**Why:** The Blueprint branch's pinned version triggered recursive child installers instead of starting the application. This was a package-manager bootstrap failure, not an application or port failure.

**How to apply:** Bootstrap the pinned pnpm with `npm_config_manage_package_manager_versions=false` for the installer process only, into pnpm's managed version directory. Then verify ordinary `pnpm --version` resolves the pinned version and reinstall the unchanged lockfile with `--frozen-lockfile`. Do not remove the repository pin or propagate the temporary bootstrap override into production.
