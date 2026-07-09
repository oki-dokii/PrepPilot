"""
Judge service — executes code via the Piston API (v1, no auth required).
Distinguishes compile errors from runtime errors and wrong answers.
"""
import httpx
import time
import logging
from typing import Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import TestCase, Verdict
from app.core.config import settings

logger = logging.getLogger(__name__)

# Piston v2 requires explicit versions
PISTON_VERSIONS = {
    "python3":    "3.10.0",
    "javascript": "18.15.0",
    "cpp":        "10.2.0",
    "java":       "15.0.2",
}

def _normalize_output(s: str) -> str:
    """Normalises output for comparison:
    - Collapses \r\n to \n
    - Strips trailing whitespace from every line
    - Removes trailing blank lines (end of file), but preserves internal blank lines
    """
    if not s:
        return ""
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in s.splitlines()]
    # Drop trailing empty lines only
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _outputs_match(actual: str, expected: str) -> bool:
    """
    Compare normalized outputs. Also tries float-tolerant comparison:
    if both sides are whitespace-separated numbers, compare with 1e-6 tolerance.
    """
    a = _normalize_output(actual)
    e = _normalize_output(expected)
    if a == e:
        return True
    # Try float-tolerant comparison on each line
    a_lines = a.splitlines()
    e_lines = e.splitlines()
    if len(a_lines) != len(e_lines):
        return False
    try:
        for al, el in zip(a_lines, e_lines):
            a_toks = al.split()
            e_toks = el.split()
            if len(a_toks) != len(e_toks):
                return False
            for at, et in zip(a_toks, e_toks):
                if at != et:
                    if abs(float(at) - float(et)) > 1e-6:
                        return False
        return True
    except (ValueError, TypeError):
        return False

SUPPORTED_LANGUAGES = {"python3", "javascript", "cpp", "java"}

def _is_compile_error(language: str, stderr: str) -> bool:
    if not stderr:
        return False
    if language == "python3":
        # All parse-time errors before user code runs
        return any(tag in stderr for tag in [
            "SyntaxError:", "IndentationError:", "TabError:",
        ])
    if language == "javascript":
        return "SyntaxError:" in stderr
    if language == "cpp":
        return "error:" in stderr or "cannot access 'a.out'" in stderr or "No such file" in stderr
    if language == "java":
        return "error:" in stderr and "Exception in thread" not in stderr
    return True

async def _run_code(
    code: str, language: str, test_input: str
) -> Tuple[str, str, bool, int]:
    """
    Runs code via Piston v2.
    Returns: (stdout, stderr, ran, runtime_ms)
    `ran` is False when compilation failed (C++/Java) or syntax error prevented execution.
    """
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                settings.PISTON_URL,
                json={
                    "language": language,
                    "version": PISTON_VERSIONS.get(language, "latest"),
                    "files": [{"content": code}],
                    "stdin": test_input,
                },
            )
            res.raise_for_status()
            data = res.json()
            
            run_result = data.get("run", {})
            stdout = run_result.get("stdout", "")
            stderr = run_result.get("stderr", "")
            exit_code = run_result.get("code", 0)
            
            runtime_ms = int((time.time() - start) * 1000)
            return stdout, stderr, (exit_code == 0), runtime_ms

    except httpx.TimeoutException:
        return "", "Time Limit Exceeded", True, 10000
    except Exception as e:
        logger.error(f"Execution Error: {e}")
        return "", f"Execution Error: {str(e)}", True, 0


async def run_custom_input(
    problem_id: str,
    code: str,
    language: str,
    custom_input: str,
    db: AsyncSession,
) -> Tuple[str, str, bool, int, Optional[str]]:
    """
    Executes code against a single custom input string.
    Returns: (stdout, stderr, ran, runtime_ms, error_output)
    """
    from app.models.models import Problem
    prob_result = await db.execute(select(Problem).where(Problem.id == problem_id))
    problem = prob_result.scalars().first()
    
    driver = None
    if problem:
        if problem.driver_code_dict and isinstance(problem.driver_code_dict, dict):
            driver = problem.driver_code_dict.get(language)
        if not driver and language == "python3":
            driver = problem.driver_code
    
    if driver:
        code = f"{code}\n\n{driver}"

    # Flatten custom input if it's JSON for standard problems
    if problem and problem.problem_style == "standard" and problem.input_schema:
        import json
        
        def _flatten_val(val, t):
            """Recursively flatten a JSON value to space-separated tokens matching boilerplate parser."""
            if t.startswith("list<list<"):
                inner_t = t[10:-2]
                res = [str(len(val))]
                for row in val:
                    res.append(str(len(row)))
                    for elem in row:
                        res.extend(_flatten_val(elem, inner_t))
                return res
            elif t.startswith("list<"):
                inner_t = t[5:-1]
                res = [str(len(val))]
                for elem in val:
                    res.extend(_flatten_val(elem, inner_t))
                return res
            elif t.startswith("pair<"):
                # pair stored as [a, b] in JSON
                return [str(val[0]), str(val[1])]
            elif t == "bool":
                return ["true" if val else "false"]
            else:
                return [str(val)]
                
        try:
            data = json.loads(custom_input)
            schema = problem.input_schema
            tokens = []
            # Handle multi-test: if first schema item is 'testcases', T is in data
            if schema and schema[0].get("type") == "testcases":
                test_blocks = data.get("tests", [data])  # fallback: single test
                tokens.append(str(len(test_blocks)))
                for block in test_blocks:
                    for item in schema[1:]:
                        val = block.get(item["name"])
                        if val is not None:
                            tokens.extend(_flatten_val(val, item["type"]))
            else:
                for item in schema:
                    val = data.get(item["name"])
                    if val is not None:
                        tokens.extend(_flatten_val(val, item["type"]))
            if tokens:
                custom_input = " ".join(tokens)
        except Exception:
            pass

    stdout, stderr, ran, runtime_ms = await _run_code(code, language, custom_input)
    
    error_output = None
    if not ran:
        error_output = stderr.strip() or "Compilation failed."
    elif "Time Limit Exceeded" in stderr:
        error_output = "Time Limit Exceeded"
    elif stderr and stderr.strip():
        error_output = stderr.strip()
        
    return stdout, stderr, ran, runtime_ms, error_output


