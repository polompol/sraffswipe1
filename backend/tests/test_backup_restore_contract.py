"""Executable recovery contract for Stage 7.

The actual proof runs in PostgreSQL CI. These assertions prevent the recovery
step from silently becoming a no-op or drifting away from production's
SQL+gzip backup format.
"""
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "verify-backup-restore.sh"


def test_backup_restore_verifier_exists_and_is_fail_closed():
    assert SCRIPT.exists(), "Stage 7 needs an executable backup restore verifier"
    text = SCRIPT.read_text(encoding="utf-8")

    assert "set -euo pipefail" in text
    assert "pg_dump" in text
    assert "--clean" in text
    assert "--if-exists" in text
    assert "gzip -t" in text
    assert "createdb" in text
    assert "dropdb" in text
    assert "psql" in text
    assert "staffswipe_restore_sentinel" in text


def test_backup_restore_verifier_has_a_corrupt_archive_negative_check():
    assert SCRIPT.exists(), "Stage 7 needs an executable backup restore verifier"
    text = SCRIPT.read_text(encoding="utf-8")

    assert "corrupt" in text.lower()
    assert "must fail" in text.lower()
