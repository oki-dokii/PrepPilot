"""
Boilerplate generator for standard (stdin/stdout) style problems.

Supported input schema types:
  Primitives : int, long, float, double, bool, char, string
  1-D arrays : list<int>, list<long>, list<float>, list<double>,
               list<bool>, list<char>, list<string>
  2-D arrays : list<list<int>>, list<list<long>>, list<list<float>>,
               list<list<double>>, list<list<string>>
  Pairs      : pair<int,int>, pair<long,long>, pair<int,string>, etc.
  Multi-test : Use {"name": "T", "type": "testcases"} as first schema item
               and the rest describe a single test-case block.

Supported output types:
  int, long, float, double, bool, char, string,
  list<X>, list<list<X>>
"""

from typing import List, Dict


# ──────────────────────────────────────────────────────────
# Public entry-point
# ──────────────────────────────────────────────────────────

def generate_standard_boilerplate(
    input_schema: List[Dict[str, str]], output_type: str
) -> Dict[str, str]:
    return {
        "python3": _gen_py(input_schema, output_type),
        "cpp":     _gen_cpp(input_schema, output_type),
        "java":    _gen_java(input_schema, output_type),
        "javascript": _gen_js(input_schema, output_type),
    }


# ──────────────────────────────────────────────────────────
# Helper: parse type strings
# ──────────────────────────────────────────────────────────

def _is_list2d(t: str) -> bool:
    return t.startswith("list<list<")

def _is_list1d(t: str) -> bool:
    return t.startswith("list<") and not _is_list2d(t)

def _is_pair(t: str) -> bool:
    return t.startswith("pair<")

def _list_inner(t: str) -> str:
    """list<X> → 'X'"""
    return t[5:-1]

def _list2d_inner(t: str) -> str:
    """list<list<X>> → 'X'"""
    return t[10:-2]

def _pair_inners(t: str):
    """pair<A,B> → ('A', 'B')"""
    inner = t[5:-1]  # A,B
    # split on first comma only (handles pair<list<int>,int>)
    depth = 0
    for i, ch in enumerate(inner):
        if ch in "<([": depth += 1
        elif ch in ">)]": depth -= 1
        elif ch == "," and depth == 0:
            return inner[:i].strip(), inner[i+1:].strip()
    return inner, "int"


# ──────────────────────────────────────────────────────────
# Python 3
# ──────────────────────────────────────────────────────────

def _py_cast(t: str) -> str:
    if t in ("int", "long"): return "int"
    if t in ("float", "double"): return "float"
    if t == "bool": return "lambda x: x.lower() in ('true','1','yes')"
    return "str"  # char, string

def _gen_py_read(name: str, t: str, indent: str = "    ") -> str:
    i = indent
    c = ""
    if t in ("int", "long"):
        c += f"{i}{name} = int(data[idx]); idx += 1\n"
    elif t in ("float", "double"):
        c += f"{i}{name} = float(data[idx]); idx += 1\n"
    elif t in ("bool",):
        c += f"{i}{name} = data[idx].lower() in ('true','1','yes'); idx += 1\n"
    elif t in ("char", "string"):
        c += f"{i}{name} = data[idx]; idx += 1\n"
    elif _is_list2d(t):
        inner = _list2d_inner(t)
        cast = _py_cast(inner)
        c += f"{i}_{name}_r = int(data[idx]); idx += 1\n"
        c += f"{i}{name} = []\n"
        c += f"{i}for _ in range(_{name}_r):\n"
        c += f"{i}    _{name}_c = int(data[idx]); idx += 1\n"
        c += f"{i}    {name}.append([{cast}(data[idx + j]) for j in range(_{name}_c)])\n"
        c += f"{i}    idx += _{name}_c\n"
    elif _is_list1d(t):
        inner = _list_inner(t)
        cast = _py_cast(inner)
        c += f"{i}_{name}_n = int(data[idx]); idx += 1\n"
        c += f"{i}{name} = [{cast}(data[idx + j]) for j in range(_{name}_n)]\n"
        c += f"{i}idx += _{name}_n\n"
    elif _is_pair(t):
        a, b = _pair_inners(t)
        ca, cb = _py_cast(a), _py_cast(b)
        c += f"{i}{name} = ({ca}(data[idx]), {cb}(data[idx+1])); idx += 2\n"
    else:
        c += f"{i}{name} = data[idx]; idx += 1\n"
    return c

