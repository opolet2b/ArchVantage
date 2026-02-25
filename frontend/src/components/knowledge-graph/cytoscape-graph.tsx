"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw, ZoomIn, ZoomOut, Maximize, Loader2, RefreshCcw } from "lucide-react"
import CytoscapeComponent from 'react-cytoscapejs';
import { API_URL } from "@/lib/utils"

export default function CytoscapeGraph({ kbId, ingestionStatus }: { kbId?: string, ingestionStatus?: string }) {
    const [elements, setElements] = useState<any[]>([])
    const [metadata, setMetadata] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(false)
    const cyRef = useRef<any>(null)

    const fetchGraph = useCallback(async () => {
        if (!kbId) return;
        setIsLoading(true)
        try {
            const res = await fetch(`${API_URL}/knowledge/kb/${kbId}/graph`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                }
            })
            if (res.ok) {
                const data = await res.json()
                setElements(data.elements || [])
                setMetadata(data.metadata || null)
            }
        } catch (error) {
            console.error("Failed to fetch graph", error)
        } finally {
            setIsLoading(false)
        }
    }, [kbId]);

    useEffect(() => {
        fetchGraph()
    }, [fetchGraph])

    useEffect(() => {
        if (ingestionStatus === 'completed') {
            fetchGraph()
        }
    }, [ingestionStatus, fetchGraph])

    const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)
    const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)
    const handleFit = () => cyRef.current?.fit()

    const containerRef = useRef<HTMLDivElement>(null)

    // Placeholder for Lazy Update Trigger
    const handleLazyUpdate = async (nodeId: string) => {
        console.log(`Triggering Lazy Update for Node: ${nodeId}`)
        // const res = await fetch(`/api/v1/knowledge/lazy-update`, { ... })
    }

    return (
        <div className="relative w-full h-full flex flex-col">
            {/* Toolbar */}
            <div className="absolute top-4 left-4 z-10 flex gap-2 bg-background/80 backdrop-blur border p-1 rounded-lg shadow-sm">
                <Button variant="ghost" size="icon" onClick={fetchGraph} title="Refresh Graph" disabled={isLoading}>
                    <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
                <div className="w-px h-4 bg-muted my-auto mx-1" />
                <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In"><ZoomIn className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out"><ZoomOut className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={handleFit} title="Fit to Screen"><Maximize className="h-4 w-4" /></Button>
            </div>

            <div className="absolute top-4 right-4 z-10 flex gap-2">
                <div className="bg-card border shadow-sm rounded-lg p-3 text-sm flex flex-col gap-2">
                    <div className="font-semibold mb-1">Legend</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Synced Node (Blue)</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Outdated (Amber) <RefreshCw className="h-3 w-3 inline text-amber-500" /></div>
                </div>
            </div>

            {/* Canvas Container */}
            <div
                ref={containerRef}
                className="w-full h-full border-2 border-dashed border-muted-foreground/20 m-4 rounded-xl overflow-hidden bg-slate-50/50"
            >
                {isLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <p>Loading Graph Data...</p>
                    </div>
                ) : elements.length > 0 ? (
                    <CytoscapeComponent
                        elements={elements}
                        style={{ width: '100%', height: '100%' }}
                        cy={(cy) => { cyRef.current = cy }}
                        layout={{ name: 'cose', componentSpacing: 100, nodeOverlap: 20, animate: true }}
                        stylesheet={[
                            {
                                selector: 'node',
                                style: {
                                    'label': 'data(label)',
                                    'background-color': '#4f46e5',
                                    'color': '#1e293b',
                                    'font-size': '12px',
                                    'width': '40px',
                                    'height': '40px'
                                }
                            },
                            {
                                selector: 'edge',
                                style: {
                                    'label': 'data(label)',
                                    'width': 2,
                                    'line-color': '#cbd5e1',
                                    'target-arrow-color': '#cbd5e1',
                                    'target-arrow-shape': 'triangle',
                                    'curve-style': 'bezier',
                                    'font-size': '10px',
                                    'text-rotation': 'autorotate'
                                }
                            }
                        ]}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                            {metadata?.ingestion_status === 'failed' ? (
                                <AlertCircle className="h-8 w-8 text-red-500" />
                            ) : (
                                <RefreshCw className={`h-8 w-8 text-slate-400 ${metadata?.ingestion_status === 'running' ? 'animate-spin' : ''}`} />
                            )}
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">
                            {metadata?.ingestion_status === 'running'
                                ? "AI Discovery in Progress..."
                                : metadata?.ingestion_status === 'failed'
                                    ? "Ingestion Failed"
                                    : "No nodes found in this Knowledge Base."
                            }
                        </h3>
                        <p className="max-w-[400px] mb-6 text-sm leading-relaxed text-slate-500">
                            {metadata?.ingestion_status === 'running'
                                ? "Please wait while our AI scans your documents for entities and relationships. This may take a minute."
                                : metadata?.ingestion_status === 'failed'
                                    ? `Error: ${metadata?.error || "A problem occurred during ingestion."} Try establishing the KB again or check backend logs.`
                                    : "Click 'Establish/Update Knowledge Base' in the Configuration tab to start the AI discovery process."
                            }
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fetchGraph()}
                            className="bg-white hover:bg-slate-50 border-slate-200"
                        >
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Refresh Graph
                        </Button>
                    </div>
                )}
            </div>

            {/* Ingestion Status Overlay */}
            {ingestionStatus === "running" && (
                <div className="absolute bottom-6 right-6 z-20 flex items-center gap-3 bg-indigo-600 text-white px-4 py-2 rounded-full shadow-lg animate-pulse border border-indigo-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-semibold tracking-wide uppercase">AI Discovery in Progress...</span>
                </div>
            )}
        </div>
    )
}
