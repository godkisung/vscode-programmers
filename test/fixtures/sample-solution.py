def solution(participant, completion):
    from collections import Counter
    counter = Counter(participant) - Counter(completion)
    return list(counter.keys())[0]