def _py_print(out_type: str, var: str = "result") -> str:
    if _is_list2d(out_type):
        return (f"    for row in {var}:\n"
                f"        print(' '.join(map(str, row)))\n")
    if _is_list1d(out_type):
        return f"    print(' '.join(map(str, {var})))\n"
    if out_type == "bool":
        return f"    print('true' if {var} else 'false')\n"
    return f"    print({var})\n"

def _gen_py(schema: List[Dict[str, str]], out_type: str) -> str:
    multi_test = schema and schema[0]["type"] == "testcases"
    body_schema = schema[1:] if multi_test else schema
    args_str = ", ".join(item["name"] for item in body_schema)

    c  = "import sys\n\n"
    c += f"def solve({args_str}):\n"
    c += "    # TODO: Implement your solution here\n"
    c += "    pass\n\n"
    c += "def main():\n"
    c += "    data = sys.stdin.read().split()\n"
    c += "    if not data: return\n"
    c += "    idx = 0\n"

    if multi_test:
        c += "    T = int(data[idx]); idx += 1\n"
        c += "    for _ in range(T):\n"
        for item in body_schema:
            c += _gen_py_read(item["name"], item["type"], "        ")
        c += f"        result = solve({args_str})\n"
        c += "        " + _py_print(out_type).lstrip()
    else:
        for item in body_schema:
            c += _gen_py_read(item["name"], item["type"])
        c += f"\n    result = solve({args_str})\n"
        c += _py_print(out_type)

    c += "\nmain()\n"
    return c


# ──────────────────────────────────────────────────────────
# C++
# ──────────────────────────────────────────────────────────

def _cpp_type(t: str) -> str:
    if t == "int":    return "int"
    if t == "long":   return "long long"
    if t == "float":  return "double"
    if t == "double": return "double"
    if t == "bool":   return "bool"
    if t == "char":   return "char"
    if t == "string": return "string"
    if _is_list2d(t): return f"vector<vector<{_cpp_type(_list2d_inner(t))}>>"
    if _is_list1d(t): return f"vector<{_cpp_type(_list_inner(t))}>"
    if _is_pair(t):
        a, b = _pair_inners(t)
        return f"pair<{_cpp_type(a)}, {_cpp_type(b)}>"
    return "string"

def _cpp_read_scalar(t: str, var: str) -> str:
    """Returns a cin statement for a scalar variable already declared."""
    if t == "bool":
        return f"    {{ string _s; cin >> _s; {var} = (_s == \"true\" || _s == \"1\"); }}\n"
    return f"    cin >> {var};\n"

def _gen_cpp_read_block(name: str, t: str, indent: str = "    ") -> str:
    i = indent
    c = ""
    ctype = _cpp_type(t)
    if t in ("int", "long", "float", "double", "char", "string"):
        c += f"{i}{ctype} {name};\n"
        c += f"{i}cin >> {name};\n"
    elif t == "bool":
        c += f"{i}bool {name};\n"
        c += f"{i}{{ string _s; cin >> _s; {name} = (_s == \"true\" || _s == \"1\"); }}\n"
    elif _is_list2d(t):
        inner_t = _list2d_inner(t)
        inner_ct = _cpp_type(inner_t)
        c += f"{i}int _{name}_r; cin >> _{name}_r;\n"
        c += f"{i}{ctype} {name}(_{name}_r);\n"
        c += f"{i}for(int _i = 0; _i < _{name}_r; _i++){{\n"
        c += f"{i}    int _{name}_c; cin >> _{name}_c;\n"
        c += f"{i}    {name}[_i].resize(_{name}_c);\n"
        c += f"{i}    for(int _j = 0; _j < _{name}_c; _j++) cin >> {name}[_i][_j];\n"
        c += f"{i}}}\n"
    elif _is_list1d(t):
        inner_ct = _cpp_type(_list_inner(t))
        c += f"{i}int _{name}_n; cin >> _{name}_n;\n"
        c += f"{i}{ctype} {name}(_{name}_n);\n"
        c += f"{i}for(int _i = 0; _i < _{name}_n; _i++) cin >> {name}[_i];\n"
    elif _is_pair(t):
        a, b = _pair_inners(t)
        ca, cb = _cpp_type(a), _cpp_type(b)
        c += f"{i}{ca} _{name}_first; cin >> _{name}_first;\n"
        c += f"{i}{cb} _{name}_second; cin >> _{name}_second;\n"
        c += f"{i}{ctype} {name} = {{{name}_first, _{name}_second}};\n"
    else:
        c += f"{i}{ctype} {name};\n"
        c += f"{i}cin >> {name};\n"
    return c

