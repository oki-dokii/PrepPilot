"""
LLM service — Google Gemini API for test generation and feedback.
Falls back to rich stubs when GEMINI_API_KEY is not configured.
"""
import json
import random
import logging
import re
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import MCQ, Problem, DifficultyEnum, TestCase
from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Stub data ───────────────────────────────────────────────────────────────

STUB_MCQS = {
    "Arrays": [
        {"question": "What is the time complexity of accessing an element in an array by index?",
         "options": {"A": "O(1)", "B": "O(n)", "C": "O(log n)", "D": "O(n²)"},
         "correct_option": "A",
         "explanation": "Arrays store elements contiguously in memory, so index-based access is always O(1)."},
        {"question": "Which algorithm finds the maximum subarray sum in O(n)?",
         "options": {"A": "Merge Sort", "B": "Kadane's Algorithm", "C": "Floyd-Warshall", "D": "Dijkstra"},
         "correct_option": "B",
         "explanation": "Kadane's algorithm tracks a running maximum in a single pass — O(n) time, O(1) space."},
        {"question": "What does a sliding window technique primarily optimize?",
         "options": {"A": "Sorting a subarray", "B": "Contiguous subarray/substring problems",
                     "C": "Graph traversal", "D": "DP recurrences"},
         "correct_option": "B",
         "explanation": "Sliding window avoids recomputation by maintaining a window with two moving pointers."},
    ],
    "Graphs": [
        {"question": "What data structure does BFS use internally?",
         "options": {"A": "Stack", "B": "Priority Queue", "C": "Queue", "D": "Deque"},
         "correct_option": "C",
         "explanation": "BFS explores nodes level-by-level using a FIFO queue."},
        {"question": "Which algorithm detects a negative weight cycle?",
         "options": {"A": "Dijkstra", "B": "Prim's", "C": "Bellman-Ford", "D": "Kruskal's"},
         "correct_option": "C",
         "explanation": "Bellman-Ford detects negative cycles by checking for relaxation updates after V-1 iterations."},
        {"question": "Space complexity of an adjacency list graph representation?",
         "options": {"A": "O(V²)", "B": "O(V + E)", "C": "O(E²)", "D": "O(V)"},
         "correct_option": "B",
         "explanation": "Adjacency list stores V vertices and their E edges — total O(V + E)."},
    ],
    "Dynamic Programming": [
        {"question": "What is memoization?",
         "options": {"A": "Sorting subproblems", "B": "Caching results of expensive function calls",
                     "C": "Recursive divide-and-conquer", "D": "Bottom-up DP"},
         "correct_option": "B",
         "explanation": "Memoization stores results of subproblems to avoid recomputation (top-down DP)."},
        {"question": "Which problem is NOT typically solved with DP?",
         "options": {"A": "Longest Common Subsequence", "B": "Shortest path (no negative cycles)",
                     "C": "Topological Sort", "D": "0/1 Knapsack"},
         "correct_option": "C",
         "explanation": "Topological sort is a graph ordering problem solved with DFS/Kahn's algorithm, not DP."},
        {"question": "What does 'optimal substructure' mean?",
         "options": {"A": "Every subproblem has a unique solution",
                     "B": "An optimal solution contains optimal solutions to subproblems",
                     "C": "Subproblems overlap perfectly", "D": "The problem can be solved greedily"},
         "correct_option": "B",
         "explanation": "Optimal substructure means the global optimum is built from optimal solutions to smaller subproblems."},
    ],
    "Trees": [
        {"question": "What is the height of a balanced binary tree with n nodes?",
         "options": {"A": "O(n)", "B": "O(log n)", "C": "O(n log n)", "D": "O(1)"},
         "correct_option": "B",
         "explanation": "A balanced binary tree halves the remaining nodes at each level, giving O(log n) height."},
        {"question": "In-order traversal of a BST produces?",
         "options": {"A": "A random ordering", "B": "Nodes in reverse sorted order",
                     "C": "Nodes in sorted ascending order", "D": "Nodes by level"},
         "correct_option": "C",
         "explanation": "In-order traversal (left → root → right) visits BST nodes in ascending key order."},
        {"question": "What distinguishes a complete binary tree from a full binary tree?",
         "options": {"A": "Complete has all leaves at the same level",
                     "B": "Complete fills levels left to right; full means every node has 0 or 2 children",
                     "C": "Full has all leaves at the same level",
                     "D": "There is no difference"},
         "correct_option": "B",
         "explanation": "Complete BT fills each level left-to-right; full BT requires every node to have 0 or 2 children."},
    ],
    "Binary Search": [
        {"question": "What is the time complexity of binary search?",
         "options": {"A": "O(n)", "B": "O(n log n)", "C": "O(log n)", "D": "O(1)"},
         "correct_option": "C",
         "explanation": "Binary search halves the search space each iteration — O(log n) comparisons."},
        {"question": "Binary search requires the input array to be?",
         "options": {"A": "Unsorted", "B": "Sorted", "C": "Distinct elements", "D": "Non-negative"},
         "correct_option": "B",
         "explanation": "Binary search depends on the monotonic property — elements must be sorted."},
        {"question": "Which is a common off-by-one bug in binary search?",
         "options": {"A": "Using mid = (lo + hi) // 2 instead of mid = lo + (hi - lo) // 2",
                     "B": "Returning mid instead of lo",
                     "C": "Using hi = mid instead of hi = mid - 1",
                     "D": "Initialising lo = 1 instead of 0"},
         "correct_option": "C",
         "explanation": "When the target is to the left of mid, setting hi = mid instead of hi = mid - 1 can cause infinite loops."},
    ],
}