async def run_against_hidden_tests(
    problem_id: str,
    code: str,
    language: str,
    db: AsyncSession,
    is_run: bool = False,
    is_validation: bool = False,
    update_expected_outputs: bool = False,
) -> Tuple[Verdict, int, int, int, Optional[str]]:
    """
    Returns: (verdict, runtime_ms, passed_count, total_count, error_output)
    error_output is the compiler/runtime message to show the user.
    """
    result = await db.execute(
        select(TestCase).where(TestCase.problem_id == problem_id)
    )
    test_cases = result.scalars().all()
    if is_run:
        test_cases = [tc for tc in test_cases if not tc.is_hidden]
    total = len(test_cases)

    if total == 0:
        # No test cases generated yet — treat as pending, not accepted
        return Verdict.runtime_error, 0, 0, 0, "No test cases available for this problem. Please try again."

    # Fetch problem to get driver_code
    from app.models.models import Problem
    prob_result = await db.execute(select(Problem).where(Problem.id == problem_id))
    problem = prob_result.scalars().first()
    
    driver = None
    if problem:
        if problem.driver_code_dict and isinstance(problem.driver_code_dict, dict):
            driver = problem.driver_code_dict.get(language)
        if not driver and language == "python3":
            driver = problem.driver_code
    
    if driver:
        # Append the driver code safely (with a couple of newlines in case user didn't leave one)
        code = f"{code}\n\n{driver}"

    max_runtime = 0
    passed = 0
    
    # Pre-parse schema if needed for standard style
    input_schema = problem.input_schema if problem else None
    
    def _flatten_input_for_standard(tc_input_str: str, schema: list) -> str:
        """Converts a JSON dict string into a flat space-separated string matching the boilerplate parser."""
        import json
        
        def _flatten_val(val, t):
            if t.startswith("list<list<"):
                inner_t = t[10:-2]
                res = [str(len(val))]
                for row in val:
                    res.append(str(len(row)))
                    for elem in row:
                        res.extend(_flatten_val(elem, inner_t))
                return res
            elif t.startswith("list<"):
                inner_t = t[5:-1]
                res = [str(len(val))]
                for elem in val:
                    res.extend(_flatten_val(elem, inner_t))
                return res
            elif t.startswith("pair<"):
                return [str(val[0]), str(val[1])]
            elif t == "bool":
                return ["true" if val else "false"]
            else:
                return [str(val)]

        try:
            data = json.loads(tc_input_str)
            tokens = []
            if schema and schema[0].get("type") == "testcases":
                test_blocks = data.get("tests", [data])
                tokens.append(str(len(test_blocks)))
                for block in test_blocks:
                    for item in schema[1:]:
                        val = block.get(item["name"])
                        if val is not None:
                            tokens.extend(_flatten_val(val, item["type"]))
            else:
                for item in schema:
                    val = data.get(item["name"])
                    if val is None:
                        continue
                    tokens.extend(_flatten_val(val, item["type"]))
            return " ".join(tokens)
        except Exception:
            return tc_input_str

    for i, tc in enumerate(test_cases):
        test_input_str = tc.input
        # Always flatten JSON→stdin tokens for standard style (both during validation and submission).
        # LeetCode style: driver_code handles its own deserialization, no flattening needed.
        if problem and problem.problem_style == "standard" and input_schema:
            test_input_str = _flatten_input_for_standard(tc.input, input_schema)
            
        stdout, stderr, ran, runtime = await _run_code(code, language, test_input_str)
        if runtime > max_runtime:
            max_runtime = runtime

        # Non-zero exit code (Piston sets ran=False if exit code != 0)
        if not ran:
            if _is_compile_error(language, stderr):
                return Verdict.compile_error, max_runtime, passed, total, stderr.strip() or "Compilation failed."
            else:
                return Verdict.runtime_error, max_runtime, passed, total, stderr.strip() or "Runtime Error."

        # TLE — check Piston's injected message AND common kill signals
        if "Time Limit Exceeded" in stderr or "Killed" in stderr or (runtime > 14000):
            return Verdict.time_limit, max_runtime, passed, total, None

        # Runtime error (non-empty stderr while ran=True)
        if stderr and stderr.strip():
            return Verdict.runtime_error, max_runtime, passed, total, stderr.strip()

        # Wrong answer
        actual   = _normalize_output(stdout)
        expected = _normalize_output(tc.expected_output)
        if not _outputs_match(stdout, tc.expected_output):
            # Only show diff for the visible (sample) test case to avoid spoilers
            if not tc.is_hidden:
                diff = f"Expected:\n{expected}\n\nGot:\n{actual or '(no output)'}"
                return Verdict.wrong_answer, max_runtime, passed, total, diff
            else:
                if update_expected_outputs:
                    # Only trust this output if stdout is non-empty (empty = likely buggy solution)
                    if stdout and stdout.strip():
                        tc.expected_output = stdout.strip()
                    else:
                        # Buggy solution produced empty output — skip overwrite
                        pass
                else:
                    diff = f"Failed on hidden test case #{i + 1}.\nExpected output did not match."
                    return Verdict.wrong_answer, max_runtime, passed, total, diff

        passed += 1

    if update_expected_outputs:
        await db.flush()

    return Verdict.accepted, max_runtime, passed, total, None
