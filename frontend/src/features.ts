/**
 * Feature Flags Configuration
 * 
 * Use this file to toggle features on and off for this specific application instance.
 * By using feature flags instead of deleting code, you can easily pull updates from the
 * origin/upstream repository without causing massive merge conflicts. New features can 
 * be added here and defaulted to false if you do not want them active immediately.
 */
export const FEATURES = {
    // Set to false to disable all workflow-related features in the UI
    // To enable, either do not set the env variable (defaults to true), or set it to 'true'. To disable, set NEXT_PUBLIC_ENABLE_WORKFLOWS='false'
    enableWorkflows: process.env.NEXT_PUBLIC_ENABLE_WORKFLOWS !== 'false',
    enableAgents: process.env.NEXT_PUBLIC_ENABLE_AGENTS !== 'false',
    enableKnowledgeBase: process.env.NEXT_PUBLIC_ENABLE_KNOWLEDGE_BASE !== 'false',
    enableRAG: process.env.NEXT_PUBLIC_ENABLE_RAG !== 'false',
    enableSpeech: process.env.NEXT_PUBLIC_ENABLE_SPEECH !== 'false',
    enableOCR: process.env.NEXT_PUBLIC_ENABLE_OCR !== 'false',
    enableSlideshow: process.env.NEXT_PUBLIC_ENABLE_SLIDESHOW !== 'false',
    enableArchimate: process.env.NEXT_PUBLIC_ENABLE_ARCHIMATE !== 'false',
    enableSmartTemplates: process.env.NEXT_PUBLIC_ENABLE_SMART_TEMPLATES !== 'false',
    enableFormsAndSheets: process.env.NEXT_PUBLIC_ENABLE_FORMS_AND_SHEETS !== 'false',
    enableArchitectureTools: process.env.NEXT_PUBLIC_ENABLE_ARCHITECTURE_TOOLS !== 'false',
    enableWopi: process.env.NEXT_PUBLIC_ENABLE_WOPI !== 'false',
};
