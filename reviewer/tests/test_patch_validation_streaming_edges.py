"""Branch-complete regressions for bounded Git child-process streaming."""

from __future__ import annotations

import subprocess
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from noema_reviewer import patch_validation


class _FakeStdout:
    """Expose one deterministic descriptor and observable close state."""

    def __init__(self) -> None:
        """Initialize an open fake stdout pipe."""
        self.closed = False

    def fileno(self) -> int:
        """Return a stable descriptor number for monkeypatched reads."""
        return 91

    def close(self) -> None:
        """Record parent-side pipe closure."""
        self.closed = True


class _FakeProcess:
    """Model bounded poll, wait, terminate, kill, and stdout behavior."""

    def __init__(
        self,
        *,
        final_returncode: int = 0,
        stdout: Any | None = None,
    ) -> None:
        """Initialize one running process with configurable terminal status."""
        self.stdout = _FakeStdout() if stdout is None else stdout
        self.returncode: int | None = None
        self.final_returncode = final_returncode
        self.terminated = False
        self.killed = False
        self.wait_timeouts: list[float | None] = []

    def poll(self) -> int | None:
        """Return the current process state without changing it."""
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        """Complete the process and return its configured status."""
        self.wait_timeouts.append(timeout)
        self.returncode = self.final_returncode
        return self.returncode

    def terminate(self) -> None:
        """Record graceful termination and a signal-like status."""
        self.terminated = True
        self.returncode = -15

    def kill(self) -> None:
        """Record forced termination and a signal-like status."""
        self.killed = True
        self.returncode = -9


class _EscalatingProcess(_FakeProcess):
    """Require terminate-to-kill escalation on the first bounded wait."""

    def __init__(self) -> None:
        """Initialize one process that ignores graceful termination once."""
        super().__init__()
        self.wait_calls = 0

    def wait(self, timeout: float | None = None) -> int:
        """Time out once after terminate and complete after kill."""
        self.wait_timeouts.append(timeout)
        self.wait_calls += 1
        if self.wait_calls == 1:
            raise subprocess.TimeoutExpired("git", timeout)
        self.returncode = -9
        return self.returncode


def _tree_record(path: str = "fixture.txt") -> bytes:
    """Return one canonical NUL-terminated exact-tree blob record."""
    return f"100644 blob {'a' * 40} 1\t{path}\0".encode()


def _isolated_control(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Path:
    """Install one deterministic isolated-control factory for source checks."""
    control = tmp_path / "isolated-control"
    control.mkdir()
    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        lambda *_args, **_kwargs: control,
    )
    return control


def test_remaining_process_timeout_accepts_positive_and_rejects_expired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Shared process deadlines return positive time or raise deterministically."""
    monkeypatch.setattr(patch_validation.time, "monotonic", lambda: 10.0)
    assert patch_validation._remaining_process_timeout(15.0) == 5.0
    with pytest.raises(subprocess.TimeoutExpired):
        patch_validation._remaining_process_timeout(10.0)


def test_start_git_stream_uses_binary_isolated_process_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Git streaming starts without shell, stdin, stderr, or ambient config."""
    marker = object()
    observed: dict[str, Any] = {}

    def fake_popen(command, **kwargs):
        """Capture the exact process contract and return one marker."""
        observed["command"] = command
        observed["kwargs"] = kwargs
        return marker

    monkeypatch.setattr(patch_validation.subprocess, "Popen", fake_popen)

    assert patch_validation._start_git_stream(["git", "status"]) is marker
    assert observed["command"] == ["git", "status"]
    assert observed["kwargs"]["stdin"] is subprocess.DEVNULL
    assert observed["kwargs"]["stdout"] is subprocess.PIPE
    assert observed["kwargs"]["stderr"] is subprocess.DEVNULL
    assert observed["kwargs"]["shell"] is False
    assert observed["kwargs"]["close_fds"] is True
    assert observed["kwargs"]["env"]["GIT_CONFIG_NOSYSTEM"] == "1"


def test_read_git_stream_chunk_rejects_missing_stdout() -> None:
    """A child without the required stdout pipe fails closed."""
    process = SimpleNamespace(stdout=None)
    with pytest.raises(RuntimeError, match="stdout pipe is unavailable"):
        patch_validation._read_git_stream_chunk(
            process,
            1,
            time.monotonic() + 1,
        )


def test_read_git_stream_chunk_rejects_select_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A pipe that never becomes readable consumes no unbounded wait time."""
    process = _FakeProcess()
    monkeypatch.setattr(
        patch_validation.select,
        "select",
        lambda *_args, **_kwargs: ([], [], []),
    )
    with pytest.raises(subprocess.TimeoutExpired):
        patch_validation._read_git_stream_chunk(
            process,
            1,
            time.monotonic() + 1,
        )


def test_wait_git_stream_uses_remaining_deadline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Child waiting receives only the positive time left on the shared deadline."""
    process = _FakeProcess(final_returncode=7)
    monkeypatch.setattr(patch_validation.time, "monotonic", lambda: 4.0)
    assert patch_validation._wait_git_stream(process, 9.0) == 7
    assert process.wait_timeouts == [5.0]