STUB_PROBLEMS = {
    "Arrays": [
        {"title": "Maximum Subarray Sum",
         "statement": "## Maximum Subarray Sum\n\nGiven an integer array `nums`, find the contiguous subarray with the largest sum and return its sum.\n\n**Example 1:**\n```\nInput:  [-2,1,-3,4,-1,2,1,-5,4]\nOutput: 6\nExplanation: [4,-1,2,1] has the largest sum = 6.\n```\n**Example 2:**\n```\nInput:  [5,4,-1,7,8]\nOutput: 23\n```",
         "constraints": "- `1 <= nums.length <= 10^5`\n- `-10^4 <= nums[i] <= 10^4`",
         "sample_input": "[-2,1,-3,4,-1,2,1,-5,4]", "sample_output": "6",
         "difficulty": "medium", "topic_tags": ["arrays", "dynamic programming"],
         "test_cases": [
             {"input": "[-2,1,-3,4,-1,2,1,-5,4]", "expected": "6",    "category": "sample",      "is_hidden": False},
             {"input": "[5,4,-1,7,8]",             "expected": "23",   "category": "sample",      "is_hidden": False},
             {"input": "[1]",                       "expected": "1",    "category": "boundary",    "is_hidden": True},
             {"input": "[-1]",                      "expected": "-1",   "category": "boundary",    "is_hidden": True},
             {"input": "[10000]",                   "expected": "10000","category": "boundary",    "is_hidden": True},
             {"input": "[-2,-1]",                   "expected": "-1",   "category": "structural",  "is_hidden": True},
             {"input": "[-3,-3,-3,-3]",             "expected": "-3",   "category": "structural",  "is_hidden": True},
             {"input": "[1,2,3,4,5]",               "expected": "15",   "category": "structural",  "is_hidden": True},
             {"input": "[-1,-2,3,-1,-2,3]",         "expected": "3",    "category": "adversarial", "is_hidden": True},
             {"input": "[2,-1,2,-1,2]",             "expected": "4",    "category": "adversarial", "is_hidden": True},
             {"input": "[0,0,0,0,0]",               "expected": "0",    "category": "random",      "is_hidden": True},
             {"input": "[-5,8,-3,6,-2,9,-7,4]",    "expected": "18",   "category": "random",      "is_hidden": True},
         ]},
    ],
    "Graphs": [
        {"title": "Number of Connected Components",
         "statement": "## Number of Connected Components\n\nYou are given an undirected graph with `n` nodes and a list of `edges`. Return the number of connected components.\n\n**Example 1:**\n```\nInput:  n=5, edges=[[0,1],[1,2],[3,4]]\nOutput: 2\n```\n**Example 2:**\n```\nInput:  n=5, edges=[[0,1],[1,2],[2,3],[3,4]]\nOutput: 1\n```",
         "constraints": "- `1 <= n <= 2000`\n- `0 <= edges.length <= 5000`",
         "sample_input": "5\n[[0,1],[1,2],[3,4]]", "sample_output": "2",
         "difficulty": "medium", "topic_tags": ["graphs", "union-find", "dfs"],
         "test_cases": [
             {"input": "5\n[[0,1],[1,2],[3,4]]",          "expected": "2",    "category": "sample",      "is_hidden": False},
             {"input": "5\n[[0,1],[1,2],[2,3],[3,4]]",    "expected": "1",    "category": "sample",      "is_hidden": False},
             {"input": "1\n[]",                           "expected": "1",    "category": "boundary",    "is_hidden": True},
             {"input": "2000\n[]",                        "expected": "2000", "category": "boundary",    "is_hidden": True},
             {"input": "2\n[[0,1]]",                      "expected": "1",    "category": "boundary",    "is_hidden": True},
             {"input": "5\n[]",                           "expected": "5",    "category": "structural",  "is_hidden": True},
             {"input": "4\n[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]","expected": "1","category": "structural","is_hidden": True},
             {"input": "6\n[[0,1],[2,3],[4,5]]",          "expected": "3",    "category": "structural",  "is_hidden": True},
             {"input": "4\n[[0,1],[1,0],[2,3],[3,2]]",    "expected": "2",    "category": "adversarial", "is_hidden": True},
             {"input": "3\n[[0,1],[1,2],[2,0]]",          "expected": "1",    "category": "adversarial", "is_hidden": True},
             {"input": "7\n[[0,1],[2,3],[4,5],[0,2]]",    "expected": "3",    "category": "random",      "is_hidden": True},
             {"input": "5\n[[1,2],[2,3],[0,4]]",          "expected": "2",    "category": "random",      "is_hidden": True},
         ]},
    ],
    "Dynamic Programming": [
        {"title": "Climbing Stairs",
         "statement": "## Climbing Stairs\n\nYou are climbing a staircase with `n` steps. Each time you can climb 1 or 2 steps. In how many distinct ways can you reach the top?\n\n**Example 1:**\n```\nInput:  3\nOutput: 3\nExplanation: 1+1+1, 1+2, 2+1\n```\n**Example 2:**\n```\nInput:  4\nOutput: 5\n```",
         "constraints": "- `1 <= n <= 45`",
         "sample_input": "3", "sample_output": "3",
         "difficulty": "easy", "topic_tags": ["dynamic programming"],
         "test_cases": [
             {"input": "3",  "expected": "3",          "category": "sample",      "is_hidden": False},
             {"input": "4",  "expected": "5",          "category": "sample",      "is_hidden": False},
             {"input": "1",  "expected": "1",          "category": "boundary",    "is_hidden": True},
             {"input": "2",  "expected": "2",          "category": "boundary",    "is_hidden": True},
             {"input": "45", "expected": "1836311903", "category": "boundary",    "is_hidden": True},
             {"input": "5",  "expected": "8",          "category": "structural",  "is_hidden": True},
             {"input": "6",  "expected": "13",         "category": "structural",  "is_hidden": True},
             {"input": "7",  "expected": "21",         "category": "structural",  "is_hidden": True},
             {"input": "10", "expected": "89",         "category": "adversarial", "is_hidden": True},
             {"input": "20", "expected": "10946",      "category": "adversarial", "is_hidden": True},
             {"input": "30", "expected": "1346269",    "category": "random",      "is_hidden": True},
             {"input": "40", "expected": "165580141",  "category": "performance", "is_hidden": True},
         ]},
    ],
    "Trees": [
        {"title": "Maximum Depth of Binary Tree",
         "statement": "## Maximum Depth of Binary Tree\n\nGiven the `root` of a binary tree, return its **maximum depth**.\n\n**Example 1:**\n```\nInput:  [3,9,20,null,null,15,7]\nOutput: 3\n```\n**Example 2:**\n```\nInput:  [1,null,2]\nOutput: 2\n```",
         "constraints": "- Number of nodes in `[0, 10^4]`\n- `-100 <= Node.val <= 100`",
         "sample_input": "[3,9,20,null,null,15,7]", "sample_output": "3",
         "difficulty": "easy", "topic_tags": ["trees", "dfs"],
         "test_cases": [
             {"input": "[3,9,20,null,null,15,7]",                   "expected": "3",  "category": "sample",      "is_hidden": False},
             {"input": "[1,null,2]",                                 "expected": "2",  "category": "sample",      "is_hidden": False},
             {"input": "[]",                                         "expected": "0",  "category": "boundary",    "is_hidden": True},
             {"input": "[1]",                                        "expected": "1",  "category": "boundary",    "is_hidden": True},
             {"input": "[1,2,3,4,5,6,7]",                           "expected": "3",  "category": "structural",  "is_hidden": True},
             {"input": "[1,2,null,3,null,4,null]",                  "expected": "4",  "category": "structural",  "is_hidden": True},
             {"input": "[1,null,2,null,3,null,4]",                  "expected": "4",  "category": "structural",  "is_hidden": True},
             {"input": "[1,2,3]",                                    "expected": "2",  "category": "structural",  "is_hidden": True},
             {"input": "[1,2,null,3,4,null,null,5]",                "expected": "4",  "category": "adversarial", "is_hidden": True},
             {"input": "[5,4,8,11,null,13,4,7,2,null,null,null,1]","expected": "4",  "category": "adversarial", "is_hidden": True},
             {"input": "[1,2,3,4,null,null,5]",                     "expected": "3",  "category": "random",      "is_hidden": True},
             {"input": "[0,-1,1,-2,null,null,2]",                   "expected": "3",  "category": "random",      "is_hidden": True},
         ]},
    ],
    "Binary Search": [
        {"title": "Search in Rotated Sorted Array",
         "statement": "## Search in Rotated Sorted Array\n\nA sorted integer array `nums` with distinct values has been rotated at some unknown pivot. Given `nums` and a `target`, return the index of `target`, or `-1` if not found.\n\n**Example 1:**\n```\nInput:  nums=[4,5,6,7,0,1,2], target=0\nOutput: 4\n```\n**Example 2:**\n```\nInput:  nums=[4,5,6,7,0,1,2], target=3\nOutput: -1\n```",
         "constraints": "- `1 <= nums.length <= 5000`\n- All values are distinct\n- `-10^4 <= nums[i], target <= 10^4`",
         "sample_input": "[4,5,6,7,0,1,2]\n0", "sample_output": "4",
         "difficulty": "medium", "topic_tags": ["binary search", "arrays"],
         "test_cases": [
             {"input": "[4,5,6,7,0,1,2]\n0",    "expected": "4",  "category": "sample",      "is_hidden": False},
             {"input": "[4,5,6,7,0,1,2]\n3",    "expected": "-1", "category": "sample",      "is_hidden": False},
             {"input": "[1]\n0",                 "expected": "-1", "category": "boundary",    "is_hidden": True},
             {"input": "[1]\n1",                 "expected": "0",  "category": "boundary",    "is_hidden": True},
             {"input": "[2,1]\n1",               "expected": "1",  "category": "boundary",    "is_hidden": True},
             {"input": "[1,3]\n3",               "expected": "1",  "category": "structural",  "is_hidden": True},
             {"input": "[3,1,2]\n1",             "expected": "1",  "category": "structural",  "is_hidden": True},
             {"input": "[5,6,7,0,1,2,3]\n5",    "expected": "0",  "category": "structural",  "is_hidden": True},
             {"input": "[6,7,0,1,2,3,4]\n0",    "expected": "2",  "category": "adversarial", "is_hidden": True},
             {"input": "[7,0,1,2,3,4,5]\n5",    "expected": "6",  "category": "adversarial", "is_hidden": True},
             {"input": "[4,5,6,7,8,1,2,3]\n8",  "expected": "4",  "category": "random",      "is_hidden": True},
             {"input": "[2,3,4,5,6,7,8,9,10,0,1]\n6","expected": "4","category": "performance","is_hidden": True},
         ]},
    ],
}

