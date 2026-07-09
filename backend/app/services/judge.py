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
    "java":       "java",
}

def _normalize_output(s: str) -> str:
    """Strips trailing/leading whitespace per line and ignores empty lines."""
    if not s: return ""
    lines = [line.strip() for line in s.splitlines()]
    return "\n".join(line for line in lines if line)

def _is_compile_error(language: str, stderr: str) -> bool:
    if not stderr:
        return False
    if language in ["python3", "javascript"]:
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
        return Verdict.accepted, 0, 0, 0, None

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
        if not is_validation and problem and problem.problem_style == "standard" and input_schema:
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
                return Verdict.wrong_answer, max_runtime, passed, total, diff
            else:
                if update_expected_outputs:
                    tc.expected_output = stdout.strip() if stdout else ""
                else:
                    diff = f"Failed on hidden test case #{i + 1}.\nExpected output did not match."
                    return Verdict.wrong_answer, max_runtime, passed, total, diff

        passed += 1

    if update_expected_outputs:
        await db.flush()

    return Verdict.accepted, max_runtime, passed, total, None