def test_terminate_git_stream_skips_already_finished_process() -> None:
    """An already-finished child is not signalled again."""
    process = _FakeProcess()
    process.returncode = 0
    patch_validation._terminate_git_stream(process)
    assert not process.terminated
    assert not process.killed


def test_terminate_git_stream_completes_after_graceful_signal() -> None:
    """A cooperative child is terminated and boundedly reaped."""
    process = _FakeProcess()
    patch_validation._terminate_git_stream(process)
    assert process.terminated
    assert not process.killed
    assert process.wait_timeouts == [
        patch_validation.GIT_STREAM_TERMINATION_TIMEOUT_SECONDS
    ]


def test_terminate_git_stream_escalates_to_kill() -> None:
    """A child ignoring terminate is killed and reaped within fixed bounds."""
    process = _EscalatingProcess()
    patch_validation._terminate_git_stream(process)
    assert process.terminated
    assert process.killed
    assert process.wait_timeouts == [
        patch_validation.GIT_STREAM_TERMINATION_TIMEOUT_SECONDS,
        patch_validation.GIT_STREAM_TERMINATION_TIMEOUT_SECONDS,
    ]


def test_close_git_stream_handles_absent_and_optional_close() -> None:
    """Parent pipe cleanup tolerates absent processes, pipes, and close methods."""
    patch_validation._close_git_stream(None)
    patch_validation._close_git_stream(SimpleNamespace(stdout=None))
    patch_validation._close_git_stream(SimpleNamespace(stdout=object()))
    process = _FakeProcess()
    stdout = process.stdout
    patch_validation._close_git_stream(process)
    assert stdout.closed


def test_verify_source_head_wraps_control_creation_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unavailable authenticated objects cannot fall back to caller Git controls."""

    def fail_control(*_args, **_kwargs):
        """Emulate failure to construct isolated Git metadata."""
        raise RuntimeError("objects unavailable")

    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        fail_control,
    )
    with pytest.raises(RuntimeError, match="source HEAD could not be verified"):
        patch_validation._verify_source_head(
            tmp_path,
            "1" * 40,
            "directory",
        )


def test_verify_source_head_rejects_read_tree_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Failure to populate the exact-head index blocks status inspection."""
    _isolated_control(tmp_path, monkeypatch)
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1),
    )
    with pytest.raises(RuntimeError, match="does not match the exact validation request"):
        patch_validation._verify_source_head(
            tmp_path,
            "1" * 40,
            "directory",
        )


def test_verify_source_head_accepts_clean_zero_exit_stream(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty status stream and zero exit authenticate one clean exact head."""
    _isolated_control(tmp_path, monkeypatch)
    process = _FakeProcess()
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0),
    )
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: process,
    )
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: b"",
    )
    monkeypatch.setattr(
        patch_validation,
        "_wait_git_stream",
        lambda *_args, **_kwargs: 0,
    )

    patch_validation._verify_source_head(
        tmp_path,
        "1" * 40,
        "directory",
    )
    assert process.stdout.closed


def test_verify_source_head_wraps_stream_start_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An operating-system launch failure cannot authenticate a clean source."""
    _isolated_control(tmp_path, monkeypatch)
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0),
    )
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: (_ for _ in ()).throw(OSError("status unavailable")),
    )

    with pytest.raises(RuntimeError, match="source HEAD could not be verified"):
        patch_validation._verify_source_head(
            tmp_path,
            "1" * 40,
            "directory",
        )


@pytest.mark.parametrize(
    "failure",
    (
        OSError("status read failed"),
        subprocess.TimeoutExpired("git", 30),
    ),
)
def test_verify_source_head_terminates_stream_read_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure: BaseException,
) -> None:
    """A status read error terminates the child and fails exact-head verification."""
    _isolated_control(tmp_path, monkeypatch)
    process = _FakeProcess()
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=0),
    )
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: process,
    )

    def fail_read(*_args, **_kwargs):
        """Raise the configured status-stream failure."""
        raise failure

    monkeypatch.setattr(patch_validation, "_read_git_stream_chunk", fail_read)

    with pytest.raises(RuntimeError, match="source HEAD could not be verified"):
        patch_validation._verify_source_head(
            tmp_path,
            "1" * 40,
            "directory",
        )
    assert process.terminated
    assert process.stdout.closed


def test_exact_tree_record_rejects_record_byte_ceiling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One record is rejected before unbounded metadata or path decoding."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_TREE_RECORD_BYTES", 3)
    with pytest.raises(ValueError, match="record exceeds its byte limit"):
        patch_validation._validated_exact_tree_record(
            b"abcd",
            set(),
            0,
        )