def _cpp_print_result(out_type: str, var: str = "result", indent: str = "    ") -> str:
    i = indent
    if _is_list2d(out_type):
        return (f"{i}for(auto& row : {var}){{\n"
                f"{i}    for(size_t _k=0;_k<row.size();_k++) cout<<row[_k]<<(_k+1<row.size()?' ':'\\n');\n"
                f"{i}}}\n")
    if _is_list1d(out_type):
        return (f"{i}for(size_t _k=0;_k<{var}.size();_k++) "
                f"cout<<{var}[_k]<<(_k+1<{var}.size()?' ':'\\n');\n")
    if out_type == "bool":
        return f"{i}cout << ({var} ? \"true\" : \"false\") << endl;\n"
    return f"{i}cout << {var} << endl;\n"

def _gen_cpp(schema: List[Dict[str, str]], out_type: str) -> str:
    multi_test = schema and schema[0]["type"] == "testcases"
    body_schema = schema[1:] if multi_test else schema
    args_decl = ", ".join(f"{_cpp_type(item['type'])} {item['name']}" for item in body_schema)
    args_call = ", ".join(item["name"] for item in body_schema)
    out_ct = _cpp_type(out_type)

    needs_long = any("long" in item["type"] for item in schema)
    c  = "#include <bits/stdc++.h>\n"
    c += "using namespace std;\n\n"

    c += f"{out_ct} solve({args_decl}) {{\n"
    c += "    // TODO: Implement your solution here\n"
    if out_ct not in ("void",):
        c += f"    return {out_ct}();\n"
    c += "}\n\n"

    c += "int main() {\n"
    c += "    ios_base::sync_with_stdio(false);\n"
    c += "    cin.tie(NULL);\n"

    if multi_test:
        c += "    int T; cin >> T;\n"
        c += "    while(T--) {\n"
        for item in body_schema:
            c += _gen_cpp_read_block(item["name"], item["type"], "        ")
        c += f"        {out_ct} result = solve({args_call});\n"
        c += _cpp_print_result(out_type, "result", "        ")
        c += "    }\n"
    else:
        for item in body_schema:
            c += _gen_cpp_read_block(item["name"], item["type"])
        c += f"    {out_ct} result = solve({args_call});\n"
        c += _cpp_print_result(out_type)

    c += "    return 0;\n"
    c += "}\n"
    return c


# ──────────────────────────────────────────────────────────
# Java
# ──────────────────────────────────────────────────────────

def _java_type(t: str, boxed: bool = False) -> str:
    if t == "int":    return "Integer" if boxed else "int"
    if t == "long":   return "Long" if boxed else "long"
    if t == "float":  return "Double" if boxed else "double"
    if t == "double": return "Double" if boxed else "double"
    if t == "bool":   return "Boolean" if boxed else "boolean"
    if t == "char":   return "Character" if boxed else "char"
    if t == "string": return "String"
    if _is_list2d(t):
        inner = _java_type(_list2d_inner(t), boxed=True)
        return f"List<List<{inner}>>"
    if _is_list1d(t):
        inner = _java_type(_list_inner(t), boxed=True)
        return f"List<{inner}>"
    if _is_pair(t):
        a, b = _pair_inners(t)
        return f"long[]"  # simple representation: [first, second] as long[]
    return "String"

def _java_scanner_read(t: str) -> str:
    if t in ("int",): return "sc.nextInt()"
    if t == "long":   return "sc.nextLong()"
    if t in ("float","double"): return "sc.nextDouble()"
    if t == "bool":   return "sc.next().equals(\"true\")"
    if t == "char":   return "sc.next().charAt(0)"
    return "sc.next()"

