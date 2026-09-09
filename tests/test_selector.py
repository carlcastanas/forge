"""Tests for provider-selection compute guidance."""

import importlib.util
import re
from pathlib import Path

SELECTOR_PATH = Path(__file__).parents[1] / "src" / "llm" / "cli" / "selector.py"
SPEC = importlib.util.spec_from_file_location("forge_selector", SELECTOR_PATH)
assert SPEC is not None and SPEC.loader is not None
SELECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SELECTOR)
print_self_host_compute_notice = SELECTOR.print_self_host_compute_notice

URL_TOKEN_PATTERN = re.compile(r"https?://[^\s<>\"'`()\[\]{}\\]+")


def test_self_host_notice_names_no_provider_and_links_nowhere():
    """The notice must stay vendor-neutral and must not route anyone off-box."""
    import contextlib
    import io

    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        print_self_host_compute_notice("ollama")
    output = buffer.getvalue()

    assert "Any GPU provider works" in output
    assert "does not endorse, broker, reserve, or provision compute" in output
    assert "does not configure serving" in output
    assert URL_TOKEN_PATTERN.findall(output) == []
    for banned in ("sponsor", "RFQ", "ito"):
        assert banned.lower() not in output.lower()


def test_managed_provider_does_not_show_self_host_compute_notice(capsys):
    print_self_host_compute_notice("openai")

    assert capsys.readouterr().out == ""