@pytest.mark.parametrize(
    "record",
    (
        b"\xff\tpath",
        f"100644 blob {'a' * 40} 1\t".encode() + b"\xff",
    ),
)
def test_exact_tree_record_rejects_invalid_utf8(record: bytes) -> None:
    """Metadata and path bytes must decode as strict UTF-8."""
    with pytest.raises(ValueError, match="valid UTF-8"):
        patch_validation._validated_exact_tree_record(record, set(), 0)


def test_exact_tree_output_rejects_unencodable_text() -> None:
    """A surrogate-bearing compatibility input cannot become binary evidence."""
    with pytest.raises(ValueError, match="valid UTF-8"):
        patch_validation._validated_exact_tree_output("\ud800\0")


def test_exact_tree_output_rejects_aggregate_metadata_ceiling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Compatibility parsing enforces the same aggregate metadata byte bound."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_TREE_METADATA_BYTES", 1)
    with pytest.raises(ValueError, match="metadata exceeds its aggregate byte limit"):
        patch_validation._validated_exact_tree_output(
            _tree_record().decode(),
        )


def test_consume_exact_tree_stream_accepts_partial_records(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """NUL records split across bounded chunks are validated incrementally."""
    process = _FakeProcess()
    record = _tree_record()
    chunks = iter((record[:17], record[17:], b""))
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: next(chunks),
    )
    monkeypatch.setattr(
        patch_validation,
        "_wait_git_stream",
        lambda *_args, **_kwargs: 0,
    )
    patch_validation._consume_exact_tree_stream(
        process,
        time.monotonic() + 1,
    )


def test_consume_exact_tree_stream_rejects_unterminated_record_ceiling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A record without a delimiter cannot grow beyond its byte ceiling."""
    process = _FakeProcess()
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_TREE_RECORD_BYTES", 4)
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: b"12345",
    )
    with pytest.raises(ValueError, match="record exceeds its byte limit"):
        patch_validation._consume_exact_tree_stream(
            process,
            time.monotonic() + 1,
        )


def test_consume_exact_tree_stream_rejects_member_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Streaming validation stops as soon as the member ceiling is exceeded."""
    process = _FakeProcess()
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_ARCHIVE_MEMBERS", 1)
    chunks = iter((_tree_record("one.txt") + _tree_record("two.txt"), b""))
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: next(chunks),
    )
    with pytest.raises(ValueError, match="too many members"):
        patch_validation._consume_exact_tree_stream(
            process,
            time.monotonic() + 1,
        )


@pytest.mark.parametrize(
    "chunks",
    (
        (b"",),
        (b"truncated", b""),
    ),
)
def test_consume_exact_tree_stream_rejects_empty_or_truncated_output(
    monkeypatch: pytest.MonkeyPatch,
    chunks: tuple[bytes, ...],
) -> None:
    """An empty stream or final partial record is not admissible evidence."""
    process = _FakeProcess()
    values = iter(chunks)
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: next(values),
    )
    with pytest.raises(ValueError, match="empty or truncated"):
        patch_validation._consume_exact_tree_stream(
            process,
            time.monotonic() + 1,
        )


def test_consume_exact_tree_stream_rejects_nonzero_exit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Valid records from a failed Git child remain inadmissible."""
    process = _FakeProcess(final_returncode=1)
    chunks = iter((_tree_record(), b""))
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: next(chunks),
    )
    monkeypatch.setattr(
        patch_validation,
        "_wait_git_stream",
        lambda *_args, **_kwargs: 1,
    )
    with pytest.raises(RuntimeError, match="exact tree command failed"):
        patch_validation._consume_exact_tree_stream(
            process,
            time.monotonic() + 1,
        )


def test_verify_exact_tree_limits_accepts_valid_stream_and_closes_pipe(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A bounded valid exact-tree stream succeeds and closes parent stdout."""
    process = _FakeProcess()
    chunks = iter((_tree_record(), b""))
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: process,
    )
    monkeypatch.setattr(
        patch_validation,
        "_read_git_stream_chunk",
        lambda *_args, **_kwargs: next(chunks),
    )
    monkeypatch.setattr(
        patch_validation,
        "_wait_git_stream",
        lambda *_args, **_kwargs: 0,
    )

    patch_validation._verify_exact_tree_limits(tmp_path, "1" * 40)
    assert process.stdout.closed


def test_verify_exact_tree_limits_wraps_stream_timeout(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A timed-out exact-tree stream is terminated and fails closed."""
    process = _FakeProcess()
    monkeypatch.setattr(
        patch_validation,
        "_start_git_stream",
        lambda _command: process,
    )
    monkeypatch.setattr(
        patch_validation,
        "_consume_exact_tree_stream",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            subprocess.TimeoutExpired("git", 30)
        ),
    )

    with pytest.raises(RuntimeError, match="could not be inspected safely"):
        patch_validation._verify_exact_tree_limits(tmp_path, "1" * 40)
    assert process.terminated
    assert process.stdout.closed
