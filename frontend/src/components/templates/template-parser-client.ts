
export interface TemplateBlock {
    id: string;
    type: "section" | "instruction" | "loop" | "text";
    title?: string; // For sections
    content?: string; // For instructions
    loopSource?: string; // For loops
    children?: TemplateBlock[]; // Nested blocks (e.g. inside sections or loops)
}

export class TemplateParserClient {
    /**
     * Parse markdown content into structured blocks for the builder.
     * This is a simplified parser strictly for the builder UI.
     */
    static parse(markdown: string): TemplateBlock[] {
        const lines = markdown.split('\n');
        const blocks: TemplateBlock[] = [];
        let currentSection: TemplateBlock | null = null;
        let currentLoop: TemplateBlock | null = null;

        // Regex
        const instructionRegex = /<!--\s*INSTRUCTION:\s*(.*?)\s*-->/i;
        const beginLoopRegex = /<!--\s*BEGIN LOOP:\s*(.*?)\s*-->/i;
        const endLoopRegex = /<!--\s*END LOOP\s*-->/i;
        const headerRegex = /^(#{1,6})\s+(.*)/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // 1. Loop Start
            const loopStartMatch = line.match(beginLoopRegex);
            if (loopStartMatch) {
                const newLoop: TemplateBlock = {
                    id: crypto.randomUUID(),
                    type: "loop",
                    loopSource: loopStartMatch[1].trim(),
                    children: []
                };

                // Add to current context (Section or Root)
                if (currentSection) {
                    currentSection.children?.push(newLoop);
                } else {
                    blocks.push(newLoop);
                }

                // Switch context to loop? 
                // For simple builder, let's treat loop as a block. 
                // But wait, loops contain things.
                // We need a stack or recursive approach for true nesting.
                // Let's stick to a flat-ish structure for V1 if possible, or handle 1 level of nesting.
                // To keep it robust, let's just make it a block that "contains" subsequent items until END LOOP?
                // Actually, for the UI builder, visual hierarchical nesting is best.

                currentLoop = newLoop;
                continue;
            }

            // 2. Loop End
            if (endLoopRegex.test(line)) {
                currentLoop = null; // Close loop context
                continue;
            }

            // 3. Instruction
            const instructionMatch = line.match(instructionRegex);
            if (instructionMatch) {
                const instruction: TemplateBlock = {
                    id: crypto.randomUUID(),
                    type: "instruction",
                    content: instructionMatch[1].trim()
                };

                if (currentLoop) {
                    currentLoop.children?.push(instruction);
                } else if (currentSection) {
                    currentSection.children?.push(instruction);
                } else {
                    blocks.push(instruction);
                }
                continue;
            }

            // 4. Section (Header)
            const headerMatch = line.match(headerRegex);
            if (headerMatch) {
                // If we hit a new header, close the previous section context??
                // Markdown is flat, but logically tree-like. 
                // For the builder, a "Section" block usually contains the items under it until the next section.

                const newSection: TemplateBlock = {
                    id: crypto.randomUUID(),
                    type: "section",
                    title: headerMatch[2].trim(),
                    children: []
                };

                blocks.push(newSection);
                currentSection = newSection;
                currentLoop = null; // Headers break loops usually? Or should we support loops with headers? 
                // Let's assume headers allow breaking context.
                continue;
            }

            // 5. Generic Content (Text)
            // Capture any other non-empty lines as text content to preserve them.
            if (line) {
                const textBlock: TemplateBlock = {
                    id: crypto.randomUUID(),
                    type: "text",
                    content: line
                };

                if (currentLoop) {
                    currentLoop.children?.push(textBlock);
                } else if (currentSection) {
                    currentSection.children?.push(textBlock);
                } else {
                    blocks.push(textBlock);
                }
            }
        }

        return blocks;
    }

    /**
     * Serialize blocks back to Markdown
     */
    static serialize(blocks: TemplateBlock[]): string {
        let markdown = "";

        blocks.forEach(block => {
            if (block.type === "section") {
                markdown += `\n## ${block.title}\n`;
                if (block.children) {
                    markdown += this.serialize(block.children);
                }
            } else if (block.type === "loop") {
                markdown += `\n<!-- BEGIN LOOP: ${block.loopSource} -->\n`;
                if (block.children) {
                    markdown += this.serialize(block.children);
                }
                markdown += `<!-- END LOOP -->\n`;
            } else if (block.type === "instruction") {
                markdown += `<!-- INSTRUCTION: ${block.content} -->\n`;
            } else if (block.type === "text") {
                markdown += `${block.content}\n`;
            }
        });

        return markdown;
    }
}
