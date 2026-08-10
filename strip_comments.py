import sys
import re
import os

def strip_comments(code):
    pattern = re.compile(
        r'(?P<string>"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`(?:\\.|[^`\\])*`)'
        r'|(?P<block_comment>/\*(?!\s*(eslint-disable|eslint-env|@ts-|ALLOWED-REGRESSION)).*?\*/)'
        r'|(?P<line_comment>(?P<prefix>^|\s|[{};])//(?!\s*(ALLOWED-REGRESSION|eslint-disable|@ts-)).*?$)',
        re.DOTALL | re.MULTILINE
    )
    
    def replacer(match):
        if match.group('string') is not None:
            return match.group('string')
        elif match.group('block_comment') is not None:
            return ""
        elif match.group('line_comment') is not None:
            return match.group('prefix')
        else:
            return ""
            
    stripped = pattern.sub(replacer, code)
    stripped = re.sub(r'\n\s*\n', '\n\n', stripped)
    return stripped

def process_directory(directory):
    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if 'target' in dirs:
            dirs.remove('target')
        if 'dist' in dirs:
            dirs.remove('dist')
            
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx', '.rs')):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    new_content = strip_comments(content)
                    
                    if content != new_content:
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(new_content)
                        print(f"Cleaned {filepath}")
                except Exception as e:
                    print(f"Error reading {filepath}: {e}")

if __name__ == "__main__":
    for path in sys.argv[1:]:
        process_directory(path)
