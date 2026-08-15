import React, { useState } from 'react';
import { useCanvasStore, CanvasThing, CanvasLink } from '../canvas-store';
import { Presentation, FileText, Image as ImageIcon, ChevronRight, Play, Server, ListTree, Download, Edit2, Layout, ZoomIn, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ArchiMateToolViewer } from './archimate-tool-viewer';

interface ExecutiveSummaryViewerProps {
    thing: CanvasThing;
    links?: CanvasLink[];
}

export function ExecutiveSummaryViewer({ thing, links = [] }: ExecutiveSummaryViewerProps) {
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const isReadOnly = accessLevel === "read";
    const selectedModel = useCanvasStore(state => state.selectedModel);
    const visionModel = useCanvasStore(state => state.visionModel);
    const activePreset = useCanvasStore(state => state.activePreset);
    
    // Status states
    const [status, setStatus] = useState<'idle' | 'generating' | 'completed'>(thing.content?.status || 'idle');
    const [isExporting, setIsExporting] = useState(false);
    const [regeneratingSlideIndex, setRegeneratingSlideIndex] = useState<number | null>(null);
    const [slides, setSlides] = useState<any[]>(thing.content?.slides || []);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    // Mock data removed. Only use real data from the backend.
    const concepts = thing.content?.concepts || null;

    const updateThing = useCanvasStore(state => state.updateThing);
    const things = useCanvasStore(state => state.things);

    // Helper for fuzzy matching to handle LLM paraphrasing
    const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isConceptUsed = (concept: string, usedList: string[]) => {
        const normC = normalize(concept);
        if (!normC) return false;
        
        return usedList.some(used => {
            const normU = normalize(used);
            if (!normU) return false;
            
            // Check substring in either direction
            if (normC.includes(normU) || normU.includes(normC)) return true;
            
            // Or Jaccard similarity of words
            const wordsC = new Set(concept.toLowerCase().split(/\s+/).filter(w => w.length > 3));
            const wordsU = new Set(used.toLowerCase().split(/\s+/).filter(w => w.length > 3));
            if (wordsC.size === 0 || wordsU.size === 0) return false;
            
            const intersection = new Set([...wordsC].filter(x => wordsU.has(x)));
            const union = new Set([...wordsC, ...wordsU]);
            const similarity = intersection.size / union.size;
            
            return similarity > 0.4; // 40% word overlap
        });
    };

    // Compute used concepts
    const usedConceptsArray = slides.flatMap(s => s.concepts || []);
    const availableDrivers = (concepts?.drivers || []).filter((d: string) => !isConceptUsed(d, usedConceptsArray));
    const availableCapabilities = (concepts?.capabilities || []).filter((c: string) => !isConceptUsed(c, usedConceptsArray));

    // Filter links to only include those connected to this specific tool
    const nodeLinks = links.filter(link => link.source_id === thing.id || link.target_id === thing.id);
    
    // Extract real images from connected Things
    const linkedThings = nodeLinks
        .map(link => {
            const linkedId = link.source_id === thing.id ? link.target_id : link.source_id;
            return things.find(t => t.id === linkedId);
        })
        .filter((t): t is CanvasThing => t !== undefined);

    const realImages = linkedThings
        .filter(t => t.type === 'image' || t.content?.image_asset_id || t.content?.url || (t.type === 'document' && t.content?.figures?.length > 0))
        .map(t => {
            if (t.content?.url) return t.content.url;
            if (t.content?.image_asset_id) return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/assets/${t.content.image_asset_id}`;
            if (t.content?.asset_id && t.type === 'image') return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/assets/${t.content.asset_id}`;
            return null;
        })
        .filter(Boolean) as string[];

    // Combine backend figures and real linked images
    const backendFigures = Array.isArray(concepts?.figures) ? concepts.figures : [];
    const allFigures = [...new Set([...realImages, ...backendFigures])];

    const handleGenerate = async () => {
        setStatus('generating');
        updateThing(thing.id, { content: { ...thing.content, status: 'generating' } });

        // Gather linked document contents using the filtered nodeLinks
        const linkedThings = nodeLinks
            .map(link => {
                const linkedId = link.source_id === thing.id ? link.target_id : link.source_id;
                return things.find(t => t.id === linkedId);
            })
            .filter((t): t is CanvasThing => t !== undefined);

        const sourceDocs = linkedThings.map(t => {
            const textContent = typeof t.content?.text === 'string' ? t.content.text : 
                                typeof t.content?.content === 'string' ? t.content.content : 
                                JSON.stringify(t.content);
            return textContent;
        });

        const sourceAssetIds = linkedThings
            .map(t => t.content?.asset_id || t.content?.file_asset_id)
            .filter(Boolean);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/executive_summary/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_docs: sourceDocs,
                    source_asset_ids: sourceAssetIds,
                    llm_preset: selectedModel || 'default',
                    vlm_preset: visionModel || 'default'
                })
            });

            if (!res.ok) throw new Error("API Request Failed");
            
            const data = await res.json();
            
            setSlides(data.slides);
            setStatus('completed');
            
            updateThing(thing.id, {
                content: {
                    ...thing.content,
                    status: 'completed',
                    concepts: data.concepts,
                    slides: data.slides
                }
            });

        } catch (error) {
            console.error("Generation Failed:", error);
            setStatus('idle');
            updateThing(thing.id, { content: { ...thing.content, status: 'idle' } });
            alert("Generation failed. See console for details.");
        }
    };

    const handleExportPPTX = async () => {
        if (slides.length === 0) return;
        setIsExporting(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/executive_summary/export_pptx`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slides })
            });

            if (!res.ok) throw new Error("Export Failed");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `executive_summary_${thing.id.substring(0, 5)}.pptx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("PPTX Export Failed:", error);
            alert("Failed to export PPTX.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleRegenerateSlide = async (index: number) => {
        if (isReadOnly) return;
        setRegeneratingSlideIndex(index);
        
        try {
            // Gather linked document contents
            const linkedThings = links
                .filter(link => link.source_id === thing.id || link.target_id === thing.id)
                .map(link => {
                    const otherId = link.source_id === thing.id ? link.target_id : link.source_id;
                    return things.find(t => t.id === otherId);
                })
                .filter(t => t && t.type === 'document');

            const sourceDocs = linkedThings.map(t => {
                const textContent = typeof t?.content?.text === 'string' ? t.content.text : 
                                    typeof t?.content?.content === 'string' ? t.content.content : 
                                    JSON.stringify(t?.content);
                return textContent;
            });

            const slide = slides[index];

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/executive_summary/regenerate_slide`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    source_docs: sourceDocs,
                    slide: {
                        title: slide.title,
                        takeaway: slide.takeaway,
                        concepts: slide.concepts || [],
                        has_diagram: !!slide.diagram_url
                    },
                    llm_preset: activePreset?.id || 'default',
                    vlm_preset: visionModel || 'default'
                })
            });

            if (!res.ok) throw new Error("Regeneration failed");
            const data = await res.json();
            
            if (data.status === 'success' && data.slide) {
                const newSlides = [...slides];
                // Preserve diagram if it existed
                data.slide.diagram_url = newSlides[index].diagram_url;
                newSlides[index] = data.slide;
                setSlides(newSlides);
                updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
            }
        } catch (error) {
            console.error("Slide Regeneration Failed:", error);
            alert("Failed to regenerate slide. See console for details.");
        } finally {
            setRegeneratingSlideIndex(null);
        }
    };

    const handleAddSlide = () => {
        const newSlides = [...slides, { title: "New Slide", takeaway: "New Takeaway", concepts: [], has_diagram: false }];
        setSlides(newSlides);
        updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
    };

    const handleMoveSlide = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === slides.length - 1) return;
        
        const newSlides = [...slides];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        // Swap
        [newSlides[index], newSlides[targetIndex]] = [newSlides[targetIndex], newSlides[index]];
        setSlides(newSlides);
        updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
    };

    const handleDeleteSlide = (index: number) => {
        const newSlides = slides.filter((_, i) => i !== index);
        setSlides(newSlides);
        updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
    };

    return (
        <div className="flex flex-col w-full h-full bg-slate-100 dark:bg-slate-950 overflow-hidden pointer-events-auto shadow-xl rounded-md border border-slate-200 dark:border-slate-800">
            {/* Header Area */}
            <div className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 dark:bg-blue-900/50 p-1.5 rounded">
                        <Presentation className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Executive Summary Deck</h2>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className={cn("flex items-center gap-1", nodeLinks.length === 0 ? "text-amber-600" : "text-slate-500")}>
                                <FileText className="w-3 h-3"/> {nodeLinks.length} Linked Sources
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Server className="w-3 h-3"/> {selectedModel || 'Default LLM'}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button 
                        size="sm" 
                        variant="outline"
                        className="text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 shadow-sm"
                        disabled={slides.length === 0 || isExporting}
                        onClick={handleExportPPTX}
                    >
                        {isExporting ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current"></span>
                                Exporting...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Download className="w-3.5 h-3.5" />
                                PPTX
                            </span>
                        )}
                    </Button>
                    <Button 
                        size="sm" 
                        className={cn("text-white shadow-sm", nodeLinks.length > 0 ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-300 dark:bg-slate-700")}
                        disabled={isReadOnly || status === 'generating' || nodeLinks.length === 0}
                        onClick={handleGenerate}
                    >
                        {status === 'generating' ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                                Generating...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Play className="w-3.5 h-3.5" />
                                Generate Slide Deck
                            </span>
                        )}
                    </Button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel: Concept Graph Explorer */}
                <div className="w-64 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col shrink-0">
                    <div className="p-3 border-b border-slate-200 dark:border-slate-800">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <ListTree className="w-3.5 h-3.5" /> Concept Explorer
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
                            Extracted concepts. Use these as building blocks to compose or regenerate your slides.
                        </p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {!concepts ? (
                            <div className="p-6 mt-10 text-center flex flex-col items-center opacity-60">
                                <ListTree className="w-8 h-8 text-slate-400 mb-3" />
                                <p className="text-xs text-slate-500">
                                    Concepts and capabilities will appear here once the analysis is generated.
                                </p>
                            </div>
                        ) : (
                            <div className="p-3 space-y-4">
                                {/* Business Drivers */}
                                <div>
                                    <h4 className="text-[11px] font-semibold text-slate-400 mb-1.5">Business Drivers</h4>
                                    <div className="space-y-1">
                                        {availableDrivers.length === 0 && <div className="text-[10px] text-slate-400 italic">All drivers used</div>}
                                        {availableDrivers.map((d: string, i: number) => (
                                            <div 
                                                key={i} 
                                                draggable={!isReadOnly}
                                                onDragStart={(e) => e.dataTransfer.setData("text/plain", d)}
                                                className="text-xs px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm text-slate-600 dark:text-slate-300 cursor-grab active:cursor-grabbing hover:border-blue-400 transition-colors"
                                            >
                                                {d}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* ArchiMate Capabilities */}
                                <div>
                                    <h4 className="text-[11px] font-semibold text-slate-400 mb-1.5">Capabilities</h4>
                                    <div className="space-y-1">
                                        {availableCapabilities.length === 0 && <div className="text-[10px] text-slate-400 italic">All capabilities used</div>}
                                        {availableCapabilities.map((c: string, i: number) => (
                                            <div 
                                                key={i} 
                                                draggable={!isReadOnly}
                                                onDragStart={(e) => e.dataTransfer.setData("text/plain", c)}
                                                className="text-xs px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm text-slate-600 dark:text-slate-300 cursor-grab active:cursor-grabbing hover:border-blue-400 transition-colors"
                                            >
                                                {c}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Extracted Figures */}
                                <div>
                                    <h4 className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                                        Extracted Figures
                                        <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 rounded">{allFigures.length}</span>
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {allFigures.map((url: string, i: number) => {
                                            // Check if figure is used in any slide
                                            const isUsed = slides.some(s => s.diagram_url === url);
                                            if (isUsed) return null;
                                            
                                            return (
                                                <div 
                                                    key={i}
                                                    draggable={!isReadOnly}
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData("application/json", JSON.stringify({ type: 'figure', url }));
                                                    }}
                                                    className="relative group aspect-video bg-slate-200 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 flex items-center justify-center cursor-grab active:cursor-grabbing hover:border-blue-400 overflow-hidden"
                                                >
                                                    <img src={url} alt="Extracted Figure" className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                        <button 
                                                            className="pointer-events-auto p-2 bg-white/20 hover:bg-white/40 text-white rounded-full backdrop-blur-sm transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setZoomedImage(url);
                                                            }}
                                                            title="Zoom In"
                                                        >
                                                            <ZoomIn className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Central Canvas: Narrative Thread Storyboard */}
                <div className="flex-1 bg-slate-100/50 dark:bg-slate-950 flex flex-col overflow-hidden relative">
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-8 max-w-3xl mx-auto flex flex-col items-center gap-6 pb-20">
                            
                            {slides.length === 0 ? (
                                <div className="mt-20 text-center">
                                    <Presentation className="w-16 h-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                                    <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">Storyboard Canvas</h3>
                                    {nodeLinks.length === 0 ? (
                                        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg max-w-md mx-auto mt-4 text-amber-700 dark:text-amber-400">
                                            <p className="font-semibold text-sm mb-1">Missing Source Documents</p>
                                            <p className="text-xs">
                                                You must link existing architecture models or documents to this tool to start the analysis. Use the connector tool on the canvas.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg max-w-md mx-auto mt-4 text-blue-700 dark:text-blue-400">
                                            <p className="font-semibold text-sm mb-1">Ready for Analysis</p>
                                            <p className="text-xs">
                                                {nodeLinks.length} source document(s) linked. Click "Generate Slide Deck" to synthesize the C-Level narrative thread.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full flex flex-col items-center">
                                    <div className="w-full max-w-2xl flex justify-end mb-4">
                                        <Button size="sm" variant="outline" className="text-xs bg-white dark:bg-slate-900 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 hover:text-blue-600 shadow-sm" onClick={handleAddSlide} disabled={isReadOnly}>
                                            + Add Slide
                                        </Button>
                                    </div>
                                    {slides.map((slide, index) => (
                                        <div key={index} className="w-full flex flex-col items-center">
                                            {/* Slide Card */}
                                            <div 
                                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    if (isReadOnly) return;
                                                    const droppedText = e.dataTransfer.getData("text/plain");
                                                    if (droppedText) {
                                                        const newSlides = [...slides];
                                                        if (!newSlides[index].concepts) newSlides[index].concepts = [];
                                                        if (!newSlides[index].concepts.includes(droppedText)) {
                                                            newSlides[index].concepts.push(droppedText);
                                                            setSlides(newSlides);
                                                            updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                        }
                                                    }
                                                }}
                                                className="w-full min-h-[300px] h-auto max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-md border border-slate-200 dark:border-slate-800 p-6 flex flex-col group relative transition-all hover:shadow-lg hover:border-blue-300"
                                            >
                                                {/* Slide Number Badge */}
                                                <div className="absolute -left-3 -top-3 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-sm shadow-sm border border-blue-200 dark:border-blue-800">
                                                    {index + 1}
                                                </div>
                                                
                                                {/* Slide Controls (Hidden by default, shown on hover) */}
                                                {!isReadOnly && (
                                                    <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm z-10">
                                                        <button 
                                                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 disabled:opacity-30"
                                                            onClick={() => handleMoveSlide(index, 'up')}
                                                            disabled={index === 0}
                                                            title="Move Up"
                                                        >
                                                            <ChevronRight className="w-4 h-4 -rotate-90" />
                                                        </button>
                                                        <button 
                                                            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500 disabled:opacity-30"
                                                            onClick={() => handleMoveSlide(index, 'down')}
                                                            disabled={index === slides.length - 1}
                                                            title="Move Down"
                                                        >
                                                            <ChevronRight className="w-4 h-4 rotate-90" />
                                                        </button>
                                                        <div className="w-px h-4 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                                                        <button 
                                                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500"
                                                            onClick={() => handleDeleteSlide(index)}
                                                            title="Delete Slide"
                                                        >
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                        </button>
                                                    </div>
                                                )}
                                                
                                            {isReadOnly ? (
                                                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 pr-24">
                                                    {slide.title || `Slide ${index + 1}`}
                                                </h3>
                                            ) : (
                                                <input 
                                                    className="w-full bg-transparent text-xl font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 pr-24 outline-none focus:border-blue-400 placeholder:text-slate-300"
                                                    value={slide.title}
                                                    placeholder="Slide Title"
                                                    onChange={(e) => {
                                                        const newSlides = [...slides];
                                                        newSlides[index].title = e.target.value;
                                                        setSlides(newSlides);
                                                        updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                    }}
                                                />
                                            )}
                                            
                                            <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-4 bg-blue-50 dark:bg-blue-900/20 p-2.5 rounded border border-blue-100 dark:border-blue-900/50">
                                                <span className="font-semibold uppercase tracking-wider text-[10px] block mb-1">Executive Takeaway</span>
                                                {isReadOnly ? (
                                                    slide.takeaway || "No takeaway defined"
                                                ) : (
                                                    <textarea 
                                                        className="w-full bg-transparent resize-none outline-none focus:ring-1 focus:ring-blue-400/50 rounded placeholder:text-blue-300/50"
                                                        rows={2}
                                                        value={slide.takeaway}
                                                        placeholder="Executive takeaway..."
                                                        onChange={(e) => {
                                                            const newSlides = [...slides];
                                                            newSlides[index].takeaway = e.target.value;
                                                            setSlides(newSlides);
                                                            updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 flex gap-6">
                                                <div className="flex-1">
                                                    <ul className="list-disc pl-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                                        {(slide.concepts || []).map((c: string, i: number) => (
                                                            <li key={i}>
                                                                {isReadOnly ? c : (
                                                                    <div className="flex gap-2 group/concept">
                                                                        <input 
                                                                            className="flex-1 bg-transparent outline-none focus:border-b focus:border-blue-300"
                                                                            value={c}
                                                                            onChange={(e) => {
                                                                                const newSlides = [...slides];
                                                                                newSlides[index].concepts[i] = e.target.value;
                                                                                setSlides(newSlides);
                                                                                updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                                            }}
                                                                        />
                                                                        <button 
                                                                            className="text-red-400 opacity-0 group-hover/concept:opacity-100 hover:bg-red-50 p-0.5 rounded"
                                                                            onClick={() => {
                                                                                const newSlides = [...slides];
                                                                                newSlides[index].concepts.splice(i, 1);
                                                                                setSlides(newSlides);
                                                                                updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                                            }}
                                                                        >
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    {!isReadOnly && (
                                                        <button 
                                                            className="text-[10px] text-blue-500 hover:text-blue-600 mt-2 ml-4 flex items-center"
                                                            onClick={() => {
                                                                const newSlides = [...slides];
                                                                if (!newSlides[index].concepts) newSlides[index].concepts = [];
                                                                newSlides[index].concepts.push("New concept");
                                                                setSlides(newSlides);
                                                                updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                            }}
                                                        >
                                                            + Add Concept
                                                        </button>
                                                    )}
                                                </div>
                                                    <div 
                                                        className={cn(
                                                            "w-1/3 min-h-[150px] bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md flex items-center justify-center flex-col text-slate-400 overflow-hidden relative group/diagram",
                                                            !isReadOnly && "hover:border-blue-400 transition-colors"
                                                        )}
                                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                                                        onDrop={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation(); // Prevent slide onDrop
                                                            if (isReadOnly) return;
                                                            try {
                                                                const data = JSON.parse(e.dataTransfer.getData("application/json"));
                                                                if (data.type === 'figure' && data.url) {
                                                                    const newSlides = [...slides];
                                                                    newSlides[index].diagram_url = data.url;
                                                                    setSlides(newSlides);
                                                                    updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                                }
                                                            } catch (err) {
                                                                // Not a JSON figure
                                                            }
                                                        }}
                                                    >
                                                        {slide.archimate_data ? (
                                                            <div className="w-full h-full relative pointer-events-auto">
                                                                <div className="absolute inset-0 zoom-50">
                                                                    <ArchiMateToolViewer 
                                                                        thing={{ id: thing.id, type: "archimate_tool", content: { archimateData: slide.archimate_data } } as any}
                                                                        links={[]}
                                                                        onSelect={() => {}}
                                                                    />
                                                                </div>
                                                                {!isReadOnly && (
                                                                    <div className="absolute top-2 right-2 bg-black/40 opacity-0 group-hover/diagram:opacity-100 transition-opacity z-10">
                                                                        <button 
                                                                            className="text-white hover:text-red-400 bg-black/60 p-1.5 rounded-md text-xs flex items-center gap-1"
                                                                            onClick={() => {
                                                                                const newSlides = [...slides];
                                                                                delete newSlides[index].archimate_data;
                                                                                setSlides(newSlides);
                                                                                updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                                            }}
                                                                        >
                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                            Remove Schema
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : slide.diagram_url ? (
                                                            <>
                                                                <img src={slide.diagram_url} alt="Slide Diagram" className="w-full h-full object-cover" />
                                                                {!isReadOnly && (
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/diagram:opacity-100 transition-opacity flex items-center justify-center">
                                                                        <button 
                                                                            className="text-white hover:text-red-400 bg-black/60 p-2 rounded-full"
                                                                            onClick={() => {
                                                                                const newSlides = [...slides];
                                                                                delete newSlides[index].diagram_url;
                                                                                setSlides(newSlides);
                                                                                updateThing(thing.id, { content: { ...thing.content, slides: newSlides } });
                                                                            }}
                                                                            title="Remove Diagram"
                                                                        >
                                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                                                                <span className="text-xs text-center px-4">Drag Diagram Here</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {/* Regenerate Context Action */}
                                                {!isReadOnly && (
                                                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            className="text-[10px] h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
                                                            onClick={() => handleRegenerateSlide(index)}
                                                            disabled={regeneratingSlideIndex === index || regeneratingSlideIndex !== null}
                                                        >
                                                            {regeneratingSlideIndex === index ? (
                                                                <span className="flex items-center gap-1">
                                                                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current"></span>
                                                                    Regenerating...
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center">
                                                                    <Play className="w-3 h-3 mr-1" /> Regenerate Slide
                                                                </span>
                                                            )}
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Connector Arrow (if not last) */}
                                            {index < slides.length - 1 && (
                                                <div className="py-2 text-slate-300 dark:text-slate-700">
                                                    <ChevronRight className="w-6 h-6 rotate-90" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Zoom Image Modal */}
            {zoomedImage && (
                <div 
                    className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm cursor-zoom-out"
                    onClick={() => setZoomedImage(null)}
                >
                    <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
                        <img 
                            src={zoomedImage} 
                            alt="Zoomed Figure" 
                            className="max-w-full max-h-full object-contain shadow-2xl rounded"
                        />
                        <button 
                            className="absolute top-4 right-4 p-2 bg-black/50 text-white hover:bg-black/80 rounded-full transition-colors pointer-events-auto"
                            onClick={(e) => {
                                e.stopPropagation();
                                setZoomedImage(null);
                            }}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