# ─── JSON parsing helpers ────────────────────────────────────────────────────

def _safe_parse_json(raw: str) -> dict | list:
    """
    Robustly parse LLM JSON output:
    1. Try direct parse (handles perfect output from Groq json_object mode).
    2. Extract from code fences using regex (handles wrapped JSON).
    3. Apply trailing-comma cleanup ONLY if both above fail, to avoid
       corrupting JSON string values that happen to contain ', }' or ', ]'.
    """
    text = raw.strip()

    # Step 1: try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Step 2: extract from code fence
    m = re.search(r'```(?:json)?\s*\n?(.*?)```', text, re.DOTALL)
    if m:
        inner = m.group(1).strip()
        try:
            return json.loads(inner)
        except json.JSONDecodeError:
            text = inner  # fall through with extracted text

    # Step 3: trailing-comma cleanup as last resort (risky — only on failure)
    cleaned = re.sub(r',(\s*[}\]])', r'\1', text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Could not parse LLM JSON after all attempts: {e}\nRaw (first 300): {raw[:300]}")


# ─── LLM client ────────────────────────────────────────────────────────────

async def _call_llm(prompt: str, is_json: bool = True) -> str:
    """Call Groq or Gemini API and return the text response."""
    if settings.GROQ_API_KEY:
        from groq import AsyncGroq
        try:
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            kwargs = {
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.7,
            }
            if is_json:
                kwargs["response_format"] = {"type": "json_object"}
                
            chat_completion = await client.chat.completions.create(**kwargs)
            return chat_completion.choices[0].message.content
        except Exception as e:
            logger.warning(f"Groq API failed: {e}. Falling back to Gemini...")
            if not settings.GEMINI_API_KEY:
                raise e

    if settings.GEMINI_API_KEY:
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name="gemini-2.0-flash-lite",
            generation_config={
                "temperature": 0.7,
                "response_mime_type": "application/json" if is_json else "text/plain",
            },
        )
        response = model.generate_content(prompt)
        return response.text
    
    raise ValueError("No API key available for LLM generation")


