const fs = require('fs');

// Simple mock of the parser logic from the frontend
function parse(markdown) {
    const lines = markdown.split('\n');
    const root = [];
    const stack = [{ block: null, list: root }];

    // Regex
    const instructionRegex = /<!--\s*INSTRUCTION:\s*(.*?)\s*-->/i;
    const beginLoopRegex = /<!--\s*BEGIN LOOP:\s*(.*?)\s*-->/i;
    const endLoopRegex = /<!--\s*END LOOP\s*-->/i;
    const ifRegex = /<!--\s*IF:\s*(.*?)\s*-->/i;
    const elseRegex = /<!--\s*ELSE\s*-->/i;
    const endIfRegex = /<!--\s*ENDIF\s*-->/i;
    const headerRegex = /^(#{1,6})\s+(.*)/;

    // State for multi-line instruction parsing
    let inInstructionBlock = false;
    let instructionBuffer = [];
    let currentAssignTo = undefined;

    // State for frontmatter detection
    let inFrontmatter = false;
    let frontmatterContent = [];
    let frontmatterStarted = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // --- 0. Handle Multi-Line Instruction Block ---
        if (inInstructionBlock) {
            if (line.includes("-->")) {
                const parts = line.split("-->", 1);
                instructionBuffer.push(parts[0].trim());

                const fullText = instructionBuffer.join(" ").trim();
                const currentContext = stack[stack.length - 1];
                currentContext.list.push({
                    id: "mock_uuid",
                    type: "instruction",
                    content: fullText,
                    assignTo: currentAssignTo
                });

                inInstructionBlock = false;
                instructionBuffer = [];
                currentAssignTo = undefined;
                continue;
            } else {
                instructionBuffer.push(trimmedLine);
                continue;
            }
        }

        // Handle YAML Frontmatter 
        if (trimmedLine === '---') {
            if (!frontmatterStarted) {
                frontmatterStarted = true;
                inFrontmatter = true;
                continue;
            } else if (inFrontmatter) {
                inFrontmatter = false;
                if (frontmatterContent.length > 0) {
                    root.push({
                        id: "mock_uuid",
                        type: "frontmatter",
                        content: frontmatterContent.join('\n')
                    });
                    frontmatterContent = [];
                }
                continue;
            }
        }

        if (inFrontmatter) {
            frontmatterContent.push(line);
            continue;
        }

        if (!trimmedLine) continue;

        const currentContext = stack[stack.length - 1];
        const currentList = currentContext.list;

        // 6. Section
        const headerMatch = line.match(headerRegex);
        if (headerMatch) {
            stack.splice(1);
            const newSection = {
                id: "mock_uuid",
                type: "section",
                title: headerMatch[2].trim(),
                children: []
            };
            root.push(newSection);
            stack.push({ block: newSection, list: newSection.children });
            continue;
        }

        // 7. Instruction (New Support for [ASSIGN: var] and Multi-line)
        const startInstrMatch = line.match(/<!--\s*INSTRUCTIONS?(?:\s*\[ASSIGN:\s*([^\]]+)\])?:\s*(.*)/i);
        if (startInstrMatch) {
            const assignTo = startInstrMatch[1]?.trim();
            const contentStart = startInstrMatch[2]?.trim();

            if (contentStart.includes("-->")) {
                const parts = contentStart.split("-->", 1);
                currentList.push({
                    id: "mock_uuid",
                    type: "instruction",
                    content: parts[0].trim(),
                    assignTo: assignTo
                });
            } else {
                inInstructionBlock = true;
                instructionBuffer.push(contentStart);
                currentAssignTo = assignTo;
            }
            continue;
        }

        // 8. Text
        if (line) {
            currentList.push({
                id: "mock_uuid",
                type: "text",
                content: line
            });
        }
    }

    return root;
}

const templateStr = fs.readFileSync('test_template.txt', 'utf8');
const result = parse(templateStr);
console.log(JSON.stringify(result, null, 2));

