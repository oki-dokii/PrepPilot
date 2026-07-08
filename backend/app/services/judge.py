"""
Judge service — executes code via the Piston API (v1, no auth required).
Distinguishes compile errors from runtime errors and wrong answers.
"""
import httpx
import time
from typing import Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import TestCase, Verdict

PISTON_URL = "https://emkc.org/api/v1/piston/execute"

LANGUAGE_MAP = {
    "python3":    "python3",
    "javascript": "node",
    "cpp":        "c++",
}

def _normalize_output(s: str) -> str:
    """Strips trailing/leading whitespace per line and ignores empty lines."""
    if not s: return ""
    lines = [line.strip() for line in s.splitlines()]
    return "\n".join(line for line in lines if line)


async def _run_code(
    code: str, language: str, test_input: str
) -> Tuple[str, str, bool, int]:
    """
    Runs code via Piston v1.
    Returns: (stdout, stderr, ran, runtime_ms)
    `ran` is False when compilation failed (C++/Java) or syntax error prevented execution.
    """
    piston_lang = LANGUAGE_MAP.get(language, "python3")
    payload = {
        "language": piston_lang,
        "source":   code,
        "stdin":    test_input,
    }

    start = time.time()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(PISTON_URL, json=payload, timeout=15.0)
        runtime_ms = int((time.time() - start) * 1000)

        if resp.status_code != 200:
            return "", f"Code execution service returned {resp.status_code}. Try again in a moment.", False, runtime_ms

        data = resp.json()
        stdout = data.get("stdout", "") or ""
        stderr = data.get("stderr", "") or ""
        ran    = data.get("ran", True)
        return stdout, stderr, ran, runtime_ms

    except httpx.TimeoutException:
        return "", "Time Limit Exceeded", True, 10000
    except Exception as e:
        return "", f"Execution Error: {str(e)}", True, 0


async def run_against_hidden_tests(
    problem_id: str,
    code: str,
    language: str,
    db: AsyncSession,
) -> Tuple[Verdict, int, int, int, Optional[str]]:
    """
    Returns: (verdict, runtime_ms, passed_count, total_count, error_output)
    error_output is the compiler/runtime message to show the user.
    """
    result = await db.execute(
        select(TestCase).where(TestCase.problem_id == problem_id)
    )
    test_cases = result.scalars().all()
    total = len(test_cases)

    if total == 0:
        return Verdict.accepted, 0, 0, 0, None

    max_runtime = 0
    passed = 0

    for i, tc in enumerate(test_cases):
        stdout, stderr, ran, runtime = await _run_code(code, language, tc.input)
        if runtime > max_runtime:
            max_runtime = runtime

        # Compile error — code never ran at all
        if not ran:
            return Verdict.compile_error, max_runtime, passed, total, stderr.strip() or "Compilation failed."

        # TLE
        if "Time Limit Exceeded" in stderr:
            return Verdict.time_limit, max_runtime, passed, total, None

        # Runtime error (non-empty stderr while ran=True)
        if stderr and stderr.strip():
            return Verdict.runtime_error, max_runtime, passed, total, stderr.strip()

        # Wrong answer
        actual   = _normalize_output(stdout)
        expected = _normalize_output(tc.expected_output)
        if actual != expected:
            # Only show diff for the visible (sample) test case to avoid spoilers
            if not tc.is_hidden:
                diff = f"Expected:\n{expected}\n\nGot:\n{actual or '(no output)'}"
            else:
                diff = f"Failed on hidden test case #{i + 1}.\nExpected output did not match."
            return Verdict.wrong_answer, max_runtime, passed, total, diff

        passed += 1

    return Verdict.accepted, max_runtime, passed, total, None