async def _generate_mcqs_with_gemini(topic: str, difficulty: str, count: int, style: str | None) -> list[dict]:
    style_hint = f" in the style of {style} interviews" if style else ""

    prompt = f"""Generate {count} multiple-choice questions about {topic}{style_hint} at {difficulty} difficulty for a coding interview prep platform.

Return a JSON array (no markdown fences) of objects with this exact schema:
[
  {{
    "_thought_process": "1-2 sentences of reasoning about the core concept and how to create a tricky, non-obvious scenario.",
    "question": "string",
    "options": {{"A": "string", "B": "string", "C": "string", "D": "string"}},
    "correct_option": "A",
    "explanation": "2-3 sentences explaining why the answer is correct and why the others are wrong"
  }}
]

Requirements:
- Questions must test genuine understanding of {topic}, not trivia
- Distractors must be plausible (target common misconceptions)
- Difficulty {difficulty}: {"basic concept recall" if difficulty == "easy" else "deep trade-offs and edge cases" if difficulty == "hard" else "applied problem-solving"}
- Focus on: time complexity, algorithm design, data structure selection, edge cases"""

    raw = await _call_llm(prompt)
    return _safe_parse_json(raw)


async def _generate_problem_with_gemini(topic: str, difficulty: str, style: str | None) -> dict:
    style_hint = f" inspired by {style} OA style" if style else ""
    prompt = f"""Create a coding problem about {topic}{style_hint} at {difficulty} difficulty for a coding interview prep platform.

IMPORTANT: You MUST invent a highly-detailed NOVEL real-world scenario (e.g., autonomous vehicle routing, satellite telemetry, genomics pipeline, logistics optimization, financial clearing). Do NOT use LeetCode problem names verbatim. 
The `title` MUST reflect this scenario (e.g., "Logistics Fleet Routing" instead of "Shortest Path in Graph"). 
The `statement` MUST NEVER sound like a generic algorithm puzzle (do not use "Given an array of integers"). Wrap the core algorithmic challenge completely inside the business logic or engineering context.
RULES:
1. Return ONLY a valid JSON object. No markdown fences.
2. ALL newlines inside string values MUST be escaped as \\n.
3. Make sure all problem conditions are mathematically rigorous and unambiguous. Never leave key constraints open to interpretation.
4. The statement MUST include a clear 'Input Format', 'Output Format', and AT LEAST 2 sample examples with step-by-step logical explanations.
5. You MUST include a `_thought_process` field first to brainstorm the scenario, constraints, and tricky edge cases before writing the problem.

{{
  "_thought_process": "string (brainstorming the scenario, constraints, and tricky edge cases)",
  "title": "string",
  "statement": "string (markdown with Input/Output format, and at least 2 Examples with step-by-step explanations)",
  "constraints": "string (markdown bullet list)",
  "sample_input": "string",
  "sample_output": "string",
  "official_solution": "string (python3 code that correctly solves the problem)",
  "starter_code": {"python3": "string", "cpp": "string", "java": "string", "javascript": "string"},
  "driver_code": {"python3": "string", "cpp": "string", "java": "string", "javascript": "string"},
  "difficulty": "{difficulty}",
  "topic_tags": ["string"],
  "test_cases": [
    {{"input": "string", "expected": "string", "category": "sample|boundary|structural|adversarial|performance|random", "is_hidden": false}}
  ]
}}

TEST CASE REQUIREMENTS — MUST have AT LEAST 12 cases covering ALL categories:

1. sample (2, is_hidden: false) — Small, readable, hand-verifiable. Shown to candidate.
2. boundary (3, is_hidden: true)
   - n=1 (single element / single node)
   - n at maximum constraint
   - Empty/zero/null input where applicable
3. structural (3, is_hidden: true) — Problem-specific edges:
   - Arrays: all identical elements, fully sorted, reverse sorted, all negatives
   - Graphs: disconnected graph, single node, fully connected
   - Trees: degenerate linear chain, perfectly balanced
   - Strings: all same chars, palindrome, single char
4. adversarial (2, is_hidden: true)
   - Breaks brute-force O(n²) approach for {topic}
   - Tests off-by-one / fencepost / integer overflow
5. performance (1, is_hidden: true)
   - n at/near max constraint (e.g. n=10^5 or 10^6)
   - Naive O(n²) TLEs; efficient O(n log n) or O(n) passes
   - Use compact representation, not a literal large array
6. random (2+, is_hidden: true) — General random coverage"""


    raw = await _call_llm(prompt)
    return _safe_parse_json(raw)


