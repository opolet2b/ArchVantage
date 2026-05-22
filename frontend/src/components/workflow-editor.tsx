"use client"

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    BackgroundVariant,
    Connection,
    Edge,
    Node,
    Handle,
    Position,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { 
    Play, 
    Square, 
    Bot, 
    User, 
    Split, 
    Plus, 
    Layers, 
    Save, 
    FileCode, 
    AlertCircle, 
    CheckCircle2, 
    Settings, 
    Search,
    ChevronRight,
    HelpCircle,
    Activity,
    Users,
    GripVertical,
    ArrowUp,
    ArrowDown,
    ShieldCheck,
    X,
    TriangleAlert,
    Trash2
} from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HelpTooltip } from "@/components/ui/help-tooltip"
import { API_URL } from "@/lib/utils"

// =============================================================================
// Interface Types
// =============================================================================

interface BlueprintItem {
    id: string
    name: string
    description: string | null
}

interface RoleItem {
    id: number
    name: string
}

interface TemplateItem {
    id: string
    name: string
    description: string | null
    bpmn_json: any
}

/** Shared data shape for all BPMN node types. Index signature allows arbitrary fields. */
interface NodeData extends Record<string, any> {
    label?: string
    roles?: string[]
    users?: string[]
    laneIndex?: number
    totalLanes?: number
    currentHeight?: number
    currentWidth?: number
    actionsRef?: React.MutableRefObject<any>
    blueprint_id?: string
    blueprint_name?: string
    inputs?: Record<string, any>
    output_mapping?: Record<string, any>
    form_tool_name?: string
    gui_schema?: Record<string, any>
    assigned_roles?: string[]
    assigned_users?: string[]
}

type BPMNNode = Node<NodeData>

