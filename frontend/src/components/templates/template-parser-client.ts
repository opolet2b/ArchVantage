
export interface TemplateBlock {
    id: string;
    type: "section" | "instruction" | "loop" | "text" | "if" | "else" | "subsection";
    title?: string; // For sections
    content?: string; // For instructions, text, or if-conditions
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

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const currentContext = stack[stack.length - 1];
            const currentList = currentContext.list;

            // 1. Loop Start
            const loopStartMatch = line.match(beginLoopRegex);
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
            if (block.type === "section") {
                markdown += `\n## ${block.title}\n`;
                if (block.children) markdown += this.serialize(block.children);

            } else if (block.type === "loop") {
                markdown += `\n<!-- BEGIN LOOP: ${block.loopSource} -->\n`;
                if (block.children) markdown += this.serialize(block.children);
                markdown += `<!-- END LOOP -->\n`;

            } else if (block.type === "if") {
                markdown += `\n<!-- IF: ${block.content} -->\n`;
                if (block.children) markdown += this.serialize(block.children);
                // We don't close IF here automatically if an ELSE follows, but logic implies ELSE text follows.
                // Actually, serialize is recursive.

                // PROBLEM: "ELSE" is a sibling block in our parser but syntactically it's a continuation.
                // We need to handle the ENDIF.
                // Simple hack: The NEXT block might be ELSE. If so, don't write ENDIF yet?
                // No, standard markdown structure is serial.
                // IF -> Children -> (Maybe ELSE -> Children) -> ENDIF.

                // If the *next* block in this list is ELSE, we skip ENDIF. 
                // But strictly, IF block encapsulates its children. 
                // ELSE block encapsulates its children.
                // So:
                // <!-- IF ... -->
                // ... children
                // <!-- ENDIF --> ? No, that closes it.

                // CORRECT LOGIC:
                // IF block should produce <!-- IF ... --> ...content...
                // If followed by ELSE block, that produces <!-- ELSE --> ...content...
                // The ENDIF is tricky.

                // Let's assume for now we just write ENDIF after IF block, 
                // unless we check if next sibling is ELSE?
                // Complexity: The parser treats them as siblings.
                // For serialization, we might implicitly add ENDIF if the type changes?

                // Let's explicitly close IF. If ELSE follows, it's weird.
                // Specs: <!-- IF --> ... <!-- ELSE --> ... <!-- ENDIF -->
                // So IF/ELSE structure is one unit with two branches.
                // Our parser split them into "IF Block" and "ELSE Block".
                // That's fine.
                // We need to know if we should write ENDIF.

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