async def generate_full_test_with_gemini(blueprint: list, style: str | None = None) -> dict:
    """
    Generate the ENTIRE test in ONE single Gemini API call.
    blueprint: list of {type, topic, difficulty}
    Returns: {"mcqs": [...], "problems": [...]} matching blueprint order.
    """
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)

    style_hint = ""
    if style == "leetcode":
        style_hint = " You MUST use the 'leetcode' coding interview style (user writes a class/function, you write the driver code). Set problem_style='leetcode'."
    elif style == "standard":
        style_hint = " You MUST use the 'standard' Codeforces/HackerRank style (user reads from stdin, prints to stdout). Set problem_style='standard'."
    else:
        style_hint = " You MUST use the 'standard' Codeforces/HackerRank style (read from stdin, print to stdout)."

    mcq_items = [i for i in blueprint if i.get("type") == "mcq"]
    coding_items = [i for i in blueprint if i.get("type") == "coding"]

    mcq_spec = "\n".join(
        f"  MCQ {i+1}: topic={item['topic']}, difficulty={item['difficulty']}"
        for i, item in enumerate(mcq_items)
    )
    coding_spec = "\n".join(
        f"  Problem {i+1}: topic={item['topic']}, difficulty={item['difficulty']}"
        for i, item in enumerate(coding_items)
    )

    prompt = f"""You are a senior technical interview question generator{style_hint}.
Generate a full interview test based on the following blueprint.

MCQs to generate ({len(mcq_items)} total):
{mcq_spec if mcq_spec else "  None"}

Coding Problems to generate ({len(coding_items)} total):
{coding_spec if coding_spec else "  None"}

═══ GENERAL RULES ═══
- Every question must be UNIQUE. Do NOT use classic textbook questions ("What is memoization?", "What is a pointer?", etc.)
- For MCQs: test APPLIED understanding — scenario-based, trade-off analysis, subtle edge cases. Never simple definitions.
- For Coding Problems: You MUST invent a highly-detailed NOVEL real-world scenario (e.g., autonomous vehicles, satellite telemetry, genomics pipeline, logistics routing, financial clearing). 
- For Coding Problems: The `title` MUST reflect the scenario (e.g., 'Logistics Fleet Routing' instead of 'Shortest Path in Graph'). 
- For Coding Problems: The `statement` MUST NEVER sound like a generic algorithm puzzle (do not use "Given an array of integers"). Wrap the core algorithm completely in the business logic or engineering context.
- For Coding Problems: Make sure all problem conditions are mathematically rigorous and unambiguous. Never leave key constraints open to interpretation. The statement MUST include a clear 'Input Format', 'Output Format', and AT LEAST 2 sample examples with step-by-step logical explanations.
- ALL string values must escape newlines as \\n. No raw multiline strings.
- Return ONLY valid JSON. No markdown fences.

═══ INPUT SCHEMA TYPE GUIDE (STANDARD STYLE) ═══
The boilerplate generator will produce parsers for ALL these types. Use the right type to produce correct problems:

  PRIMITIVES (read as single token from stdin):
    int, long     → integer (use long for values > 2^31 or involving large products)
    float, double → decimal number
    bool          → "true"/"false" token
    char          → single character token
    string        → single whitespace-delimited token

  1-D ARRAYS (stdin: N followed by N elements):
    list<int>, list<long>, list<float>, list<double>, list<string>, list<bool>
    IMPORTANT: The boilerplate automatically reads the size N. DO NOT add 'N' as a separate variable in input_schema. But the raw text in testcases MUST include N before the elements.

  2-D ARRAYS / GRIDS / MATRICES (stdin: R followed by R rows each with C then C elements):
    list<list<int>>, list<list<long>>, list<list<float>>, list<list<string>>
    IMPORTANT: The boilerplate automatically reads R and C. DO NOT add 'R' or 'C' as separate variables in input_schema. Raw text in testcases MUST include R and C correctly.

  PAIRS (stdin: first second as two consecutive tokens):
    pair<int,int>, pair<long,long>, pair<int,string>
    Use for: weighted edges, coordinate pairs, (key,value) inputs.

  MULTI-TEST-CASE (stdin: T followed by T repetitions of the rest):
    Use {{ "name": "T", "type": "testcases" }} as the FIRST schema item.
    The remaining schema items describe ONE test-case block (repeated T times).
    Use for: classic competitive programming problems with multiple test cases.

  COMMON DSA PATTERNS:
    - Graph (N nodes, M edges, edge list): n:int, m:int, edges:list<list<int>>  (each sub-list [u,v] or [u,v,w])
    - Tree (N nodes, parent array): parent:list<int>
    - Strings: s:string  (single token; if multiple words, use list<string> + join in code)
    - Binary search: arr:list<int>, target:int
    - DP on matrix: grid:list<list<int>>
    - Interval scheduling: intervals:list<list<int>>  (each [start,end])

  FOR LEETCODE STYLE: input_schema is only informational metadata.
    The driver_code handles all deserialization (TreeNode, ListNode, etc.).

═══ TEST CASE REQUIREMENTS (CRITICAL) ═══
Each coding problem MUST have AT LEAST 12 test cases total, covering ALL of the following categories:

1. sample (2 cases, is_hidden: false)
   — Small, readable, hand-verifiable. These are shown to the candidate.

2. boundary (3 cases, is_hidden: true)
   — Empty/null input, single element, minimum/maximum constraint values (n=1, n=max).

3. The coding problems MUST have EXACTLY 2 test cases. These will be the visible sample cases (is_hidden: false). Do NOT generate any hidden test cases here. They will be generated in a separate pass.

Return a single JSON object (with a `_thought_process` field first to brainstorm the scenarios):
{{
  "_thought_process": "string (detailed reasoning and brainstorming of novel scenarios for the coding problems and tricky concepts for MCQs)",
  "mcqs": [
    {{
      "_thought_process": "string (brief reasoning for this specific question)",
      "question": "string",
      "options": {{"A": "string", "B": "string", "C": "string", "D": "string"}},
      "correct_option": "A|B|C|D",
      "explanation": "2-3 sentence explanation of why correct and why others are wrong",
      "topic_tags": ["string"],
      "difficulty": "easy|medium|hard"
    }}
  ],
  "problems": [
    {{
      "_thought_process": "string (brainstorming the specific real-world scenario, the constraints, and the core algorithmic trap)",
      "title": "string",
      "statement": "string (markdown with Input/Output format, and at least 2 Examples with explanations, newlines as \\\\n)",
      "constraints": "string (bullet list, newlines as \\\\n)",
      "sample_input": "string (MUST be a valid JSON dictionary mapping schema names to values, e.g. {{ \"N\": 5 }})",
      "sample_output": "string",
      "problem_style": "standard (REQUIRED unless style override says leetcode)",
      "input_schema": [
        {{
          "name": "string — use meaningful param names (e.g. 'nums', 'n', 'edges', 'T')",
          "type": "int|long|float|double|bool|char|string|list<int>|list<long>|list<float>|list<string>|list<bool>|list<list<int>>|list<list<long>>|list<list<float>>|list<list<string>>|pair<int,int>|pair<long,long>|pair<int,string>|testcases"
        }}
      ],
      "output_type": "int|long|float|double|bool|string|list<int>|list<long>|list<float>|list<string>|list<list<int>>|list<list<string>>",
      "starter_code": {{
        "python3": "string (for leetcode style: class definition. for standard style: a robust parser reading sys.stdin that parses the exact input_schema into variables, then calls a solve function)",
        "cpp": "string (for leetcode style: class definition. for standard style: a robust parser using std::cin that parses the input_schema into variables, then calls a solve function)",
        "java": "string (for leetcode style: class definition. for standard style: a robust parser using Scanner that parses the input_schema into variables, then calls a solve function)",
        "javascript": "string (for leetcode style: class definition. for standard style: a robust parser using fs.readFileSync that parses the input_schema into variables, then calls a solve function)"
      }},
      "driver_code": {{
        "python3": "string (for standard style: empty. for leetcode style: hidden boilerplate python code reading sys.stdin, MUST include 'import sys, json', instantiating class, printing to sys.stdout)",
        "cpp": "string (for standard style: empty. for leetcode style: hidden boilerplate C++ int main() reading std::cin, instantiating class, printing to std::cout)",
        "java": "string (for standard style: empty. for leetcode style: hidden boilerplate Java public static void main reading Scanner, instantiating class, printing to System.out)",
        "javascript": "string (for standard style: empty. for leetcode style: hidden boilerplate JS reading fs.readFileSync(0, 'utf-8'), instantiating class, console.log)"
      }},
      "official_solution": "string (for standard style: a COMPLETE python3 script reading sys.stdin and printing sys.stdout. for leetcode style: just the completed class/method definition, our backend will append driver_code automatically.)",
      "difficulty": "easy|medium|hard",
      "topic_tags": ["string"],
      "test_cases": [
        {{
          "input": "string",
          "expected": "string",
          "category": "sample",
          "is_hidden": false
        }}
      ]
    }}
  ]
}}"""

    raw = await _call_llm(prompt)
    try:
        return _safe_parse_json(raw)
    except Exception as e:
        logger.warning(f"Failed to parse LLM JSON: {e}")
        raise


