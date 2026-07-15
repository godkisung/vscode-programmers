def solution(participant, completion):
    print("debug: checking participants")
    from collections import Counter
    counter = Counter(participant) - Counter(completion)
    print("debug: counter computed")
    return list(counter.keys())[0]