// =============================================================================
// Helper Component: Dynamic Form Renderer for step-by-step debugging
// =============================================================================
function renderDynamicForm(
    guiSchema: any, 
    values: Record<string, any>, 
    onChange: (key: string, val: any) => void,
    disabled: boolean = false
) {
    if (!guiSchema) return null;

    // 1. Components List Format (from GUI tool configuration)
    if (Array.isArray(guiSchema.components)) {
        return (
            <div className="flex flex-col gap-2.5">
                {guiSchema.components.map((comp: any) => {
                    const compId = comp.id;
                    const compType = comp.type || "text_input";
                    const label = comp.label || compId;
                    const placeholder = comp.placeholder || "";
                    const required = comp.required || false;
                    const val = values[compId] !== undefined ? values[compId] : (comp.default || "");

                    return (
                        <div key={compId} className="flex flex-col gap-1">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                {label} {required && <span className="text-rose-500">*</span>}
                            </Label>
                            {compType === "text_area" ? (
                                <Textarea
                                    disabled={disabled}
                                    placeholder={placeholder}
                                    value={val}
                                    onChange={(e) => onChange(compId, e.target.value)}
                                    className="bg-slate-900 border-slate-800 text-xs focus:ring-indigo-500 text-slate-100 min-h-[50px] rounded"
                                    rows={2}
                                />
                            ) : compType === "dropdown" || compType === "select" ? (
                                <Select
                                    disabled={disabled}
                                    value={val}
                                    onValueChange={(v) => onChange(compId, v)}
                                >
                                    <SelectTrigger className="bg-slate-900 border-slate-800 text-slate-100 h-8 text-xs rounded">
                                        <SelectValue placeholder={placeholder || "Select option..."} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-950 border-slate-800 text-slate-100">
                                        {(comp.options || []).map((opt: any) => (
                                            <SelectItem key={opt.value} value={opt.value} className="text-xs hover:bg-slate-800">
                                                {opt.label || opt.value}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : compType === "boolean" || compType === "checkbox" ? (
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer py-0.5">
                                    <input
                                        type="checkbox"
                                        disabled={disabled}
                                        checked={!!val}
                                        onChange={(e) => onChange(compId, e.target.checked)}
                                        className="rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                    />
                                    {label}
                                </label>
                            ) : (
                                <Input
                                    disabled={disabled}
                                    type={compType === "number" ? "number" : "text"}
                                    placeholder={placeholder}
                                    value={val}
                                    onChange={(e) => onChange(compId, compType === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
                                    className="bg-slate-900 border-slate-800 text-xs h-8 focus:ring-indigo-500 text-slate-100 rounded"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    // 2. Standard JSON Schema Format
    if (guiSchema.properties) {
        return (
            <div className="flex flex-col gap-2.5">
                {Object.entries(guiSchema.properties).map(([key, valObj]) => {
                    const prop = valObj as any;
                    const label = prop.title || key;
                    const required = Array.isArray(guiSchema.required) && guiSchema.required.includes(key);
                    const propType = prop.type;
                    const val = values[key] !== undefined ? values[key] : "";

                    return (
                        <div key={key} className="flex flex-col gap-1">
                            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                {label} {required && <span className="text-rose-500">*</span>}
                            </Label>
                            {prop.enum ? (
                                <Select
                                    disabled={disabled}
                                    value={val}
                                    onValueChange={(v) => onChange(key, v)}
                                >
                                    <SelectTrigger className="bg-slate-900 border-slate-800 text-slate-100 h-8 text-xs rounded">
                                        <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-955 border-slate-800 text-slate-100">
                                        {prop.enum.map((opt: string) => (
                                            <SelectItem key={opt} value={opt} className="text-xs hover:bg-slate-800">
                                                {opt}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : propType === "boolean" ? (
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer py-0.5">
                                    <input
                                        type="checkbox"
                                        disabled={disabled}
                                        checked={!!val}
                                        onChange={(e) => onChange(key, e.target.checked)}
                                        className="rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                    />
                                    {label}
                                </label>
                            ) : propType === "string" && (key.includes("comment") || key.includes("note") || key.includes("desc")) ? (
                                <Textarea
                                    disabled={disabled}
                                    value={val}
                                    onChange={(e) => onChange(key, e.target.value)}
                                    className="bg-slate-900 border-slate-800 text-xs focus:ring-indigo-500 text-slate-100 min-h-[50px] rounded"
                                    rows={2}
                                />
                            ) : (
                                <Input
                                    disabled={disabled}
                                    type={propType === "number" || propType === "integer" ? "number" : "text"}
                                    value={val}
                                    onChange={(e) => onChange(key, propType === "number" || propType === "integer" ? parseFloat(e.target.value) || 0 : e.target.value)}
                                    className="bg-slate-900 border-slate-800 text-xs h-8 focus:ring-indigo-500 text-slate-100 rounded"
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    return null;
}

// =============================================================================
// Styled BPMN Node Components for React Flow
// =============================================================================

const StartNode = ({ data }: any) => (
    <div className="flex flex-col items-center justify-center p-3 rounded-full border-2 border-emerald-500 bg-white/90 dark:bg-slate-900/90 shadow-[0_0_15px_rgba(16,185,129,0.2)] backdrop-blur-md transition-all duration-300 hover:scale-105 select-none w-14 h-14 relative group">
        <Play className="h-6 w-6 text-emerald-500 fill-emerald-500/20 group-hover:scale-110 transition-transform" />
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-800" />
        <div className="absolute top-16 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shadow whitespace-nowrap">
            {data.label || "Start"}
        </div>
    </div>
)

const EndNode = ({ data }: any) => (
    <div className="flex flex-col items-center justify-center p-3 rounded-full border-2 border-rose-500 bg-white/90 dark:bg-slate-900/90 shadow-[0_0_15px_rgba(244,63,94,0.2)] backdrop-blur-md transition-all duration-300 hover:scale-105 select-none w-14 h-14 relative group">
        <Square className="h-5 w-5 text-rose-500 fill-rose-500/20 group-hover:scale-110 transition-transform" />
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-rose-500 border-2 border-white dark:border-slate-800" />
        <div className="absolute top-16 text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shadow whitespace-nowrap">
            {data.label || "End"}
        </div>
    </div>
)

const ServiceNode = ({ data, selected }: any) => (
    <Card className={`min-w-[220px] max-w-[280px] shadow-lg border-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md transition-all duration-300 ${selected ? "border-purple-500 ring-2 ring-purple-500/30 scale-[1.02]" : "border-purple-200 dark:border-purple-900"} overflow-hidden`}>
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-500 border-2 border-white dark:border-slate-800" />
        <CardHeader className="p-3 pb-2 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Bot className="h-4 w-4" />
                </div>
                <CardTitle className="text-xs font-bold tracking-tight text-slate-800 dark:text-slate-200">{data.label || "Service Task"}</CardTitle>
            </div>
            <Settings className="h-3 w-3 text-slate-400" />
        </CardHeader>
        <CardContent className="p-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <span className="font-semibold">Blueprint:</span>
                <span className="truncate max-w-[120px] text-purple-600 dark:text-purple-400 font-medium">{data.blueprint_name || "None Selected"}</span>
            </div>
            <div className="flex items-center justify-between">
                <span className="font-semibold">Inputs Count:</span>
                <span>{Object.keys(data.inputs || {}).length} variables</span>
            </div>
        </CardContent>
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500 border-2 border-white dark:border-slate-800" />
    </Card>
)

const UserNode = ({ data, selected }: any) => (
    <Card className={`min-w-[220px] max-w-[280px] shadow-lg border-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md transition-all duration-300 ${selected ? "border-amber-500 ring-2 ring-amber-500/30 scale-[1.02]" : "border-amber-200 dark:border-amber-900"} overflow-hidden`}>
        <Handle type="target" position={Position.Left} className="w-3 h-3 bg-amber-500 border-2 border-white dark:border-slate-800" />
        <CardHeader className="p-3 pb-2 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-amber-500/10 to-orange-500/10 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <User className="h-4 w-4" />
                </div>
                <CardTitle className="text-xs font-bold tracking-tight text-slate-800 dark:text-slate-200">{data.label || "User Task"}</CardTitle>
            </div>
            <Settings className="h-3 w-3 text-slate-400" />
        </CardHeader>
        <CardContent className="p-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <span className="font-semibold">Form:</span>
                <span className="truncate max-w-[120px] text-amber-600 dark:text-amber-400 font-medium">{data.form_tool_name || "Approval Default"}</span>
            </div>
            {data.assigned_roles && data.assigned_roles.length > 0 && (
                <div className="flex items-center justify-between mt-1">
                    <span className="font-semibold">Roles:</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 font-semibold">{data.assigned_roles.join(", ")}</span>
                </div>
            )}
        </CardContent>
        <Handle type="source" position={Position.Right} className="w-3 h-3 bg-amber-500 border-2 border-white dark:border-slate-800" />
    </Card>
)

const XORNode = ({ data, selected }: any) => (
    /*
     * Two-layer structure to correctly place handles at the diamond tips:
     *
     *  Outer div  = 80×80px transparent wrapper
     *             = the visual bounding box of a 56px square rotated 45°
     *               (56 × √2 ≈ 79.2px, rounded to 80)
     *  Inner div  = 56×56px rotated 45° — the visual diamond shape
     *
     * React Flow's Position.Left on the OUTER div hits (x=0, y=40),
     * which aligns with the inner diamond's left tip at (0.4, 40). ✓
     * Same logic for Position.Right → right tip. ✓
     */
    <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
        {/* Visual diamond */}
        <div className={`w-14 h-14 rotate-45 border-2 ${
            selected
                ? "border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.4)] bg-yellow-500/10"
                : "border-yellow-400 dark:border-yellow-600 bg-white dark:bg-slate-900"
        } rounded-lg flex items-center justify-center backdrop-blur-md transition-all duration-300 select-none`}>
            <div className="-rotate-45">
                <Split className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
        </div>

        {/* Handles on outer wrapper — left tip = target (IN), right tip = source (OUT) */}
        <Handle
            type="target"
            position={Position.Left}
            className="w-3 h-3 bg-yellow-500 border-2 border-white dark:border-slate-800 rounded-full"
        />
        <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-yellow-500 border-2 border-white dark:border-slate-800 rounded-full"
        />

        {/* Label below the diamond — no rotation needed since outer wrapper is not rotated */}
        <div
            className="absolute text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none"
            style={{ top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }}
        >
            {data.label || "XOR Gateway"}
        </div>
    </div>
)

const ANDNode = ({ data, selected }: any) => (
    /*
     * Same two-layer technique as XORNode.
     * Outer 80×80 wrapper → inner 56×56 rotated diamond.
     */
    <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
        {/* Visual diamond */}
        <div className={`w-14 h-14 rotate-45 border-2 ${
            selected
                ? "border-sky-500 shadow-[0_0_20px_rgba(14,165,233,0.4)] bg-sky-500/10"
                : "border-sky-400 dark:border-sky-600 bg-white dark:bg-slate-900"
        } rounded-lg flex items-center justify-center backdrop-blur-md transition-all duration-300 select-none`}>
            <div className="-rotate-45">
                <Plus className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>
        </div>

        {/* Handles on outer wrapper — left tip = target (IN), right tip = source (OUT) */}
        <Handle
            type="target"
            position={Position.Left}
            className="w-3 h-3 bg-sky-500 border-2 border-white dark:border-slate-800 rounded-full"
        />
        <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-sky-500 border-2 border-white dark:border-slate-800 rounded-full"
        />

        {/* Label below the diamond */}
        <div
            className="absolute text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded shadow whitespace-nowrap pointer-events-none"
            style={{ top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }}
        >
            {data.label || "AND Gateway"}
        </div>
    </div>
)

// =============================================================================
// Swimlane Layout Constants & Accent Colors
// =============================================================================

const LANE_DEFAULT_WIDTH = 1200
const LANE_DEFAULT_HEIGHT = 220
const LANE_STRIPE_WIDTH = 44

const LANE_ACCENT_COLORS = [
    { stripe: "from-indigo-600 to-indigo-500", text: "text-indigo-200", badge: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30", headerBg: "bg-indigo-500/5" },
    { stripe: "from-emerald-600 to-emerald-500", text: "text-emerald-200", badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", headerBg: "bg-emerald-500/5" },
    { stripe: "from-amber-600 to-amber-500", text: "text-amber-200", badge: "bg-amber-500/20 text-amber-300 border-amber-500/30", headerBg: "bg-amber-500/5" },
    { stripe: "from-rose-600 to-rose-500", text: "text-rose-200", badge: "bg-rose-500/20 text-rose-300 border-rose-500/30", headerBg: "bg-rose-500/5" },
    { stripe: "from-cyan-600 to-cyan-500", text: "text-cyan-200", badge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30", headerBg: "bg-cyan-500/5" },
    { stripe: "from-purple-600 to-purple-500", text: "text-purple-200", badge: "bg-purple-500/20 text-purple-300 border-purple-500/30", headerBg: "bg-purple-500/5" },
]

/**
 * Module-level singleton that holds the live action callbacks from WorkflowEditor.
 * Stored here (not in node data) so React Flow's node data cloning cannot detach it.
 */
const LANE_ACTIONS: {
    resizeHeight: (laneId: string, newHeight: number) => void
    resizeWidth: (newWidth: number) => void
    moveUp: (laneId: string) => void
    moveDown: (laneId: string) => void
    reorder: (draggedId: string, targetId: string) => void
} = {
    resizeHeight: () => {},
    resizeWidth: () => {},
    moveUp: () => {},
    moveDown: () => {},
    reorder: () => {},
}

/**
 * Recomputes lane y-positions to enforce vertical stacking.
 * Synchronizes width across all lanes and injects layout metadata
 * into each lane node's data for the LaneNode component.
 */
function applyLaneLayout(
    nodes: Node[],
    order: string[],
): Node[] {
    const laneNodes = nodes.filter((n) => n.type === "lane")
    if (laneNodes.length === 0 || order.length === 0) return nodes

    // Shared width from the first lane (all lanes keep synchronized width)
    const sharedWidth = (laneNodes[0]?.style?.width as number) || LANE_DEFAULT_WIDTH

    // Compute vertical positions by summing heights in order
    let currentY = 0
    const layout: Record<string, { y: number; height: number; index: number }> = {}

    order.forEach((laneId, idx) => {
        const lane = laneNodes.find((n) => n.id === laneId)
        const height = (lane?.style?.height as number) || LANE_DEFAULT_HEIGHT
        layout[laneId] = { y: currentY, height, index: idx }
        currentY += height
    })

    const updated = nodes.map((n) => {
        if (n.type === "lane" && layout[n.id]) {
            const { y, height, index } = layout[n.id]
            return {
                ...n,
                position: { x: 0, y },
                draggable: false,
                selectable: true,
                style: { ...n.style, width: sharedWidth, height, zIndex: -1 },
                data: {
                    ...n.data,
                    laneIndex: index,
                    totalLanes: order.length,
                    currentHeight: height,
                    currentWidth: sharedWidth,
                    // NOTE: actionsRef intentionally NOT stored in data.
                    // LaneNode reads from the module-level LANE_ACTIONS singleton instead.
                },
            }
        }
        return n
    })

    // Ensure lane nodes come first (React Flow requires parent before children)
    const lanes = updated.filter((n) => n.type === "lane")
    const others = updated.filter((n) => n.type !== "lane")
    return [...lanes, ...others]
}

// =============================================================================
// Interactive Swimlane Node Component
//
// Features:
//   1. Left accent stripe with rotated lane name (BPMN style)
//   2. Header bar with role badges and reorder controls
//   3. Bottom drag handle for individual height resize
//   4. Right drag handle for synced width resize across all lanes
//   5. Drag-and-drop reorder via grip handle in header
//   6. Child nodes (parentId) move with the lane automatically
// =============================================================================

const LaneNode = ({ id, data, selected }: any) => {
    const colorIdx = data.laneIndex ?? 0
    const accent = LANE_ACCENT_COLORS[colorIdx % LANE_ACCENT_COLORS.length]

    /**
     * Pointer-based height resize.
     * Uses onPointerDown + nativeEvent.stopImmediatePropagation() to escape
     * React Flow's pointer-capture handler which would otherwise swallow the event.
     * Reads current dimensions from data (injected by applyLaneLayout).
     */
    const handleHeightResizeStart = useCallback(
        (e: React.PointerEvent) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            e.preventDefault()
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

            const startY = e.clientY
            const startHeight = data.currentHeight || LANE_DEFAULT_HEIGHT

            const onMove = (ev: PointerEvent) => {
                const delta = ev.clientY - startY
                const newHeight = Math.max(120, startHeight + delta)
                LANE_ACTIONS.resizeHeight(id, newHeight)
            }
            const onUp = (ev: PointerEvent) => {
                ;(e.target as HTMLElement).releasePointerCapture(ev.pointerId)
                window.removeEventListener("pointermove", onMove)
                window.removeEventListener("pointerup", onUp)
            }
            window.addEventListener("pointermove", onMove)
            window.addEventListener("pointerup", onUp)
        },
        [id, data.currentHeight]
    )

    /**
     * Pointer-based width resize (synchronized across ALL lanes).
     */
    const handleWidthResizeStart = useCallback(
        (e: React.PointerEvent) => {
            e.stopPropagation()
            e.nativeEvent.stopImmediatePropagation()
            e.preventDefault()
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

            const startX = e.clientX
            const startWidth = data.currentWidth || LANE_DEFAULT_WIDTH

            const onMove = (ev: PointerEvent) => {
                const delta = ev.clientX - startX
                const newWidth = Math.max(600, startWidth + delta)
                LANE_ACTIONS.resizeWidth(newWidth)
            }
            const onUp = (ev: PointerEvent) => {
                ;(e.target as HTMLElement).releasePointerCapture(ev.pointerId)
                window.removeEventListener("pointermove", onMove)
                window.removeEventListener("pointerup", onUp)
            }
            window.addEventListener("pointermove", onMove)
            window.addEventListener("pointerup", onUp)
        },
        [data.currentWidth]
    )

    // HTML5 drag-and-drop for lane reordering
    const handleDragStart = useCallback(
        (e: React.DragEvent) => {
            e.dataTransfer.setData("application/workflow-lane-id", id)
            e.dataTransfer.effectAllowed = "move"
        },
        [id]
    )

    const handleDragOver = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("application/workflow-lane-id")) {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
        }
    }, [])

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            const draggedLaneId = e.dataTransfer.getData("application/workflow-lane-id")
            if (draggedLaneId && draggedLaneId !== id) {
                LANE_ACTIONS.reorder(draggedLaneId, id)
            }
        },
        [id]
    )

    return (
        <div
            className={`w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-200 select-none ${
                selected
                    ? "border-slate-400 shadow-[0_0_20px_rgba(100,116,139,0.15)]"
                    : "border-slate-700/50"
            }`}
            style={{ background: "rgba(15,23,42,0.3)" }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Left accent stripe with rotated lane name */}
            <div
                className={`absolute left-0 top-0 bottom-0 bg-gradient-to-b ${accent.stripe} flex items-center justify-center rounded-l-xl`}
                style={{ width: LANE_STRIPE_WIDTH }}
            >
                <span
                    className={`${accent.text} text-[11px] font-extrabold uppercase tracking-[0.2em] whitespace-nowrap`}
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                    {data.label || "Actor Lane"}
                </span>
            </div>

            {/* Top header bar with controls */}
            <div
                className={`flex items-center gap-2 ${accent.headerBg} border-b border-slate-700/30`}
                style={{
                    marginLeft: LANE_STRIPE_WIDTH,
                    height: 36,
                    paddingLeft: 8,
                    paddingRight: 8,
                }}
            >
                {/* Drag grip for reordering — nodrag prevents React Flow from treating this as a node drag */}
                <div
                    draggable
                    onDragStart={handleDragStart}
                    className="nodrag cursor-grab active:cursor-grabbing p-1 hover:bg-slate-600/40 rounded transition-colors pointer-events-auto"
                    title="Drag to reorder swimlane"
                >
                    <GripVertical className="h-3.5 w-3.5 text-slate-500" />
                </div>

                {/* Role badges */}
                <div className="flex items-center gap-1.5 flex-1 overflow-hidden pointer-events-none">
                    <Users className="h-3 w-3 text-slate-500 shrink-0" />
                    {(data.roles || []).map((role: string) => (
                        <span
                            key={role}
                            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${accent.badge}`}
                        >
                            {role}
                        </span>
                    ))}
                    {(data.users || []).length > 0 && (
                        <span className="text-[9px] text-slate-500 font-medium ml-1">
                            +{data.users.length} user(s)
                        </span>
                    )}
                    {(!data.roles || data.roles.length === 0) &&
                        (!data.users || data.users.length === 0) && (
                            <span className="text-[9px] text-slate-600 italic">
                                No roles assigned
                            </span>
                        )}
                </div>

                {/* Reorder buttons — nodrag prevents React Flow interference */}
                <div className="nodrag flex items-center gap-0.5 shrink-0 pointer-events-auto">
                    <button
                        onClick={(e) => { e.stopPropagation(); LANE_ACTIONS.moveUp(id) }}
                        className="p-1 hover:bg-slate-600/40 rounded text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        disabled={data.laneIndex === 0}
                        title="Move lane up"
                    >
                        <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); LANE_ACTIONS.moveDown(id) }}
                        className="p-1 hover:bg-slate-600/40 rounded text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                        disabled={data.laneIndex === (data.totalLanes || 1) - 1}
                        title="Move lane down"
                    >
                        <ArrowDown className="h-3 w-3" />
                    </button>
                </div>
            </div>

            {/*
              * Bottom resize handle — height resize (individual per lane).
              * nodrag: tells React Flow to ignore this as a drag initiator.
              * onPointerDown + stopImmediatePropagation: escapes RF pointer capture.
              */}
            <div
                className="nodrag absolute bottom-0 left-0 right-0 h-3 cursor-row-resize hover:bg-white/10 active:bg-white/20 transition-colors pointer-events-auto group flex items-center justify-center"
                onPointerDown={handleHeightResizeStart}
                title="Drag to resize lane height"
            >
                <div className="w-16 h-0.5 bg-slate-600 rounded-full group-hover:bg-slate-400 transition-colors" />
            </div>

            {/*
              * Right resize handle — width resize (synced across all lanes).
              * Same escape mechanism as height handle above.
              */}
            <div
                className="nodrag absolute top-0 right-0 bottom-0 w-3 cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors pointer-events-auto flex items-center justify-center"
                onPointerDown={handleWidthResizeStart}
                title="Drag to resize all lanes width"
            >
                <div className="h-16 w-0.5 bg-slate-600 rounded-full group-hover:bg-slate-400 transition-colors" />
            </div>
        </div>
    )
}

const nodeTypes = {
    start: StartNode,
    end: EndNode,
    service_task: ServiceNode,
    user_task: UserNode,
    xor_gateway: XORNode,
    and_gateway: ANDNode,
    lane: LaneNode,
}

// =============================================================================
// Core Visual Workflow Editor Component
// =============================================================================

export function WorkflowEditor() {
    // 1. Flow canvas State variables
    const [nodes, setNodes, onNodesChange] = useNodesState<BPMNNode>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [selectedNode, setSelectedNode] = useState<BPMNNode | null>(null)

    // 2. Integration Lists
    const [blueprints, setBlueprints] = useState<BlueprintItem[]>([])
    const [roles, setRoles] = useState<RoleItem[]>([])
    const [templates, setTemplates] = useState<TemplateItem[]>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
    const [guiTools, setGuiTools] = useState<any[]>([])
    const [debugFormValues, setDebugFormValues] = useState<Record<string, any>>({})
    const [debugActiveGuiSchema, setDebugActiveGuiSchema] = useState<any | null>(null)

    // 3. Modals and Settings State
    const [templateName, setTemplateName] = useState("")
    const [templateDescription, setTemplateDescription] = useState("")
    const [validationReport, setValidationReport] = useState<string[]>([])
    const [validationPassed, setValidationPassed] = useState<boolean | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    // 4. Debug Mode State
    const [isDebugMode, setIsDebugMode] = useState(false)
    const [debugInstanceId, setDebugInstanceId] = useState<string | null>(null)
    const [debugStatus, setDebugStatus] = useState<string | null>(null)
    const [debugActiveNodes, setDebugActiveNodes] = useState<string[]>([])
    const [debugPayload, setDebugPayload] = useState<string>('{\n  "document_id": "paste_doc_id_here"\n}')
    const eventSourceRef = useRef<EventSource | null>(null)

    // Cleanup debug SSE on unmount
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
            }
        }
    }, [])

    // =========================================================================
    // Swimlane Layout Management
    // =========================================================================
    const [laneOrder, setLaneOrder] = useState<string[]>([])
    const laneOrderRef = useRef<string[]>([])

    // Keep ref in sync with state (avoids stale closures in ref callbacks)
    useEffect(() => {
        laneOrderRef.current = laneOrder
    }, [laneOrder])

    // =============================================================================
    // API Integrations
    // =============================================================================

    // Fetch lists on load
    useEffect(() => {
        const fetchMetadata = async () => {
            const token = localStorage.getItem("token")
            if (!token) return

            const headers = { Authorization: `Bearer ${token}` }

            try {
                // Fetch blueprints
                const blueprintsRes = await fetch(`${API_URL}/agent-blueprints`, { headers })
                if (blueprintsRes.ok) {
                    const data = await blueprintsRes.json()
                    setBlueprints(data)
                }

                // Fetch roles
                const rolesRes = await fetch(`${API_URL}/roles`, { headers })
                if (rolesRes.ok) {
                    const data = await rolesRes.json()
                    setRoles(data)
                }

                // Fetch existing templates
                const templatesRes = await fetch(`${API_URL}/workflows/templates`, { headers })
                if (templatesRes.ok) {
                    const data = await templatesRes.json()
                    setTemplates(data)
                }

                // Fetch tools and filter GUI form tools
                const toolsRes = await fetch(`${API_URL}/tools`, { headers })
                if (toolsRes.ok) {
                    const data = await toolsRes.json()
                    const filtered = data.filter((t: any) => t.tool_type === "gui" || t.tool_type === "GUI")
                    setGuiTools(filtered)
                }
            } catch (err) {
                console.error("Failed to load backend workflow metadata", err)
            }
        }

        fetchMetadata()
    }, [])

    // Load active template to canvas
    const handleLoadTemplate = async (templateId: string) => {
        if (!templateId) return
        setIsLoading(true)
        setSelectedTemplateId(templateId)

        const token = localStorage.getItem("token")
        const headers = { Authorization: `Bearer ${token}` }

        try {
            const res = await fetch(`${API_URL}/workflows/templates/${templateId}`, { headers })
            if (res.ok) {
                const data = await res.json()
                setTemplateName(data.name)
                setTemplateDescription(data.description || "")

                const bpmn = data.bpmn_json || {}
                const loadedLaneOrder = bpmn.laneOrder || []
                setNodes(bpmn.nodes || [])
                setEdges(bpmn.edges || [])
                setLaneOrder(loadedLaneOrder)
                setSelectedNode(null)
            }
        } catch (err) {
            console.error("Failed to fetch template detail", err)
        } finally {
            setIsLoading(false)
        }
    }

    // Connect node handles
    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    )

    // Detect click selection to load Inspector properties
    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        setSelectedNode(node)
    }, [])

    const onPaneClick = useCallback(() => {
        setSelectedNode(null)
    }, [])

    // =========================================================================
    // Swimlane Actions (exposed to LaneNode via stable ref)
    // =========================================================================

    useEffect(() => {
        // Write live callbacks into the module-level LANE_ACTIONS singleton.
        // This avoids the React Flow node-data cloning problem.
        LANE_ACTIONS.resizeHeight = (laneId: string, newHeight: number) => {
            setNodes((nds) => {
                const updated = nds.map((n) =>
                    n.id === laneId && n.type === "lane"
                        ? { ...n, style: { ...n.style, height: newHeight } }
                        : n
                )
                return applyLaneLayout(updated, laneOrderRef.current)
            })
        }
        LANE_ACTIONS.resizeWidth = (newWidth: number) => {
            setNodes((nds) => {
                const updated = nds.map((n) =>
                    n.type === "lane"
                        ? { ...n, style: { ...n.style, width: newWidth } }
                        : n
                )
                return applyLaneLayout(updated, laneOrderRef.current)
            })
        }
        LANE_ACTIONS.moveUp = (laneId: string) => {
            setLaneOrder((prev) => {
                const idx = prev.indexOf(laneId)
                if (idx <= 0) return prev
                const next = [...prev]
                ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                return next
            })
        }
        LANE_ACTIONS.moveDown = (laneId: string) => {
            setLaneOrder((prev) => {
                const idx = prev.indexOf(laneId)
                if (idx < 0 || idx >= prev.length - 1) return prev
                const next = [...prev]
                ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                return next
            })
        }
        LANE_ACTIONS.reorder = (draggedId: string, targetId: string) => {
            setLaneOrder((prev) => {
                const dragIdx = prev.indexOf(draggedId)
                const targetIdx = prev.indexOf(targetId)
                if (dragIdx < 0 || targetIdx < 0) return prev
                const next = [...prev]
                next.splice(dragIdx, 1)
                next.splice(targetIdx, 0, draggedId)
                return next
            })
        }
    })

    // Recompute lane layout whenever the lane order changes
    useEffect(() => {
        if (laneOrder.length > 0) {
            setNodes((nds) => applyLaneLayout(nds, laneOrder))
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [laneOrder])

    // Wrapped onNodesChange: prevents free-dragging of lane nodes
    const wrappedOnNodesChange = useCallback(
        (changes: any[]) => {
            const filtered = changes.filter((change: any) => {
                // Block position changes on lane nodes (layout-managed)
                if (
                    change.type === "position" &&
                    change.dragging &&
                    change.id?.startsWith("lane_")
                ) {
                    return false
                }
                return true
            })
            onNodesChange(filtered)
        },
        [onNodesChange]
    )

    // Auto-assign nodes to swimlanes on drag stop (sets parentId for grouping)
    const onNodeDragStop = useCallback(
        (_event: React.MouseEvent, draggedNode: Node) => {
            if (draggedNode.type === "lane") return

            setNodes((currentNodes) => {
                const lanes = currentNodes.filter((n) => n.type === "lane")
                if (lanes.length === 0) return currentNodes

                // Compute absolute position of dragged node
                let absX = draggedNode.position.x
                let absY = draggedNode.position.y
                const currentParentId = (draggedNode as any).parentId

                if (currentParentId) {
                    const parent = lanes.find((n) => n.id === currentParentId)
                    if (parent) {
                        absX += parent.position.x
                        absY += parent.position.y
                    }
                }

                // Approximate node center for hit-testing
                const centerX = absX + 100
                const centerY = absY + 40

                // Find which lane contains the center point
                let targetLane: Node | null = null
                for (const lane of lanes) {
                    const laneW = (lane.style?.width as number) || LANE_DEFAULT_WIDTH
                    const laneH = (lane.style?.height as number) || LANE_DEFAULT_HEIGHT

                    if (
                        centerX >= lane.position.x &&
                        centerX <= lane.position.x + laneW &&
                        centerY >= lane.position.y &&
                        centerY <= lane.position.y + laneH
                    ) {
                        targetLane = lane
                        break
                    }
                }

                return currentNodes.map((n) => {
                    if (n.id !== draggedNode.id) return n

                    if (targetLane && targetLane.id !== currentParentId) {
                        // Entering a (different) lane: convert to relative position
                        return {
                            ...n,
                            parentId: targetLane.id,
                            position: {
                                x: absX - targetLane.position.x,
                                y: absY - targetLane.position.y,
                            },
                        }
                    } else if (!targetLane && currentParentId) {
                        // Leaving all lanes: convert back to absolute position
                        const updated = {
                            ...n,
                            position: { x: absX, y: absY },
                        } as any
                        delete updated.parentId
                        return updated
                    }

                    return n
                })
            })
        },
        [setNodes]
    )

    // =============================================================================
    // Visual Node Manipulators
    // =============================================================================

    const handleAddNode = (type: string) => {
        const id = `${type}_${crypto.randomUUID().substring(0, 8)}`
        let label = ""
        let extraData = {}

        switch (type) {
            case "start":
                label = "Start Event"
                break
            case "end":
                label = "End Event"
                break
            case "service_task":
                label = "Analyze Asset"
                extraData = { blueprint_id: "", blueprint_name: "", inputs: {}, output_mapping: {} }
                break
            case "user_task":
                label = "Review Approval"
                extraData = { form_tool_name: "Approval Form", assigned_roles: [], assigned_users: [] }
                break
            case "xor_gateway":
                label = "Route Option"
                break
            case "and_gateway":
                label = "Join Channels"
                break
            case "lane": {
                // Swimlanes stack vertically; compute y offset from existing lanes
                const existingLanes = nodes.filter((n) => n.type === "lane")
                const yOffset = existingLanes.reduce(
                    (sum, l) => sum + ((l.style?.height as number) || LANE_DEFAULT_HEIGHT),
                    0
                )
                const sharedWidth =
                    (existingLanes[0]?.style?.width as number) || LANE_DEFAULT_WIDTH

                const laneNode: Node = {
                    id,
                    type: "lane",
                    position: { x: 0, y: yOffset },
                    draggable: false,
                    data: {
                        label: "Business Department",
                        roles: [],
                        users: [],
                        laneIndex: laneOrder.length,
                        totalLanes: laneOrder.length + 1,
                        currentHeight: LANE_DEFAULT_HEIGHT,
                        currentWidth: sharedWidth,
                    },
                    style: {
                        width: sharedWidth,
                        height: LANE_DEFAULT_HEIGHT,
                        zIndex: -1,
                    },
                }
                setNodes((nds) => [...nds, laneNode])
                setLaneOrder((prev) => [...prev, id])
                return // Early return: lane creation handled separately
            }
        }

        const newNode: Node = {
            id,
            type,
            position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
            data: { label, ...extraData },
        }

        setNodes((nds) => [...nds, newNode])
    }

    const handleDeleteSelected = () => {
        if (!selectedNode) return

        // If deleting a lane, un-parent all child nodes and remove from order
        if (selectedNode.type === "lane") {
            setLaneOrder((prev) => prev.filter((lid) => lid !== selectedNode.id))
            setNodes((nds) => {
                const lane = nds.find((n) => n.id === selectedNode.id)
                return nds
                    .filter((n) => n.id !== selectedNode.id)
                    .map((n) => {
                        if ((n as any).parentId === selectedNode.id && lane) {
                            // Convert child to absolute positioning
                            const updated = {
                                ...n,
                                position: {
                                    x: n.position.x + lane.position.x,
                                    y: n.position.y + lane.position.y,
                                },
                            } as any
                            delete updated.parentId
                            return updated
                        }
                        return n
                    })
            })
        } else {
            setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
        }

        setEdges((eds) =>
            eds.filter(
                (e) =>
                    e.source !== selectedNode.id && e.target !== selectedNode.id
            )
        )
        setSelectedNode(null)
    }

    const handleUpdateNodeData = (nodeId: string, updatedData: any) => {
        setNodes((nds) =>
            nds.map((n) => {
                if (n.id === nodeId) {
                    return { ...n, data: { ...n.data, ...updatedData } }
                }
                return n
            })
        )
        // Sync selected state immediately
        setSelectedNode((prev) => {
            if (prev && prev.id === nodeId) {
                return { ...prev, data: { ...prev.data, ...updatedData } }
            }
            return prev
        })
    }

    // =============================================================================
    // Syntax Validation Checks
    // =============================================================================

    const handleValidateTopology = () => {
        const errors: string[] = []

        // 1. Start Event checks
        const startNodes = nodes.filter((n) => n.type === "start")
        if (startNodes.length === 0) {
            errors.push("Missing Start Event: A workflow must have exactly one Start node.")
        } else if (startNodes.length > 1) {
            errors.push("Duplicate Start Events: Multiple Start nodes are not supported.")
        }

        // 2. End Event checks
        const endNodes = nodes.filter((n) => n.type === "end")
        if (endNodes.length === 0) {
            errors.push("Missing End Event: A workflow must have at least one terminal End node.")
        }

        // 3. Lanes assignments
        const lanes = nodes.filter((n) => n.type === "lane")
        lanes.forEach((lane) => {
            const laneRoles = lane.data.roles || []
            const laneUsers = lane.data.users || []
            if (laneRoles.length === 0 && laneUsers.length === 0) {
                errors.push(`Empty Lane Bounds: Departement Lane '${lane.data.label}' has no assigned roles or users.`)
            }
        })

        // 4. Service Task selection
        const services = nodes.filter((n) => n.type === "service_task")
        services.forEach((srv) => {
            if (!srv.data.blueprint_id) {
                errors.push(`Unconfigured Service Task: '${srv.data.label}' is missing an Agent Blueprint link.`)
            }
        })

        // 5. Dangling paths (Dangling nodes checks)
        nodes.forEach((node) => {
            if (node.type === "lane") return

            const hasIncoming = edges.some((e) => e.target === node.id)
            const hasOutgoing = edges.some((e) => e.source === node.id)

            if (node.type === "start" && !hasOutgoing) {
                errors.push(`Dangling Start: Start Event is not connected to any downstream nodes.`)
            } else if (node.type === "end" && !hasIncoming) {
                errors.push(`Isolated End: End Event has no incoming sequence paths.`)
            } else if (node.type !== "start" && node.type !== "end") {
                if (!hasIncoming && !hasOutgoing) {
                    errors.push(`Isolated Task: Node '${node.data.label}' is completely disconnected.`)
                } else if (!hasIncoming) {
                    errors.push(`Unreachable Task: Node '${node.data.label}' has no incoming path.`)
                } else if (!hasOutgoing) {
                    errors.push(`Dead End: Task '${node.data.label}' has no outgoing route to End Event.`)
                }
            }
        })

        // 6. Cyclic Loops & Graph Traversal Checks
        const visited = new Set<string>()
        const stack = new Set<string>()
        let hasLoop = false

        const dfs = (nodeId: string) => {
            if (stack.has(nodeId)) {
                hasLoop = true
                return
            }
            if (visited.has(nodeId)) return

            visited.add(nodeId)
            stack.add(nodeId)

            const neighbors = edges.filter((e) => e.source === nodeId).map((e) => e.target)
            neighbors.forEach((nxt) => dfs(nxt))

            stack.delete(nodeId)
        }

        if (startNodes.length === 1) {
            dfs(startNodes[0].id)
            if (hasLoop) {
                errors.push("Cyclic Loop Detected: Unresolved infinite loop loop path found in workflow sequence.")
            }
        }

        setValidationReport(errors)
        setValidationPassed(errors.length === 0)
        return errors.length === 0
    }

    // =============================================================================
    // Saving Flow Templates
    // =============================================================================

    const handleSaveTemplate = async () => {
        if (!templateName.trim()) {
            setValidationReport(["Validation Error: Please provide a name for the workflow template."])
            return
        }

        // Run validation checks
        const isValid = handleValidateTopology()
        if (!isValid) {
            // Keep validation report modal visible
            return
        }

        setIsSaving(true)
        const token = localStorage.getItem("token")
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }

        const payload = {
            name: templateName,
            description: templateDescription,
            bpmn_json: {
                nodes,
                edges,
                laneOrder
            }
        }

        try {
            const res = await fetch(`${API_URL}/workflows/templates`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            })

            if (res.ok) {
                const saved = await res.json()
                // Refresh template list
                const templatesRes = await fetch(`${API_URL}/workflows/templates`, { headers })
                if (templatesRes.ok) {
                    const data = await templatesRes.json()
                    setTemplates(data)
                }
                setSelectedTemplateId(saved.id)
                setValidationReport(["Workflow template successfully published and saved!"])
            } else {
                const err = await res.json()
                setValidationReport([`Error saving template: ${err.detail || "Server error"}`])
            }
        } catch (err) {
            console.error("Failed to save template", err)
            setValidationReport(["Error: Network failure while saving template."])
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteTemplate = async () => {
        if (!selectedTemplateId) return
        if (!window.confirm("Are you sure you want to delete this workflow template? This action cannot be undone.")) return

        const token = localStorage.getItem("token")
        const headers = { Authorization: `Bearer ${token}` }

        try {
            const res = await fetch(`${API_URL}/workflows/templates/${selectedTemplateId}`, {
                method: "DELETE",
                headers
            })

            if (res.ok) {
                // Refresh template list
                const templatesRes = await fetch(`${API_URL}/workflows/templates`, { headers })
                if (templatesRes.ok) {
                    const data = await templatesRes.json()
                    setTemplates(data)
                }
                // Clear active selection
                setSelectedTemplateId("")
                setTemplateName("New Automation Workflow")
                setTemplateDescription("")
                setNodes([])
                setEdges([])
                setValidationReport(["Workflow template successfully deleted."])
            } else {
                setValidationReport(["Error deleting template."])
            }
        } catch (err) {
            console.error("Failed to delete template", err)
            setValidationReport(["Error: Network failure while deleting template."])
        }
    }

    // =============================================================================
    // Debug & Step-by-Step Testing
    // =============================================================================

    const connectDebugSSE = (instanceId: string) => {
        const token = localStorage.getItem("token")
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
        }
        eventSourceRef.current = new EventSource(`${API_URL}/workflows/instances/${instanceId}/stream?token=${token}`)
        eventSourceRef.current.onmessage = (event) => {
            try {
                const eventData = JSON.parse(event.data)
                if (eventData.type === "status") {
                    setDebugStatus(eventData.status)
                    setDebugActiveNodes(eventData.current_node_ids || [])
                    setDebugActiveGuiSchema(eventData.gui_schema || null)
                    
                    if (eventData.status === "COMPLETED" || eventData.status === "FAILED") {
                        if (eventSourceRef.current) {
                            eventSourceRef.current.close()
                        }
                    }
                } else if (eventData.type === "error") {
                    setDebugStatus("FAILED")
                    if (eventSourceRef.current) {
                        eventSourceRef.current.close()
                    }
                }
            } catch (e) {}
        }
        eventSourceRef.current.onerror = () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close()
            }
        }
    }

    const handleStartDebug = async () => {
        if (!selectedTemplateId) {
            alert("Please save and publish the template first before debugging.")
            return
        }
        try {
            let payloadObj = {}
            try {
                payloadObj = JSON.parse(debugPayload)
            } catch (e) {
                alert("Invalid JSON in Initial Payload")
                return
            }

            const token = localStorage.getItem("token")
            const res = await fetch(`${API_URL}/workflows/instances/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    template_id: selectedTemplateId,
                    canvas_id: "debug_canvas", // Dummy canvas
                    initial_payload: payloadObj,
                    is_debug: true
                })
            })
            if (res.ok) {
                const data = await res.json()
                setDebugFormValues({})
                setDebugActiveGuiSchema(null)
                setDebugInstanceId(data.id)
                setDebugStatus(data.status)
                setDebugActiveNodes(data.current_node_ids || [])
                connectDebugSSE(data.id)
            } else {
                alert("Failed to start debug workflow")
            }
        } catch (err) {
            console.error(err)
            alert("Error starting debug workflow")
        }
    }

    const handleStepForward = async () => {
        if (!debugInstanceId) return
        const token = localStorage.getItem("token")
        try {
            // Provide the form values entered by the user during debugging
            await fetch(`${API_URL}/workflows/instances/${debugInstanceId}/resume`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ form_data: debugFormValues })
            })
            setDebugFormValues({})
            setDebugActiveGuiSchema(null)
        } catch (err) {
            console.error(err)
        }
    }

    // =============================================================================
    // Visual Render Views
    // =============================================================================

    return (
        <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-950 text-slate-100 font-sans">
            {/* 1. Left Tool Palette / Templates Explorer */}
            <div className="w-80 border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col shrink-0">
                <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-indigo-500 animate-pulse" />
                            <span className="font-extrabold text-sm uppercase tracking-wider bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Workflow Modeler</span>
                        </div>
                        <HelpTooltip contentPath="workflow/editor_overview" />
                    </div>

                    {/* Template Loader */}
                    <div className="flex flex-col gap-1.5 mt-2">
                        <Label className="text-xs text-slate-400">Load Template</Label>
                        <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
                            <SelectTrigger className="w-full bg-slate-950 border-slate-800 focus:ring-indigo-500">
                                <SelectValue placeholder="Select Template..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                                {templates.map((t) => (
                                    <SelectItem key={t.id} value={t.id} className="hover:bg-slate-800">{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Node tool components insertion palette */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">BPMN Canvas Tools</span>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddNode("start")}
                                className="bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 hover:border-emerald-500 text-xs gap-1.5 flex items-center justify-start"
                            >
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                Start Event
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddNode("end")}
                                className="bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 hover:border-rose-500 text-xs gap-1.5 flex items-center justify-start"
                            >
                                <div className="w-2.5 h-2.5 rounded bg-rose-500" />
                                End Event
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddNode("service_task")}
                                className="bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 hover:border-purple-500 text-xs gap-1.5 flex items-center justify-start col-span-2"
                            >
                                <Bot className="h-3.5 w-3.5 text-purple-400" />
                                Service Task (Agent)
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddNode("user_task")}
                                className="bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 hover:border-amber-500 text-xs gap-1.5 flex items-center justify-start col-span-2"
                            >
                                <User className="h-3.5 w-3.5 text-amber-400" />
                                User Task (Human)
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddNode("xor_gateway")}
                                className="bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 hover:border-yellow-500 text-xs gap-1.5 flex items-center justify-start"
                            >
                                <Split className="h-3.5 w-3.5 text-yellow-400" />
                                XOR Gateway
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddNode("and_gateway")}
                                className="bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 hover:border-sky-500 text-xs gap-1.5 flex items-center justify-start"
                            >
                                <Plus className="h-3.5 w-3.5 text-sky-400" />
                                AND Gateway
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleAddNode("lane")}
                                className="bg-slate-950/40 border-slate-800 hover:bg-slate-800/50 hover:border-indigo-500 text-xs gap-1.5 flex items-center justify-start col-span-2"
                            >
                                <Layers className="h-3.5 w-3.5 text-indigo-400" />
                                Swimlane Group
                            </Button>
                        </div>
                    </div>

                    <div className="border-t border-slate-800/80 pt-4 flex flex-col gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-sans">Template Settings</span>
                        
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-slate-400">Template Name</Label>
                            <Input 
                                placeholder="New Workflow Name"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-sm focus:ring-indigo-500 text-slate-100"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-slate-400">Description</Label>
                            <Textarea 
                                placeholder="Details about this process template..."
                                value={templateDescription}
                                onChange={(e) => setTemplateDescription(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-xs focus:ring-indigo-500 h-20 text-slate-100"
                            />
                        </div>
                    </div>
                </div>

                {/* Validation and saving buttons */}
                <div className="p-4 border-t border-slate-800 flex flex-col gap-3 shrink-0">

                    {/* Validate button with inline description */}
                    <div className="flex flex-col gap-1.5">
                        <Button
                            variant="secondary"
                            className={`w-full text-xs font-semibold gap-2 transition-all ${
                                validationPassed === true
                                    ? "bg-emerald-900/50 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-700/50"
                                    : validationPassed === false
                                    ? "bg-rose-900/40 hover:bg-rose-900/60 text-rose-300 border border-rose-700/50"
                                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                            }`}
                            onClick={handleValidateTopology}
                        >
                            {validationPassed === true ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : validationPassed === false ? (
                                <TriangleAlert className="h-3.5 w-3.5" />
                            ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                            {validationPassed === true
                                ? "All Checks Passed"
                                : validationPassed === false
                                ? `${validationReport.length} Issue(s) Found`
                                : "Check Workflow"}
                        </Button>
                        <p className="text-[10px] text-slate-600 leading-relaxed px-0.5">
                            Verifies that all nodes are connected, start/end events exist,
                            lanes have owners, and no infinite loops are present.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {selectedTemplateId && (
                            <Button
                                onClick={handleDeleteTemplate}
                                variant="outline"
                                className="w-10 px-0 shrink-0 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
                                title="Delete Template"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                        <Button
                            onClick={handleSaveTemplate}
                            disabled={isSaving}
                            className="flex-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white gap-2 flex items-center justify-center shadow-lg shadow-indigo-600/20 transition-transform active:scale-95"
                        >
                            {isSaving ? "Publishing..." : "Save & Publish"}
                            <Save className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button
                        onClick={() => setIsDebugMode(true)}
                        disabled={!selectedTemplateId || isSaving}
                        variant="outline"
                        className="w-full text-xs font-bold border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300 gap-2 flex items-center justify-center transition-transform active:scale-95"
                    >
                        <Play className="h-4 w-4" />
                        Test Workflow Step-by-Step
                    </Button>
                </div>
            </div>

            {/* 2. Visual React Flow canvas */}
            <div className="flex-1 h-full relative bg-slate-950">
                {isLoading && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center flex-col gap-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Loading Process Schema...</span>
                    </div>
                )}
                
                {/* Debug Panel Overlay */}
                {isDebugMode && (
                    <div className="absolute top-4 left-4 z-40 w-80 bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-4">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                            <div className="flex items-center gap-2">
                                <Play className="h-4 w-4 text-emerald-400" />
                                <span className="font-bold text-sm text-slate-200">Debug Mode</span>
                            </div>
                            <button onClick={() => { setIsDebugMode(false); setDebugInstanceId(null); setDebugStatus(null); setDebugActiveNodes([]); }} className="text-slate-500 hover:text-slate-300">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {!debugInstanceId ? (
                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-slate-400">Initial Payload (JSON)</Label>
                                    <Textarea
                                        value={debugPayload}
                                        onChange={(e) => setDebugPayload(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-xs font-mono h-24 focus:ring-indigo-500 text-slate-100"
                                    />
                                    <p className="text-[10px] text-slate-500">Provide document_id or other variables needed by the workflow.</p>
                                </div>
                                <Button onClick={handleStartDebug} className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-2">
                                    Start Execution
                                </Button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                                    <span className="text-xs text-slate-400">Status:</span>
                                    <span className={`text-xs font-bold uppercase tracking-wider ${
                                        debugStatus === "RUNNING" ? "text-indigo-400 animate-pulse" :
                                        debugStatus === "WAITING" ? "text-amber-400" :
                                        debugStatus === "COMPLETED" ? "text-emerald-400" : "text-rose-400"
                                    }`}>{debugStatus}</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-xs font-semibold text-slate-300">Active Node(s):</span>
                                    {debugActiveNodes.length > 0 ? (
                                        debugActiveNodes.map((nId) => {
                                            const actNode = nodes.find(n => n.id === nId)
                                            return (
                                                <div key={nId} className="space-y-2">
                                                    <div className="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30 flex items-center justify-between">
                                                        <span>{actNode?.data?.label || nId}</span>
                                                        <span className="text-[9px] uppercase font-bold text-indigo-400">({actNode?.type || "Task"})</span>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <div className="text-xs text-slate-500 italic">None</div>
                                    )}
                                </div>

                                {debugStatus === "WAITING" && debugActiveGuiSchema && (
                                    <div className="border border-slate-850 bg-slate-950/60 rounded-xl p-3 space-y-3 max-h-60 overflow-y-auto">
                                        <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wide">
                                            {debugActiveGuiSchema.title || "Human Input Form"}
                                        </div>
                                        {renderDynamicForm(
                                            debugActiveGuiSchema,
                                            debugFormValues,
                                            (key, val) => setDebugFormValues(prev => ({ ...prev, [key]: val }))
                                        )}
                                    </div>
                                )}

                                <div className="pt-2 border-t border-slate-800">
                                    <Button 
                                        onClick={handleStepForward} 
                                        disabled={debugStatus !== "WAITING"}
                                        className="w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white gap-2 disabled:bg-slate-800 disabled:text-slate-500 shadow-lg shadow-indigo-650/10 active:scale-95 transition-transform"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                        Step Forward
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={wrappedOnNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    onNodeClick={onNodeClick}
                    onPaneClick={onPaneClick}
                    onNodeDragStop={onNodeDragStop}
                    fitView
                    className="w-full h-full text-slate-800 dark:text-slate-100"
                >
                    <Controls className="bg-slate-900 border-slate-800 text-slate-100" />
                    <MiniMap style={{ background: "#020617" }} />
                    <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
                </ReactFlow>

                {/* Validation report popup */}
                {validationReport.length > 0 && (
                    <div className={`absolute bottom-6 left-6 z-20 max-w-sm rounded-xl border backdrop-blur-md p-4 shadow-2xl animate-in slide-in-from-bottom duration-300 ${
                        validationPassed
                            ? "bg-emerald-950/90 border-emerald-800/60"
                            : "bg-slate-900/90 border-rose-800/40"
                    }`}>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 mb-2.5">
                            <div className="flex items-center gap-2">
                                {validationPassed ? (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                ) : (
                                    <TriangleAlert className="h-4 w-4 text-rose-400" />
                                )}
                                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                                    {validationPassed ? "All checks passed" : `${validationReport.length} issue(s) found`}
                                </span>
                            </div>
                            <button
                                onClick={() => { setValidationReport([]); setValidationPassed(null) }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                                title="Dismiss"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {/* Report items */}
                        <div className="max-h-48 overflow-y-auto flex flex-col gap-2">
                            {validationReport.map((rep, idx) => {
                                const isError = /Error|Missing|Empty|Dangling|Cyclic|Isolated|Unreachable|Dead|Unconfigured|Duplicate/.test(rep)
                                return (
                                    <div key={idx} className="flex gap-2 text-xs items-start leading-relaxed">
                                        {isError ? (
                                            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                                        ) : (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                        )}
                                        <span className={isError ? "text-rose-200" : "text-emerald-200"}>{rep}</span>
                                    </div>
                                )
                            })}
                        </div>

                        {/* Footer hint when errors exist */}
                        {!validationPassed && (
                            <p className="text-[10px] text-slate-500 mt-3 pt-2.5 border-t border-slate-800/80">
                                Fix the issues above and click <span className="font-semibold text-slate-400">Check Workflow</span> again before saving.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* 3. Right Node Properties / Lane Configuration Inspector */}
            {selectedNode && (
                <div className="w-80 border-l border-slate-800 bg-slate-900/50 backdrop-blur-xl flex flex-col shrink-0 animate-in slide-in-from-right duration-200">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                        <div className="flex items-center gap-2">
                            <Settings className="h-4 w-4 text-indigo-400" />
                            <span className="font-bold text-xs uppercase tracking-wider text-slate-300">Node Properties</span>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleDeleteSelected}
                            className="h-7 text-xs font-semibold text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 px-2.5"
                        >
                            Delete Node
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                        {/* Generic Label Field */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs text-slate-400">Node Label</Label>
                            <Input 
                                value={selectedNode.data.label || ""}
                                onChange={(e) => handleUpdateNodeData(selectedNode.id, { label: e.target.value })}
                                className="bg-slate-950 border-slate-800 text-sm focus:ring-indigo-500 text-slate-100"
                            />
                        </div>

                        {/* Lane specific inspector */}
                        {selectedNode.type === "lane" && (
                            <div className="flex flex-col gap-4 border-t border-slate-800/80 pt-4">

                                {/* Lane position badge */}
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const accent = ["bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
                                            "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                                            "bg-amber-500/20 text-amber-300 border-amber-500/30",
                                            "bg-rose-500/20 text-rose-300 border-rose-500/30",
                                            "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
                                            "bg-purple-500/20 text-purple-300 border-purple-500/30"]
                                        const idx = selectedNode.data.laneIndex ?? 0
                                        return (
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${accent[idx % accent.length]}`}>
                                                Lane {idx + 1} of {selectedNode.data.totalLanes || 1}
                                            </span>
                                        )
                                    })()}
                                    <span className="text-[10px] text-slate-500">
                                        {(selectedNode.data.roles || []).length} role(s) assigned
                                    </span>
                                </div>

                                {/* Semantic ownership info */}
                                <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 flex flex-col gap-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Semantic Ownership</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 leading-relaxed">
                                        Tasks placed inside this swimlane are automatically owned by its assigned actors.
                                        Drag any task node into this lane to assign it. The lane and all its tasks move together.
                                    </p>
                                </div>

                                {/* Role checkboxes */}
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-slate-400">Authorized System Roles</Label>
                                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto bg-slate-950 p-2 rounded-lg border border-slate-800">
                                        {roles.length === 0 && (
                                            <span className="text-[10px] text-slate-600 italic px-1">
                                                No roles available — create roles in Settings first.
                                            </span>
                                        )}
                                        {roles.map((role) => {
                                            const activeRoles = selectedNode.data.roles || []
                                            const isChecked = activeRoles.includes(role.name)
                                            return (
                                                <label key={role.id} className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer py-1 hover:bg-slate-900 px-1.5 rounded">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {
                                                            const nextRoles = isChecked
                                                                ? activeRoles.filter((r: string) => r !== role.name)
                                                                : [...activeRoles, role.name]
                                                            handleUpdateNodeData(selectedNode.id, { roles: nextRoles })
                                                        }}
                                                        className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    {role.name}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Reorder controls in inspector */}
                                <div className="flex flex-col gap-1.5 border-t border-slate-800/60 pt-3">
                                    <Label className="text-xs text-slate-400">Swimlane Position</Label>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => LANE_ACTIONS.moveUp(selectedNode.id)}
                                            disabled={selectedNode.data.laneIndex === 0}
                                            className="flex-1 text-xs bg-slate-950 border-slate-800 hover:bg-slate-800 gap-1.5"
                                        >
                                            <ArrowUp className="h-3 w-3" />
                                            Move Up
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => LANE_ACTIONS.moveDown(selectedNode.id)}
                                            disabled={selectedNode.data.laneIndex === (selectedNode.data.totalLanes || 1) - 1}
                                            className="flex-1 text-xs bg-slate-950 border-slate-800 hover:bg-slate-800 gap-1.5"
                                        >
                                            <ArrowDown className="h-3 w-3" />
                                            Move Down
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Service Task specific inspector */}
                        {selectedNode.type === "service_task" && (
                            <div className="flex flex-col gap-4 border-t border-slate-800/80 pt-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-slate-400">Linked Agent Blueprint</Label>
                                    <Select 
                                        value={selectedNode.data.blueprint_id || ""}
                                        onValueChange={(val) => {
                                            const selectedBp = blueprints.find((bp) => bp.id === val)
                                            handleUpdateNodeData(selectedNode.id, {
                                                blueprint_id: val,
                                                blueprint_name: selectedBp ? selectedBp.name : ""
                                            })
                                        }}
                                    >
                                        <SelectTrigger className="w-full bg-slate-950 border-slate-800 text-slate-100">
                                            <SelectValue placeholder="Link Blueprint..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                                            {blueprints.map((bp) => (
                                                <SelectItem key={bp.id} value={bp.id} className="hover:bg-slate-800">{bp.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-slate-400">Input Variables Mapping (JSON)</Label>
                                        <HelpTooltip contentPath="workflow/service_inputs" />
                                    </div>
                                    <Textarea 
                                        placeholder='e.g. {"document_id": "{{doc_id}}"}'
                                        value={JSON.stringify(selectedNode.data.inputs || {}, null, 2)}
                                        onChange={(e) => {
                                            try {
                                                const parsed = JSON.parse(e.target.value)
                                                handleUpdateNodeData(selectedNode.id, { inputs: parsed })
                                            } catch (err) {
                                                // Wait for valid JSON
                                            }
                                        }}
                                        className="bg-slate-950 border-slate-800 text-xs font-mono h-32 focus:ring-indigo-500 text-slate-100"
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-slate-400">Output Mapping (State bindings)</Label>
                                    <Textarea 
                                        placeholder='e.g. {"extracted_keywords": "keywords"}'
                                        value={JSON.stringify(selectedNode.data.output_mapping || {}, null, 2)}
                                        onChange={(e) => {
                                            try {
                                                const parsed = JSON.parse(e.target.value)
                                                handleUpdateNodeData(selectedNode.id, { output_mapping: parsed })
                                            } catch (err) {
                                                // Wait for valid JSON
                                            }
                                        }}
                                        className="bg-slate-950 border-slate-800 text-xs font-mono h-28 focus:ring-indigo-500 text-slate-100"
                                    />
                                </div>
                            </div>
                        )}

                        {/* User Task specific inspector */}
                        {selectedNode.type === "user_task" && (
                            <div className="flex flex-col gap-4 border-t border-slate-800/80 pt-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-slate-400">Associate Form Tool</Label>
                                    <Select
                                        value={selectedNode.data.form_tool_id?.toString() || "default"}
                                        onValueChange={(val) => {
                                            const tool = guiTools.find(t => t.id.toString() === val)
                                            if (tool) {
                                                handleUpdateNodeData(selectedNode.id, {
                                                    form_tool_id: tool.id,
                                                    form_tool_name: tool.name,
                                                    gui_schema: tool.configuration
                                                })
                                            } else {
                                                handleUpdateNodeData(selectedNode.id, {
                                                    form_tool_id: null,
                                                    form_tool_name: "Approval Form",
                                                    gui_schema: {
                                                        type: "object",
                                                        properties: {
                                                            approved: { type: "boolean", title: "Approve Progression" },
                                                            comments: { type: "string", title: "Review Comments" }
                                                        }
                                                    }
                                                })
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-100 focus:ring-indigo-500 text-sm">
                                            <SelectValue placeholder="Choose a Form Tool..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-100">
                                            <SelectItem value="default" className="hover:bg-slate-800">
                                                (Default Approval Form)
                                            </SelectItem>
                                            {guiTools.map((t) => (
                                                <SelectItem key={t.id} value={t.id.toString()} className="hover:bg-slate-800">
                                                    {t.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-xs text-slate-400">Form Name / Display Label</Label>
                                    <Input 
                                        value={selectedNode.data.form_tool_name || "Approval Form"}
                                        onChange={(e) => handleUpdateNodeData(selectedNode.id, { form_tool_name: e.target.value })}
                                        className="bg-slate-950 border-slate-800 text-sm focus:ring-indigo-500 text-slate-100"
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-slate-400">JSON GUI Schema Layout</Label>
                                        <HelpTooltip contentPath="workflow/form_schemas" />
                                    </div>
                                    <Textarea 
                                        placeholder='Custom Radix input form structure...'
                                        value={JSON.stringify(selectedNode.data.gui_schema || {
                                            type: "object",
                                            properties: {
                                                approved: { type: "boolean", title: "Approve Progression" },
                                                comments: { type: "string", title: "Review Comments" }
                                            }
                                        }, null, 2)}
                                        onChange={(e) => {
                                            try {
                                                const parsed = JSON.parse(e.target.value)
                                                handleUpdateNodeData(selectedNode.id, { gui_schema: parsed })
                                            } catch (err) {
                                                // Wait for valid JSON
                                            }
                                        }}
                                        className="bg-slate-950 border-slate-800 text-xs font-mono h-48 focus:ring-indigo-500 text-slate-100"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