async def generate_hidden_test_cases_with_gemini(problem_dict: dict) -> list:
    """
    Second pass to generate exhaustive hidden test cases.
    """
    prompt = f"""You are an expert technical interviewer and competitive programming judge.
We have an algorithmic problem defined below:

Title: {problem_dict.get('title')}
Style: {problem_dict.get('problem_style', 'standard')}
Statement: {problem_dict.get('statement')}
Constraints: {problem_dict.get('constraints')}
Official Solution:
{problem_dict.get('official_solution')}

Your task is to generate exactly 10 exhaustive hidden test cases for this problem.
The test cases MUST adhere strictly to the problem constraints and cover these categories:

1. boundary (2 cases)
   — Empty array or string (e.g. {"arr": []}), single element, minimum/maximum constraint values (n=1, n=max).

2. structural (3 cases)
   — Problem-specific structural edge cases:
     * For graph problems: disconnected graph, fully connected, self-loops, single node.
     * For array problems: all identical elements, already sorted, reverse sorted, all negatives.
     * For tree problems: single node, linear chain (degenerate tree), perfectly balanced.
     * For string problems: all same characters, empty string, palindrome, single character.

3. adversarial (2 cases)
   — Specifically designed to break the MOST COMMON WRONG APPROACH:
     * Brute-force O(n²) / O(n³) solutions that TLE on large n
     * Greedy approaches that fail on specific orderings
     * Off-by-one errors (fencepost, inclusive/exclusive ranges)

4. performance (1 case)
   — n at or near maximum constraint (e.g. n=10^5 or n=10^6).
     Input large enough that an O(n²) solution will TLE but O(n log n) passes.

5. random (2 cases)
   — General random inputs for coverage.

Return a single JSON object matching this schema EXACTLY:
{{
  "test_cases": [
    {{
      "input": "string (MUST be a valid JSON dictionary mapping schema names to values, EVEN FOR BOUNDARY CASES. NEVER return empty string.)",
      "expected": "string",
      "category": "boundary|structural|adversarial|performance|random",
      "is_hidden": true
    }}
  ]
}}
"""
    raw = await _call_llm(prompt)
    try:
        data = _safe_parse_json(raw)
        return data.get("test_cases", [])
    except Exception as e:
        logger.error(f"Error parsing hidden test cases output: {e}\nRaw: {raw[:300]}")
        return []


