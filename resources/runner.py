import importlib.util
import json
import sys


def load_solution(path):
    spec = importlib.util.spec_from_file_location("solution", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.solution


def main():
    solution_path = sys.argv[1]
    cases_path = sys.argv[2]

    with open(cases_path, "r", encoding="utf-8") as f:
        cases = json.load(f)

    solution = load_solution(solution_path)

    results = []
    for index, case in enumerate(cases):
        try:
            actual = solution(*case["inputs"])
            results.append({
                "index": index,
                "pass": actual == case["output"],
                "actual": actual,
                "expected": case["output"],
            })
        except Exception as exc:
            results.append({
                "index": index,
                "pass": False,
                "error": f"{type(exc).__name__}: {exc}",
            })

    print(json.dumps(results))


if __name__ == "__main__":
    main()
