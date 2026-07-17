import importlib.util
import json
import sys
import time


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
        start = time.perf_counter()
        try:
            actual = solution(*case["inputs"])
            time_ms = round((time.perf_counter() - start) * 1000, 2)
            results.append({
                "index": index,
                "pass": actual == case["output"],
                "actual": actual,
                "expected": case["output"],
                "timeMs": time_ms,
            })
        except Exception as exc:
            time_ms = round((time.perf_counter() - start) * 1000, 2)
            results.append({
                "index": index,
                "pass": False,
                "error": f"{type(exc).__name__}: {exc}",
                "timeMs": time_ms,
            })

    print(json.dumps(results))


if __name__ == "__main__":
    main()