async def fix_generated_problem_with_gemini(problem_data: dict, error_message: str) -> dict:
    """Ask the LLM to fix a generated problem that failed its own self-validation."""
    
    prompt = f"""You previously generated a coding problem, but the official solution failed against the test cases when run in a Python 3 sandbox.

Original Problem Data:
{json.dumps(problem_data, indent=2)}

Style: {problem_data.get('problem_style', 'standard')}

Execution Error / Output:
{error_message}

Please fix the problem. You can either fix the `official_solution` code (if there is a bug), or fix the `test_cases` (if the expected output is incorrect or invalid).
CRITICAL: The `official_solution` MUST be a complete script that reads from `sys.stdin` (or uses `input()`), calls the logic, and prints the result to stdout. A class or function definition alone will produce empty output!
CRITICAL: Ensure the `test_cases` input format is always a valid JSON string mapping schema names to values.
Return the fixed problem as a JSON object matching the EXACT original schema (no markdown fences, make sure to escape newlines as \\n in strings)."""

    raw = await _call_llm(prompt)
    try:
        return _safe_parse_json(raw)
    except Exception:
        raise ValueError("fix_generated_problem: unparseable LLM response")


# ─── Public API ──────────────────────────────────────────────────────────────

async def generate_mcqs(topic: str, difficulty: str, count: int, db: AsyncSession, style: str | None = None):
    """Generate MCQs — uses Gemini if API key is set, stubs otherwise."""
    if settings.GEMINI_API_KEY:
        try:
            mcq_dicts = await _generate_mcqs_with_gemini(topic, difficulty, count, style)
        except Exception as e:
            logger.warning(f"Gemini MCQ generation failed: {e}. Using stubs.")
            mcq_dicts = _get_stub_mcqs(topic, count)
    else:
        mcq_dicts = _get_stub_mcqs(topic, count)

    mcqs = []
    for data in mcq_dicts[:count]:
        mcq = MCQ(
            topic_tags=[topic.lower()],
            difficulty=_coerce_difficulty(difficulty),
            question=data["question"],
            options=data["options"],
            correct_option=data["correct_option"],
            explanation=data.get("explanation", ""),
        )
        db.add(mcq)
        await db.flush()
        mcqs.append(mcq)
    return mcqs


