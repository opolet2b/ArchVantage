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
    enableWorkflows: import.meta.env.VITE_ENABLE_WORKFLOWS !== 'true' && false,
};
