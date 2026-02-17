
import os

def read_file():
    for encoding in ['utf-16', 'utf-8', 'cp1252']:
        try:
            with open('tsc_output.txt', 'r', encoding=encoding) as f:
                print(f.read())
            return
        except UnicodeError:
            continue
        except FileNotFoundError:
            print("File not found")
            return
    print("Could not read file with standard encodings")

if __name__ == "__main__":
    read_file()