def _gen_java_read_block(name: str, t: str, indent: str = "        ") -> str:
    i = indent
    c = ""
    jtype = _java_type(t)
    if t in ("int","long","float","double","bool","char","string"):
        c += f"{i}{jtype} {name} = {_java_scanner_read(t)};\n"
    elif _is_list2d(t):
        inner = _list2d_inner(t)
        inner_boxed = _java_type(inner, boxed=True)
        read = _java_scanner_read(inner)
        c += f"{i}int _{name}_r = sc.nextInt();\n"
        c += f"{i}List<List<{inner_boxed}>> {name} = new ArrayList<>();\n"
        c += f"{i}for(int _i=0;_i<_{name}_r;_i++){{\n"
        c += f"{i}    int _{name}_c = sc.nextInt();\n"
        c += f"{i}    List<{inner_boxed}> _row = new ArrayList<>();\n"
        c += f"{i}    for(int _j=0;_j<_{name}_c;_j++) _row.add({read});\n"
        c += f"{i}    {name}.add(_row);\n"
        c += f"{i}}}\n"
    elif _is_list1d(t):
        inner = _list_inner(t)
        inner_boxed = _java_type(inner, boxed=True)
        read = _java_scanner_read(inner)
        c += f"{i}int _{name}_n = sc.nextInt();\n"
        c += f"{i}List<{inner_boxed}> {name} = new ArrayList<>();\n"
        c += f"{i}for(int _i=0;_i<_{name}_n;_i++) {name}.add({read});\n"
    elif _is_pair(t):
        a, b = _pair_inners(t)
        c += f"{i}long[] {name} = {{ {_java_scanner_read(a)}, {_java_scanner_read(b)} }};\n"
    else:
        c += f"{i}{jtype} {name} = sc.next();\n"
    return c

def _java_print_result(out_type: str, var: str = "result", indent: str = "        ") -> str:
    i = indent
    if _is_list2d(out_type):
        return (f"{i}for(var row : {var}){{\n"
                f"{i}    StringBuilder _sb = new StringBuilder();\n"
                f"{i}    for(int _k=0;_k<row.size();_k++){{ if(_k>0)_sb.append(' '); _sb.append(row.get(_k)); }}\n"
                f"{i}    System.out.println(_sb);\n"
                f"{i}}}\n")
    if _is_list1d(out_type):
        return (f"{i}StringBuilder _sb = new StringBuilder();\n"
                f"{i}for(int _k=0;_k<{var}.size();_k++){{ if(_k>0)_sb.append(' '); _sb.append({var}.get(_k)); }}\n"
                f"{i}System.out.println(_sb);\n")
    if out_type == "bool":
        return f"{i}System.out.println({var} ? \"true\" : \"false\");\n"
    return f"{i}System.out.println({var});\n"

def _gen_java(schema: List[Dict[str, str]], out_type: str) -> str:
    multi_test = schema and schema[0]["type"] == "testcases"
    body_schema = schema[1:] if multi_test else schema
    args_decl = ", ".join(f"{_java_type(item['type'])} {item['name']}" for item in body_schema)
    args_call = ", ".join(item["name"] for item in body_schema)
    out_jtype = _java_type(out_type)

    c  = "import java.util.*;\n\n"
    c += "public class Solution {\n\n"
    c += f"    public static {out_jtype} solve({args_decl}) {{\n"
    c += "        // TODO: Implement your solution here\n"
    if out_jtype not in ("void",):
        default = "null" if out_jtype in ("String",) or "List" in out_jtype else "0"
        if out_jtype == "boolean": default = "false"
        c += f"        return {default};\n"
    c += "    }\n\n"

    c += "    public static void main(String[] args) {\n"
    c += "        Scanner sc = new Scanner(System.in);\n"

    if multi_test:
        c += "        int T = sc.nextInt();\n"
        c += "        while(T-- > 0) {\n"
        for item in body_schema:
            c += _gen_java_read_block(item["name"], item["type"], "            ")
        c += f"            {out_jtype} result = solve({args_call});\n"
        c += _java_print_result(out_type, "result", "            ")
        c += "        }\n"
    else:
        for item in body_schema:
            c += _gen_java_read_block(item["name"], item["type"])
        c += f"        {out_jtype} result = solve({args_call});\n"
        c += _java_print_result(out_type)

    c += "    }\n"
    c += "}\n"
    return c