async def generate_coding_problem(topic: str, difficulty: str, db: AsyncSession, style: str | None = None):
    """Generate a coding problem — uses Gemini if API key is set, stubs otherwise."""
    if settings.GEMINI_API_KEY:
        try:
            data = await _generate_problem_with_gemini(topic, difficulty, style)
        except Exception as e:
            logger.warning(f"Gemini problem generation failed: {e}. Using stubs.")
            data = _get_stub_problem(topic)
    else:
        data = _get_stub_problem(topic)

    problem = Problem(
        title=data["title"],
        topic_tags=data.get("topic_tags", [topic.lower()]),
        difficulty=_coerce_difficulty(data.get("difficulty", difficulty)),
        statement=data["statement"],
        constraints=data.get("constraints", ""),
        sample_input=data.get("sample_input", ""),
        sample_output=data.get("sample_output", ""),
        time_limit_ms=2000,
        memory_limit_mb=256,
    )
    db.add(problem)
    await db.flush()

    for tc in data.get("test_cases", []):
        db.add(TestCase(
            problem_id=problem.id,
            input=tc["input"],
            expected_output=tc["expected"],
            is_hidden=tc.get("is_hidden", True),
            category=tc.get("category", "random"),
        ))

    await db.flush()
    await db.refresh(problem)
    return problem


async def generate_feedback_with_gemini(session_summary: dict) -> dict:
    """Post-test: generate rich AI feedback using Gemini."""
    if not settings.GEMINI_API_KEY:
        return {}
    try:
        prompt = f"""You are an expert coding interviewer giving feedback to a candidate.

Session data:
{json.dumps(session_summary, indent=2)}

Analyze the candidate's performance. For any incorrect coding questions, review their `submitted_code` and the `expected_solution` to diagnose exactly why they failed (e.g., O(n²) instead of O(n), missed an edge case, syntax error). Provide the expected solution logic, and compare their code's complexity with the optimal complexity.

Return a JSON object (no markdown fences) matching this exact format:
{{
  "overall_feedback": "3-4 sentences of honest, encouraging, specific feedback",
  "study_plan": ["5 specific, actionable study items ordered by priority"],
  "question_insights": [
    {{
      "title": "problem title",
      "explanation": "Specific critique (e.g. what edge case was missed, what was wrong with the code)",
      "approach": "The optimal solution approach or code walkthrough. Provide the correct logic clearly.",
      "complexity": "e.g., 'Expected: O(N) Time, O(1) Space. Yours: O(N^2) Time.'"
    }}
  ]
}}"""
        raw = await _call_llm(prompt)
        text = raw.strip()
        if text.startswith("```"):
            parts = text.split("```")
            if len(parts) >= 3:
                text = parts[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()
                
        text = re.sub(r',\s*}', '}', text)
        text = re.sub(r',\s*]', ']', text)
        return _safe_parse_json(text)
    except Exception as e:
        logger.warning(f"Gemini feedback failed: {e}")
        return {}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _coerce_difficulty(d: str) -> DifficultyEnum:
    try:
        return DifficultyEnum(d)
    except ValueError:
        return DifficultyEnum.medium


def _get_stub_mcqs(topic: str, count: int) -> list[dict]:
    pool = STUB_MCQS.get(topic) or random.choice(list(STUB_MCQS.values()))
    # Return random items to avoid repeating the exact same fallback
    if count >= len(pool):
        return pool
    return random.sample(pool, count)


def _get_stub_problem(topic: str) -> dict:
    pool = STUB_PROBLEMS.get(topic) or random.choice(list(STUB_PROBLEMS.values()))
    return random.choice(pool)
