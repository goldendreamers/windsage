#!/usr/bin/env python3
"""Build the iOS/iPadOS install profile (home-screen web clip).

Tapping Install downloads this file. iOS then offers to add Windsage to the Home Screen.
Unsigned profiles finish in Settings → General → VPN & Device Management after the download.
"""

from __future__ import annotations

import base64
import plistlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICON = PUBLIC / "apple-touch-icon.png"
OUT = PUBLIC / "app" / "windsage.mobileconfig"

APP_URL = "https://windsage.nimrod.bio/"
# Stable IDs so a re-download replaces the same profile instead of stacking copies.
PROFILE_UUID = "a3c8d1e0-6b2f-4e91-9d44-1f7c0b8a5e21"
CLIP_UUID = "b14f9a77-2c8e-4d03-8f56-0e9a1c4d7b30"


def main() -> None:
    if not ICON.exists():
        raise SystemExit(f"missing icon: {ICON}")
    icon = ICON.read_bytes()
    clip = {
        "FullScreen": True,
        "IgnoreManifestScope": True,
        "IsRemovable": True,
        "Label": "Windsage",
        "PayloadDescription": "Adds Windsage to the Home Screen",
        "PayloadDisplayName": "Windsage",
        "PayloadIdentifier": "bio.nimrod.windsage.webclip",
        "PayloadType": "com.apple.webClip.managed",
        "PayloadUUID": CLIP_UUID,
        "PayloadVersion": 1,
        "Precomposed": True,
        "URL": APP_URL,
        "Icon": icon,
    }
    profile = {
        "PayloadContent": [clip],
        "PayloadDescription": "Installs the Windsage app on this iPhone or iPad.",
        "PayloadDisplayName": "Windsage",
        "PayloadIdentifier": "bio.nimrod.windsage",
        "PayloadOrganization": "Windsage",
        "PayloadRemovalDisallowed": False,
        "PayloadType": "Configuration",
        "PayloadUUID": PROFILE_UUID,
        "PayloadVersion": 1,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Apple installs from application/x-apple-aspen-config binary plists.
    xml = plistlib.dumps(profile, fmt=plistlib.FMT_XML)
    OUT.write_bytes(xml)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes) icon={len(base64.b64encode(icon))}B")


if __name__ == "__main__":
    main()