# ──────────────────────────────────────────────────────────
# JavaScript (Node.js)
# ──────────────────────────────────────────────────────────

def _js_parse(t: str, expr: str) -> str:
    if t in ("int", "long"): return f"parseInt({expr}, 10)"
    if t in ("float", "double"): return f"parseFloat({expr})"
    if t == "bool": return f"({expr} === 'true' || {expr} === '1')"
    return expr  # char, string

def _gen_js_read_block(name: str, t: str, indent: str = "    ") -> str:
    i = indent
    c = ""
    if t in ("int","long"):
        c += f"{i}const {name} = parseInt(tok[idx++], 10);\n"
    elif t in ("float","double"):
        c += f"{i}const {name} = parseFloat(tok[idx++]);\n"
    elif t == "bool":
        c += f"{i}const {name} = (tok[idx] === 'true' || tok[idx] === '1'); idx++;\n"
    elif t in ("char","string"):
        c += f"{i}const {name} = tok[idx++];\n"
    elif _is_list2d(t):
        inner = _list2d_inner(t)
        parse = _js_parse(inner, "tok[idx++]")
        c += f"{i}const _{name}_r = parseInt(tok[idx++], 10);\n"
        c += f"{i}const {name} = [];\n"
        c += f"{i}for(let _i=0;_i<_{name}_r;_i++){{\n"
        c += f"{i}    const _{name}_c = parseInt(tok[idx++], 10);\n"
        c += f"{i}    const _row = [];\n"
        c += f"{i}    for(let _j=0;_j<_{name}_c;_j++) _row.push({parse});\n"
        c += f"{i}    {name}.push(_row);\n"
        c += f"{i}}}\n"
    elif _is_list1d(t):
        inner = _list_inner(t)
        parse = _js_parse(inner, "tok[idx++]")
        c += f"{i}const _{name}_n = parseInt(tok[idx++], 10);\n"
        c += f"{i}const {name} = [];\n"
        c += f"{i}for(let _i=0;_i<_{name}_n;_i++) {name}.push({parse});\n"
    elif _is_pair(t):
        a, b = _pair_inners(t)
        c += f"{i}const {name} = [{_js_parse(a, 'tok[idx++]')}, {_js_parse(b, 'tok[idx++]')}];\n"
    else:
        c += f"{i}const {name} = tok[idx++];\n"
    return c

def _js_print_result(out_type: str, var: str = "result", indent: str = "    ") -> str:
    i = indent
    if _is_list2d(out_type):
        return f"{i}{var}.forEach(r => console.log(r.join(' ')));\n"
    if _is_list1d(out_type):
        return f"{i}console.log({var}.join(' '));\n"
    if out_type == "bool":
        return f"{i}console.log({var} ? 'true' : 'false');\n"
    return f"{i}console.log({var});\n"

def _gen_js(schema: List[Dict[str, str]], out_type: str) -> str:
    multi_test = schema and schema[0]["type"] == "testcases"
    body_schema = schema[1:] if multi_test else schema
    args_str = ", ".join(item["name"] for item in body_schema)

    c  = "process.stdin.resume();\n"
    c += "process.stdin.setEncoding('utf-8');\n"
    c += "let _input = '';\n"
    c += "process.stdin.on('data', d => _input += d);\n"
    c += "process.stdin.on('end', () => {\n"
    c += "    const tok = _input.trim().split(/\\s+/);\n"
    c += "    let idx = 0;\n\n"

    c += f"    function solve({args_str}) {{\n"
    c += "        // TODO: Implement your solution here\n"
    c += "        return null;\n"
    c += "    }\n\n"

    if multi_test:
        c += "    const T = parseInt(tok[idx++], 10);\n"
        c += "    for(let _t=0;_t<T;_t++) {\n"
        for item in body_schema:
            c += _gen_js_read_block(item["name"], item["type"], "        ")
        c += f"        const result = solve({args_str});\n"
        c += "        " + _js_print_result(out_type, "result").lstrip()
        c += "    }\n"
    else:
        for item in body_schema:
            c += _gen_js_read_block(item["name"], item["type"])
        c += f"\n    const result = solve({args_str});\n"
        c += _js_print_result(out_type)

    c += "});\n"
    return c
