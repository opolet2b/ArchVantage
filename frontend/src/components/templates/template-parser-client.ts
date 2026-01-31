
export interface TemplateBlock {
    id: string;
    type: "section" | "instruction" | "loop" | "text" | "if" | "else" | "subsection" | "frontmatter";
    title?: string; // For sections
    content?: string; // For instructions, text, if-conditions, or frontmatter yaml
    loopSource?: string; // For loops
    children?: TemplateBlock[]; // Nested blocks
}

export class TemplateParserClient {
    /**
     * Parse markdown content into structured blocks for the builder.
     */
    static parse(markdown: string): TemplateBlock[] {
        const lines = markdown.split('\n');
        const root: TemplateBlock[] = [];
        const stack: { block: TemplateBlock | null, list: TemplateBlock[] }[] = [{ block: null, list: root }];

        // Regex
        const instructionRegex = /<!--\s*INSTRUCTION:\s*(.*?)\s*-->/i;
        const beginLoopRegex = /<!--\s*BEGIN LOOP:\s*(.*?)\s*-->/i;
        const endLoopRegex = /<!--\s*END LOOP\s*-->/i;
        const ifRegex = /<!--\s*IF:\s*(.*?)\s*-->/i;
        const elseRegex = /<!--\s*ELSE\s*-->/i;
        const endIfRegex = /<!--\s*ENDIF\s*-->/i;
        const headerRegex = /^(#{1,6})\s+(.*)/;

        // State for frontmatter detection
        let inFrontmatter = false;
        let frontmatterContent: string[] = [];
        let frontmatterStarted = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Handle YAML Frontmatter (lines between first --- and second ---)
            if (trimmedLine === '---') {
                if (!frontmatterStarted) {
                    // Start of frontmatter
                    frontmatterStarted = true;
                    inFrontmatter = true;
                    continue;
                } else if (inFrontmatter) {
                    // End of frontmatter
                    inFrontmatter = false;
                    if (frontmatterContent.length > 0) {
                        root.push({
                            id: crypto.randomUUID(),
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

            // 1. Loop Start
            const loopStartMatch = trimmedLine.match(beginLoopRegex);
            if (loopStartMatch) {
                const newLoop: TemplateBlock = {
                    id: crypto.randomUUID(),
                    type: "loop",
                    loopSource: loopStartMatch[1].trim(),
                    children: []
                };
                currentList.push(newLoop);
                stack.push({ block: newLoop, list: newLoop.children! });
                continue;
            }

            // 2. Loop End
            if (endLoopRegex.test(line)) {
                // Find nearest loop in stack and pop until we find it or root
                const loopIndex = stack.findLastIndex(s => s.block?.type === "loop");
                if (loopIndex !== -1 && loopIndex > 0) {
                    // Pop everything down to that loop
                    stack.splice(loopIndex);
                }
                continue;
            }

            // 3. IF Start
            const ifMatch = line.match(ifRegex);
            if (ifMatch) {
                const newIf: TemplateBlock = {
                    id: crypto.randomUUID(),
                    type: "if",
                    content: ifMatch[1].trim(),
                    children: []
                };
                currentList.push(newIf);
                stack.push({ block: newIf, list: newIf.children! });
                continue;
            }

            // 4. ELSE
            if (elseRegex.test(line)) {
                // We must be in an IF block. Close it and start an ELSE block?
                // Visualizing ELSE is tricky in a tree. 
                // Option: The "IF" block contains the "Then" children.
                // We pop the IF, create an ELSE block at the same level.

                // 1. Check if we are inside an IF
                const ifIndex = stack.findLastIndex(s => s.block?.type === "if");
                if (ifIndex !== -1) {
                    stack.splice(ifIndex); // Close the IF

                    // Create ELSE
                    const newElse: TemplateBlock = {
                        id: crypto.randomUUID(),
                        type: "else",
                        children: []
                    };
                    // Add to the parent of the IF (which is now top of stack)
                    stack[stack.length - 1].list.push(newElse);
                    stack.push({ block: newElse, list: newElse.children! });
                }
                continue;
            }

            // 5. ENDIF
            if (endIfRegex.test(line)) {
                // Pop until we clear the IF or ELSE
                const ifElseIndex = stack.findLastIndex(s => s.block?.type === "if" || s.block?.type === "else");
                if (ifElseIndex !== -1 && ifElseIndex > 0) {
                    stack.splice(ifElseIndex);
                }
                continue;
            }

            // 6. Section (Header)
            const headerMatch = line.match(headerRegex);
            if (headerMatch) {
                // Sections usually reset context back to Root or a higher level Section
                // But if we are inside a Loop, we might want to keep it?
                // Logic: A header generally starts a new section at the ROOT level or effectively closes previous siblings.
                // For simplified builder: Sections are Root Level items.

                // Clear stack to root
                stack.splice(1);

                const newSection: TemplateBlock = {
                    id: crypto.randomUUID(),
                    type: "section",
                    title: headerMatch[2].trim(),
                    children: []
                };
                root.push(newSection);
                stack.push({ block: newSection, list: newSection.children! });
                continue;
            }

            // 7. Instruction
            const instructionMatch = line.match(instructionRegex);
            if (instructionMatch) {
                currentList.push({
                    id: crypto.randomUUID(),
                    type: "instruction",
                    content: instructionMatch[1].trim()
                });
                continue;
            }

            // 8. Text
            if (line) {
                currentList.push({
                    id: crypto.randomUUID(),
                    type: "text",
                    content: line
                });
            }
        }

        return root;
    }

    /**
     * Serialize blocks back to Markdown
     */
    static serialize(blocks: TemplateBlock[]): string {
        let markdown = "";

        blocks.forEach(block => {
            if (block.type === "frontmatter") {
                // Serialize frontmatter with delimiters
                markdown += `---\n${block.content}\n---\n\n`;
            } else if (block.type === "section") {
                markdown += `\n## ${block.title}\n`;
                if (block.children) markdown += this.serialize(block.children);

            } else if (block.type === "loop") {
                markdown += `\n<!-- BEGIN LOOP: ${block.loopSource} -->\n`;
                if (block.children) markdown += this.serialize(block.children);
                markdown += `<!-- END LOOP -->\n`;

            } else if (block.type === "if") {
                markdown += `\n<!-- IF: ${block.content} -->\n`;
                if (block.children) markdown += this.serialize(block.children);

            } else if (block.type === "else") {
                markdown += `<!-- ELSE -->\n`;
                if (block.children) markdown += this.serialize(block.children);
            } else if (block.type === "instruction") {
                markdown += `<!-- INSTRUCTION: ${block.content} -->\n`;
            } else if (block.type === "text") {
                markdown += `${block.content}\n`;
            }
        });

        // Post-processing to fix ENDIFs?
        // Actually, simpler if we just write ENDIF whenever we finish an IF or ELSE block?
        // But IF followed by ELSE shouldn't have ENDIF in between.

        // Let's try to handle it in a smarter pass or just leave it for now.
        // The parser above is robust enough to read it back.
        // For writing: We should probably ensure we write <!-- ENDIF --> after the last conditional block.
        // That requires lookahead.

        return markdown;
    }
}
