import React from 'react';
import { NodeProps } from 'reactflow';

export interface PluginRegistryItem {
    type: string;
    ViewerComponent: React.ComponentType<any>;
}

class PluginRegistry {
    private viewers: Record<string, React.ComponentType<any>> = {};

    registerPlugin(plugin: PluginRegistryItem) {
        console.log(`[PluginRegistry] Registered frontend plugin for: ${plugin.type}`);
        this.viewers[plugin.type] = plugin.ViewerComponent;
    }

    getViewer(type: string): React.ComponentType<any> | undefined {
        return this.viewers[type];
    }
}

export const canvasPluginRegistry = new PluginRegistry();
