import re

filepath = r"c:\Users\opole\Downloads\ChatBotn\frontend\src\components\workflow-editor.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('border-slate-800', 'border-border')
content = content.replace('bg-slate-950', 'bg-background')
content = content.replace('bg-slate-900', 'bg-card')
content = content.replace('bg-slate-800', 'bg-secondary')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
