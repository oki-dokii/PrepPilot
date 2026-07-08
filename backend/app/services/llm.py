"""
LLM service — Google Gemini API for test generation and feedback.
Falls back to rich stubs when GEMINI_API_KEY is not configured.
"""
import json
import random
import logging
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


# ─── Gemini client ────────────────────────────────────────────────────────────

async def _call_gemini(prompt: str) -> str:
    """Call Gemini API and return the text response."""
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name="gemini-flash-lite-latest",
        generation_config={
            "temperature": 0.7,
            "response_mime_type": "application/json",
        },
    )
    response = model.generate_content(prompt)
    return response.text


async def _generate_mcqs_with_gemini(topic: str, difficulty: str, count: int, style: str | None) -> list[dict]:
    style_hint = f" in the style of {style} interviews" if style else ""
    prompt = f"""Generate {count} multiple-choice questions about {topic}{style_hint} at {difficulty} difficulty for a coding interview prep platform.

Return a JSON array (no markdown fences) of objects with this exact schema:
[
  {{
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

    raw = await _call_gemini(prompt)
    return json.loads(raw)


async def _generate_problem_with_gemini(topic: str, difficulty: str, style: str | None) -> dict:
    style_hint = f" inspired by {style} OA style" if style else ""
    prompt = f"""Create a coding problem about {topic}{style_hint} at {difficulty} difficulty for a coding interview prep platform.

IMPORTANT: Use a NOVEL real-world scenario (drone networks, satellite telemetry, genomics, logistics routing, financial systems). Do NOT use LeetCode problem names verbatim.

RULES:
1. Return ONLY a valid JSON object. No markdown fences.
2. ALL newlines inside string values MUST be escaped as \\n.
3. Make sure all problem conditions are mathematically rigorous and unambiguous. Never leave key constraints open to interpretation.
4. The statement MUST include a clear 'Input Format', 'Output Format', and AT LEAST 2 sample examples with step-by-step logical explanations.

{{
  "title": "string",
  "statement": "string (markdown with Input/Output format, and at least 2 Examples with step-by-step explanations)",
  "constraints": "string (markdown bullet list)",
  "sample_input": "string",
  "sample_output": "string",
  "official_solution": "string (python3 code that correctly solves the problem)",
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


    raw = await _call_gemini(prompt)
    return json.loads(raw)


async def generate_full_test_with_gemini(blueprint: list, style: str | None = None) -> dict:
    """
    Generate the ENTIRE test in ONE single Gemini API call.
    blueprint: list of {type, topic, difficulty}
    Returns: {"mcqs": [...], "problems": [...]} matching blueprint order.
    """
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)

    style_hint = f" in the style of {style} technical interviews" if style else ""

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
- For Coding Problems: invent a NOVEL real-world scenario (autonomous vehicles, satellite telemetry, genomics pipeline, logistics routing, financial clearing, etc.). Do NOT use LeetCode problem names verbatim.
- For Coding Problems: Make sure all problem conditions are mathematically rigorous and unambiguous. Never leave key constraints open to interpretation. The statement MUST include a clear 'Input Format', 'Output Format', and AT LEAST 2 sample examples with step-by-step logical explanations.
- ALL string values must escape newlines as \\n. No raw multiline strings.
- Return ONLY valid JSON. No markdown fences.

═══ TEST CASE REQUIREMENTS (CRITICAL) ═══
Each coding problem MUST have AT LEAST 12 test cases total, covering ALL of the following categories:

1. sample (2 cases, is_hidden: false)
   — Small, readable, hand-verifiable. These are shown to the candidate.

2. boundary (3 cases, is_hidden: true)
   — Empty/null input, single element, minimum/maximum constraint values (n=1, n=max).

3. structural (3 cases, is_hidden: true)
   — Problem-specific structural edge cases:
     * For graph problems: disconnected graph, fully connected, self-loops, single node.
     * For array problems: all identical elements, already sorted, reverse sorted, all negatives.
     * For tree problems: single node, linear chain (degenerate tree), perfectly balanced.
     * For string problems: all same characters, empty string, palindrome, single character.

4. adversarial (2 cases, is_hidden: true)
   — Specifically designed to break the MOST COMMON WRONG APPROACH:
     * Brute-force O(n²) / O(n³) solutions that TLE on large n
     * Greedy approaches that fail on specific orderings
     * Off-by-one errors (fencepost, inclusive/exclusive ranges)
     * Integer overflow with large numbers

5. performance (1 case, is_hidden: true)
   — n at or near maximum constraint (e.g. n=10^5 or n=10^6).
     Input large enough that an O(n²) solution will TLE but O(n log n) passes.
     Use a compact representation (e.g. "100000" not a literal array of 100000 items).

6. random (2+ cases, is_hidden: true)
   — General random inputs for coverage.

Return a single JSON object:
{{
  "mcqs": [
    {{
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
      "title": "string",
      "statement": "string (markdown with Input/Output format, and at least 2 Examples with explanations, newlines as \\\\n)",
      "constraints": "string (bullet list, newlines as \\\\n)",
      "sample_input": "string",
      "sample_output": "string",
      "official_solution": "string (python3 code that correctly solves the problem, newlines as \\\\n)",
      "difficulty": "easy|medium|hard",
      "topic_tags": ["string"],
      "test_cases": [
        {{
          "input": "string",
          "expected": "string",
          "category": "sample|boundary|structural|adversarial|performance|random",
          "is_hidden": false
        }}
      ]
    }}
  ]
}}"""

    model = genai.GenerativeModel(
        model_name="gemini-flash-lite-latest",
        generation_config={"temperature": 0.85, "response_mime_type": "application/json"},
    )
    response = model.generate_content(prompt)
    text = response.text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)


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

Analyze the candidate's performance. For any incorrect coding questions, review their `submitted_code` and the `expected_solution` to diagnose exactly why they failed (e.g., O(n²) instead of O(n), missed an edge case, syntax error).

Return a JSON object (no markdown fences) matching this exact format:
{{
  "overall_feedback": "3-4 sentences of honest, encouraging, specific feedback",
  "study_plan": ["5 specific, actionable study items ordered by priority"],
  "question_insights": [
    {{
      "title": "problem title",
      "key_insight": "A specific, targeted critique. For coding problems they got wrong, explain exactly what was wrong with their code."
    }}
  ]
}}"""
        raw = await _call_gemini(prompt)
        return json.loads(raw)
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
    return pool[:count]


def _get_stub_problem(topic: str) -> dict:
    pool = STUB_PROBLEMS.get(topic) or random.choice(list(STUB_PROBLEMS.values()))
    return random.choice(pool)
