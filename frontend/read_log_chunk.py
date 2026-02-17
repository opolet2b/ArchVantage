
try:
    with open('tsc_output.txt', 'r', encoding='utf-16') as f:
        for i in range(5):
            print(f.readline().strip())
except:
    try:
        with open('tsc_output.txt', 'r', encoding='utf-8') as f:
            for i in range(5):
                print(f.readline().strip())
    except Exception as e:
        print(e)
