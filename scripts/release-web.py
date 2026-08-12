#!/usr/bin/env python3
"""Export Windsage web, snapshot a version, prune old builds, optionally deploy.

Keep a snapshot if either:
  - it is among the newest 3 versions, OR
  - its age is more than 1 day and less than 7 days.
Delete everything else (fresh extras beyond the newest 3, and anything ≥ 7 days old
unless it is still in the newest 3).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
RELEASES = ROOT / "releases" / "web"
DAY_SEC = 24 * 60 * 60
WEEK_SEC = 7 * DAY_SEC
KEEP_NEWEST = 3


def run(cmd: list[str], **kwargs) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True, **kwargs)


def list_versions() -> list[Path]:
    if not RELEASES.exists():
        return []
    dirs = [p for p in RELEASES.iterdir() if p.is_dir() and p.name != "current"]
    return sorted(dirs, key=lambda p: p.stat().st_mtime, reverse=True)


def should_keep(index: int, age: float) -> bool:
    if index < KEEP_NEWEST:
        return True
    return DAY_SEC < age < WEEK_SEC


def prune_versions() -> list[str]:
    """Keep newest 3, plus versions aged (1d, 7d); delete the rest."""
    now = time.time()
    versions = list_versions()
    deleted: list[str] = []
    for index, path in enumerate(versions):
        age = now - path.stat().st_mtime
        if should_keep(index, age):
            continue
        reason = "≥7d" if age >= WEEK_SEC else f"age {age/3600:.1f}h not in newest {KEEP_NEWEST}"
        print(f"prune: removing {path.name} (rank #{index + 1}, {reason})")
        shutil.rmtree(path)
        deleted.append(path.name)
    return deleted


def snapshot() -> Path:
    RELEASES.mkdir(parents=True, exist_ok=True)
    if not DIST.exists() or not any(DIST.iterdir()):
        raise SystemExit("dist/ is empty — export failed?")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    # Avoid collisions if run twice in the same second.
    target = RELEASES / stamp
    n = 1
    while target.exists():
        target = RELEASES / f"{stamp}-{n}"
        n += 1

    shutil.copytree(DIST, target)
    (target / "RELEASE.json").write_text(
        "{\n"
        + f'  "exportedAt": "{stamp}",\n'
        + f'  "source": "dist"\n'
        + "}\n",
        encoding="utf-8",
    )

    current = RELEASES / "current"
    if current.is_symlink() or current.exists():
        current.unlink()
    try:
        current.symlink_to(target.name, target_is_directory=True)
    except OSError:
        # Fallback if symlink not allowed
        if current.exists():
            shutil.rmtree(current)
        shutil.copytree(target, current)

    print(f"snapshot: {target}")
    return target


def deploy(remote: str = "wald-mc", remote_web: str = "/data/windsage/web") -> None:
    env = os.environ.copy()
    # Cloud code without wiping remote web/
    run(
        [
            "rsync",
            "-av",
            "--delete",
            "--exclude",
            "data",
            "--exclude",
            "web",
            # Operator secrets on Wald — never wipe with --delete
            "--exclude",
            "oauth.env",
            "--exclude",
            "*.env",
            str(ROOT / "code" / "cloud") + "/",
            f"{remote}:/data/windsage/",
        ],
        env=env,
    )
    run(
        [
            "rsync",
            "-av",
            "--delete",
            str(DIST) + "/",
            f"{remote}:{remote_web}/",
        ],
        env=env,
    )
    run(
        [
            "ssh",
            remote,
            "sudo systemctl restart windsage && sleep 1 && systemctl is-active windsage && curl -sS http://127.0.0.1:8787/health",
        ],
        env=env,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-deploy",
        action="store_true",
        help="Export + snapshot + prune only (skip Wald deploy)",
    )
    parser.add_argument(
        "--prune-only",
        action="store_true",
        help="Only run cleanup on existing releases/web",
    )
    args = parser.parse_args()

    if args.prune_only:
        deleted = prune_versions()
        print(f"pruned {len(deleted)} version(s)")
        return 0

    path_bin = os.environ.get("PATH", "")
    node_bin = str(Path.home() / ".local" / "node" / "bin")
    if node_bin not in path_bin:
        os.environ["PATH"] = f"{node_bin}:{path_bin}"

    run(["npx", "expo", "export", "--platform", "web"])
    snapshot()
    deleted = prune_versions()
    print(f"pruned {len(deleted)} version(s)")

    if not args.no_deploy:
        deploy()
        print("deployed → https://windsage.nimrod.bio/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
