
with open('src/data_fetcher.py', 'rb') as f:
    lines = f.readlines()
    for i in range(680, 690):
        if i < len(lines):
            print(f"{i+1}: {repr(lines[i])}")
