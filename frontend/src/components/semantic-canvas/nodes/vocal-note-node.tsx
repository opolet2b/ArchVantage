"use client";

import * as React from "react";
import { NodeProps, NodeResizer } from "reactflow";
import {
    Play,
    Pause,
    Square,
    SkipBack,
    SkipForward,
    FastForward,
    Rewind,
    Trash2,
    Loader2,
    Mic,
    Scissors,
    Volume2,
    Pencil,
    Check,
    X,
    FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "../canvas-store";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Vocal Note Node Component
 * 
 * An interactive vocal note component with recording, waveform display,
 * playback controls, cursor positioning, splicing/insertion, selection
 * deletion, and real-time AI transcription.
 */

// Helper to convert AudioBuffer to standard WAV Blob
function bufferToWav(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    let result;
    if (numOfChan === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        result = buffer.getChannelData(0);
    }
    
    const bufferLength = result.length * 2;
    const arrayBuffer = new ArrayBuffer(44 + bufferLength);
    const view = new DataView(arrayBuffer);
    
    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + bufferLength, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numOfChan, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, numOfChan * (bitDepth / 8), true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, bufferLength, true);
    
    // Write PCM audio data
    floatTo16BitPCM(view, 44, result);
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
    
    function interleave(inputL: Float32Array, inputR: Float32Array) {
        const length = inputL.length + inputR.length;
        const interleaved = new Float32Array(length);
        let index = 0;
        let inputIndex = 0;
        while (index < length) {
            interleaved[index++] = inputL[inputIndex];
            interleaved[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return interleaved;
    }
    
    function writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    
    function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }
}

export function VocalNoteNode({ id, data, selected }: NodeProps) {
    const { thing, onResizeEnd, onDelete } = data;
    const updateThing = useCanvasStore(state => state.updateThing);
    const accessLevel = useCanvasStore(state => state.accessLevel);
    const selectedSttModel = useCanvasStore(state => state.selectedSttModel);
    const sttProfiles = useCanvasStore(state => state.sttProfiles);
    const isReadOnly = accessLevel === "read";
    const { toast } = useToast();

    // Audio states
    const [audioBuffer, setAudioBuffer] = React.useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [currentTime, setCurrentTime] = React.useState(0);
    const [duration, setDuration] = React.useState(0);
    const [peaks, setPeaks] = React.useState<number[]>([]);

    // Splicing & selection states
    const [cursorTime, setCursorTime] = React.useState<number | null>(null);
    const [selectionStart, setSelectionStart] = React.useState<number | null>(null);
    const [selectionEnd, setSelectionEnd] = React.useState<number | null>(null);

    // Recording states
    const [isRecording, setIsRecording] = React.useState(false);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [recordingTime, setRecordingTime] = React.useState(0);

    // Inline text editing states
    const [isEditingText, setIsEditingText] = React.useState(false);
    const [editedText, setEditedText] = React.useState("");
    const [showTranscription, setShowTranscription] = React.useState(false);
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);

    // Title editing states
    const [isEditingTitle, setIsEditingTitle] = React.useState(false);
    const [editedTitle, setEditedTitle] = React.useState(thing.title || "");

    React.useEffect(() => {
        setEditedTitle(thing.title || "");
    }, [thing.title]);

    const handleSaveTitle = async () => {
        const trimmed = editedTitle.trim();
        if (!trimmed) {
            setEditedTitle(thing.title || "");
            setIsEditingTitle(false);
            return;
        }
        await updateThing(id, {
            title: trimmed
        });
        setIsEditingTitle(false);
    };

    React.useEffect(() => {
        setEditedText(thing.content?.text as string || "");
        if (thing.content?.text) {
            setShowTranscription(true);
        }
    }, [thing.content?.text]);

    const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
    const audioChunksRef = React.useRef<Blob[]>([]);
    const audioCtxRef = React.useRef<AudioContext | null>(null);
    const sourceNodeRef = React.useRef<AudioBufferSourceNode | null>(null);
    const playbackStartCtxTimeRef = React.useRef<number>(0);
    const playbackStartTimeOffsetRef = React.useRef<number>(0);
    const recordingTimerRef = React.useRef<NodeJS.Timeout | null>(null);
    const recognitionRef = React.useRef<any>(null);
    const accumulatedTextRef = React.useRef<string>("");
    const liveTranscriptRef = React.useRef<string>("");

    // Load and decode audio data from thing.content.audio
    React.useEffect(() => {
        const loadAudio = async () => {
            const base64Audio = thing.content?.audio as string;
            if (!base64Audio) {
                setAudioBuffer(null);
                setDuration(0);
                setPeaks([]);
                return;
            }
            try {
                const base64Data = base64Audio.split(",")[1] || base64Audio;
                const binaryString = window.atob(base64Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                try {
                    const decodedBuffer = await audioContext.decodeAudioData(bytes.buffer);
                    setAudioBuffer(decodedBuffer);
                    setDuration(decodedBuffer.duration);
                    generatePeaks(decodedBuffer);
                } finally {
                    audioContext.close().catch(console.error);
                }
            } catch (err) {
                console.error("Error decoding audio buffer", err);
            }
        };
        loadAudio();
    }, [thing.content?.audio]);

    // Generate downsampled peaks for the waveform display
    const generatePeaks = (buffer: AudioBuffer) => {
        const width = 150; // number of bars in waveform
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const generatedPeaks: number[] = [];
        for (let i = 0; i < width; i++) {
            let max = 0;
            for (let j = 0; j < step; j++) {
                const val = Math.abs(data[i * step + j] || 0);
                if (val > max) max = val;
            }
            generatedPeaks.push(max);
        }
        setPeaks(generatedPeaks);
    };

    // Playback loop for updating progress
    React.useEffect(() => {
        if (!isPlaying || !audioCtxRef.current || duration === 0) return;

        let frameId: number;
        const updateProgress = () => {
            const elapsed = audioCtxRef.current!.currentTime - playbackStartCtxTimeRef.current;
            const current = playbackStartTimeOffsetRef.current + elapsed;
            if (current >= duration) {
                setCurrentTime(duration);
                setIsPlaying(false);
            } else {
                setCurrentTime(current);
                frameId = requestAnimationFrame(updateProgress);
            }
        };
        frameId = requestAnimationFrame(updateProgress);
        return () => cancelAnimationFrame(frameId);
    }, [isPlaying, duration]);

    // Cleanup playback/recording on unmount
    React.useEffect(() => {
        return () => {
            if (sourceNodeRef.current) {
                sourceNodeRef.current.stop();
            }
            if (audioCtxRef.current) {
                audioCtxRef.current.close().catch(console.error);
            }
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, []);

    // Perform AI transcription on audio Blob and update the Thing
    const transcribeAndSave = async (audioBlob: Blob, updatedBuffer: AudioBuffer, isEdit: boolean = false) => {
        setIsProcessing(true);
        try {
            // Convert buffer to base64 audio
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64Audio = reader.result as string;

                // Fetch current STT profile
                const activeSttId = selectedSttModel;
                const activeProfile = sttProfiles?.find((p: any) => p.id?.toString() === activeSttId || p.name === activeSttId);
                const isBrowserSTT = activeProfile?.provider_type === "BROWSER" || activeProfile?.is_browser_native;

                let transcriptText = "";
                if (isBrowserSTT) {
                    if (isEdit) {
                        // Keep current text but let user know editing is client-only
                        transcriptText = thing.content?.text as string || "";
                        toast({
                            title: "Browser native dictation",
                            description: "Modifying audio with Browser Native STT does not automatically re-transcribe. Please edit transcription text manually.",
                            variant: "default"
                        });
                    } else {
                        transcriptText = liveTranscriptRef.current || "";
                    }
                } else {
                    // Transcribe via backend
                    const token = localStorage.getItem("token");
                    const formData = new FormData();
                    formData.append("file", audioBlob, "vocal_note.wav");
                    const configId = activeProfile?.id?.toString() || activeProfile?.name || "default";
                    formData.append("config_id", configId);

                    try {
                        const res = await fetch(`${API_URL}/stt/transcribe`, {
                            method: "POST",
                            headers: token ? { "Authorization": `Bearer ${token}` } : {},
                            body: formData
                        });

                        if (res.ok) {
                            const resData = await res.json();
                            transcriptText = resData.text || "";
                        } else {
                            const errorText = await res.text();
                            console.error("Transcription failed", errorText);
                            toast({ title: "Transcription Failed", description: errorText, variant: "destructive" });
                        }
                    } catch (err) {
                        console.error("Network transcription error", err);
                        toast({ title: "Transcription Error", description: "Failed to connect to STT server.", variant: "destructive" });
                    }
                }

                // Save to canvas store
                await updateThing(id, {
                    content: {
                        ...thing.content,
                        audio: base64Audio,
                        text: transcriptText
                    }
                });
                setIsProcessing(false);
            };
        } catch (err) {
            console.error("Error saving transcription", err);
            setIsProcessing(false);
        }
    };

    // Play, Pause, stop handlers
    const handlePlayPause = () => {
        if (isPlaying) {
            if (sourceNodeRef.current) {
                sourceNodeRef.current.stop();
                sourceNodeRef.current = null;
            }
            setIsPlaying(false);
        } else {
            if (!audioBuffer) return;
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            audioCtxRef.current = audioCtx;
            
            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);
            
            let startAt = currentTime >= duration ? 0 : currentTime;
            if (cursorTime !== null) {
                startAt = cursorTime;
            }
            
            playbackStartTimeOffsetRef.current = startAt;
            playbackStartCtxTimeRef.current = audioCtx.currentTime;
            
            source.start(0, startAt);
            sourceNodeRef.current = source;
            setIsPlaying(true);
            
            source.onended = () => {
                // If it ended naturally at the end of audio
                if (audioCtx.currentTime - playbackStartCtxTimeRef.current >= duration - startAt) {
                    setIsPlaying(false);
                    setCurrentTime(0);
                    setCursorTime(null);
                }
            };
        }
    };

    const handleJumpToBeginning = () => {
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
            sourceNodeRef.current = null;
            setIsPlaying(false);
        }
        setCurrentTime(0);
        setCursorTime(0);
    };

    const handleJumpToEnd = () => {
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
            sourceNodeRef.current = null;
            setIsPlaying(false);
        }
        setCurrentTime(duration);
        setCursorTime(duration);
    };

    const handleRewind = () => {
        const nextTime = Math.max(0, currentTime - 5);
        setCurrentTime(nextTime);
        if (cursorTime !== null) setCursorTime(Math.max(0, cursorTime - 5));
        if (isPlaying && audioBuffer) {
            handlePlayPause(); // stop
            setTimeout(() => {
                playbackStartTimeOffsetRef.current = nextTime;
                handlePlayPause(); // replay from new position
            }, 50);
        }
    };

    const handleForward = () => {
        const nextTime = Math.min(duration, currentTime + 5);
        setCurrentTime(nextTime);
        if (cursorTime !== null) setCursorTime(Math.min(duration, cursorTime + 5));
        if (isPlaying && audioBuffer) {
            handlePlayPause(); // stop
            setTimeout(() => {
                playbackStartTimeOffsetRef.current = nextTime;
                handlePlayPause(); // replay from new position
            }, 50);
        }
    };

    // Recording flow
    const startRecording = async (insertAtCursor: boolean = false) => {
        if (isReadOnly) return;
        try {
            if (isPlaying) {
                sourceNodeRef.current?.stop();
                setIsPlaying(false);
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            setRecordingTime(0);

            let recognitionPromise = Promise.resolve();

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            // Start browser native SpeechRecognition in parallel if browser native STT is selected
            const activeSttId = selectedSttModel;
            const activeProfile = sttProfiles?.find((p: any) => p.id?.toString() === activeSttId || p.name === activeSttId);
            const isBrowserSTT = activeProfile?.provider_type === "BROWSER" || activeProfile?.is_browser_native;

            if (isBrowserSTT) {
                accumulatedTextRef.current = "";
                liveTranscriptRef.current = "";
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                if (SpeechRecognition) {
                    const recognition = new SpeechRecognition();
                    recognition.lang = activeProfile.language_code || 'en-US';
                    recognition.continuous = true;
                    recognition.interimResults = true;
                    
                    let resolveRecognition: () => void;
                    recognitionPromise = new Promise<void>((resolve) => {
                        resolveRecognition = resolve;
                    });
                    
                    recognition.onresult = (event: any) => {
                        let finalTranscript = '';
                        let interimTranscript = '';
                        for (let i = event.resultIndex; i < event.results.length; ++i) {
                            const transcript = event.results[i][0].transcript;
                            if (event.results[i].isFinal) {
                                finalTranscript += transcript;
                            } else {
                                interimTranscript += transcript;
                            }
                        }
                        if (finalTranscript) {
                            accumulatedTextRef.current += (accumulatedTextRef.current ? " " : "") + finalTranscript;
                        }
                        liveTranscriptRef.current = accumulatedTextRef.current + (interimTranscript ? (accumulatedTextRef.current ? " " : "") + interimTranscript : "");
                    };
                    
                    recognition.onerror = (err: any) => {
                        console.error("[STT] Browser SpeechRecognition error", err);
                        resolveRecognition();
                    };
                    
                    recognition.onend = () => {
                        resolveRecognition();
                    };

                    recognitionRef.current = recognition;
                    recognition.start();
                }
            }

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                if (audioChunksRef.current.length === 0) return;

                const recordedBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                setIsProcessing(true);

                try {
                    // Decode recorded clip
                    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                    let finalBuffer: AudioBuffer;
                    try {
                        const arrayBuffer = await recordedBlob.arrayBuffer();
                        const recordedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

                        if (insertAtCursor && audioBuffer) {
                            // Insert/splice buffer
                            const original = audioBuffer;
                            const toInsert = recordedBuffer;
                            const sampleRate = original.sampleRate;
                            const insertIndex = Math.floor(currentTime * sampleRate);
                            
                            const newLength = original.length + toInsert.length;
                            finalBuffer = audioCtx.createBuffer(original.numberOfChannels, newLength, sampleRate);
                            
                            for (let channel = 0; channel < original.numberOfChannels; channel++) {
                                const originalData = original.getChannelData(channel);
                                const insertData = toInsert.getChannelData(channel);
                                const newData = finalBuffer.getChannelData(channel);
                                
                                newData.set(originalData.subarray(0, insertIndex), 0);
                                newData.set(insertData, insertIndex);
                                newData.set(originalData.subarray(insertIndex), insertIndex + toInsert.length);
                            }
                        } else {
                            // Fresh recording or appending
                            finalBuffer = recordedBuffer;
                        }
                    } finally {
                        audioCtx.close().catch(console.error);
                    }

                    // Wait for recognition to finish processing
                    if (isBrowserSTT && recognitionRef.current) {
                        try {
                            recognitionRef.current.stop();
                        } catch (e) {}
                        await recognitionPromise;
                    }

                    // Convert final buffer to WAV blob
                    const wavBlob = bufferToWav(finalBuffer);
                    const isEdit = insertAtCursor || !!audioBuffer;
                    await transcribeAndSave(wavBlob, finalBuffer, isEdit);

                    // Reset positioning
                    setCursorTime(null);
                    setSelectionStart(null);
                    setSelectionEnd(null);
                } catch (err) {
                    console.error("Error processing recorded audio", err);
                    toast({ title: "Recording Error", description: "Failed to process audio recording.", variant: "destructive" });
                    setIsProcessing(false);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            
            // Record timer
            recordingTimerRef.current = setInterval(() => {
                setRecordingTime(t => t + 1);
            }, 1000);

            toast({ title: "Recording Started", description: "Speak now. Click the stop button when done." });
        } catch (err: any) {
            console.error("Mic access denied", err);
            toast({ title: "Microphone Error", description: `Please allow mic permissions. ${err.message}`, variant: "destructive" });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
    };

    // Selection deletion
    const handleDeleteSelection = async () => {
        if (isReadOnly || !audioBuffer || selectionStart === null || selectionEnd === null) return;
        
        const start = Math.min(selectionStart, selectionEnd);
        const end = Math.max(selectionStart, selectionEnd);
        
        setIsProcessing(true);
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const sampleRate = audioBuffer.sampleRate;
            const startSample = Math.floor(start * sampleRate);
            const endSample = Math.floor(end * sampleRate);
            const selectionLength = endSample - startSample;
            
            const newLength = audioBuffer.length - selectionLength;
            const finalBuffer = audioCtx.createBuffer(audioBuffer.numberOfChannels, newLength, sampleRate);
            
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const oldData = audioBuffer.getChannelData(channel);
                const newData = finalBuffer.getChannelData(channel);
                
                newData.set(oldData.subarray(0, startSample), 0);
                newData.set(oldData.subarray(endSample), startSample);
            }

            const wavBlob = bufferToWav(finalBuffer);
            await transcribeAndSave(wavBlob, finalBuffer, true);

            setSelectionStart(null);
            setSelectionEnd(null);
            setCursorTime(null);
            setCurrentTime(0);
            toast({ title: "Selection Deleted", description: "Audio joined successfully." });
        } catch (err) {
            console.error("Error deleting selection", err);
            toast({ title: "Error", description: "Failed to delete selection.", variant: "destructive" });
            setIsProcessing(false);
        }
    };

    // Waveform click & drag handlers
    const waveformRef = React.useRef<HTMLDivElement>(null);
    const isDraggingRef = React.useRef(false);

    const handleWaveformMouseDown = (e: React.MouseEvent) => {
        if (!waveformRef.current || duration === 0) return;
        const rect = waveformRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, offsetX / rect.width));
        const clickedTime = pct * duration;

        isDraggingRef.current = true;
        setSelectionStart(clickedTime);
        setSelectionEnd(clickedTime);
        setCursorTime(clickedTime);
        setCurrentTime(clickedTime);

        if (isPlaying) {
            handlePlayPause(); // pause playback
        }
    };

    const handleWaveformMouseMove = (e: React.MouseEvent) => {
        if (!isDraggingRef.current || !waveformRef.current || duration === 0 || selectionStart === null) return;
        const rect = waveformRef.current.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, offsetX / rect.width));
        const dragTime = pct * duration;

        setSelectionEnd(dragTime);
        setCursorTime(dragTime);
        setCurrentTime(dragTime);
    };

    const handleWaveformMouseUp = () => {
        isDraggingRef.current = false;
        // If selection size is extremely tiny, treat it as a single cursor point
        if (selectionStart !== null && selectionEnd !== null) {
            const diff = Math.abs(selectionStart - selectionEnd);
            if (diff < 0.1) {
                setSelectionStart(null);
                setSelectionEnd(null);
            }
        }
    };

    // Format time helpers (e.g. 0:00)
    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s < 10 ? "0" : ""}${s}`;
    };

    return (
        <div
            className={cn(
                "group relative min-w-[320px] min-h-[220px] flex flex-col transition-all duration-200 rounded-xl bg-slate-900 border text-white overflow-hidden shadow-lg",
                selected ? "ring-2 ring-blue-500 shadow-2xl scale-[1.02] z-10" : "hover:shadow-xl border-slate-800"
            )}
            style={{
                width: "100%",
                height: "100%"
            }}
        >
            {/* Header Title */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-slate-800/80 shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Volume2 className="h-4 w-4 text-blue-400 shrink-0" />
                    {isEditingTitle ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0 nodrag">
                            <input
                                type="text"
                                value={editedTitle}
                                onChange={(e) => setEditedTitle(e.target.value)}
                                onKeyDown={async (e) => {
                                    if (e.key === "Enter") {
                                        await handleSaveTitle();
                                    } else if (e.key === "Escape") {
                                        setEditedTitle(thing.title || "");
                                        setIsEditingTitle(false);
                                    }
                                }}
                                onBlur={handleSaveTitle}
                                className="bg-slate-900 text-white border border-slate-700 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-blue-500 w-full font-medium"
                                autoFocus
                            />
                        </div>
                    ) : (
                        <div 
                            className="flex items-center gap-1.5 cursor-pointer group/title flex-1 min-w-0 select-none"
                            onDoubleClick={() => {
                                if (!isReadOnly) {
                                    setIsEditingTitle(true);
                                }
                            }}
                            title={isReadOnly ? undefined : "Double click to rename"}
                        >
                            <span className="font-semibold text-sm truncate max-w-[180px]">
                                {thing.title || "Vocal Note"}
                            </span>
                            {!isReadOnly && (
                                <Pencil 
                                    className="h-3 w-3 text-slate-500 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsEditingTitle(true);
                                    }}
                                />
                            )}
                        </div>
                    )}
                </div>
                {isProcessing && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-400 animate-pulse font-medium">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Transcribing...</span>
                    </div>
                )}
            </div>

            {/* Core Body Container */}
            <div className="flex-1 flex flex-col p-4 justify-start gap-3 min-h-0 overflow-hidden">
                {!audioBuffer && !isRecording && (
                    /* Initial Empty State - Big Red Recording Bubble */
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-6">
                        <button
                            disabled={isReadOnly}
                            onClick={() => startRecording(false)}
                            className={cn(
                                "relative h-24 w-24 rounded-full flex items-center justify-center transition-all transform duration-300 text-white cursor-pointer overflow-hidden",
                                isReadOnly 
                                    ? "bg-slate-800/80 text-slate-500 cursor-not-allowed border border-slate-700" 
                                    : "hover:scale-105 active:scale-95"
                            )}
                            style={isReadOnly ? undefined : {
                                background: "radial-gradient(circle at 35% 30%, rgba(239, 68, 68, 0.85) 0%, rgba(185, 28, 28, 0.45) 55%, rgba(127, 29, 29, 0.75) 100%)",
                                border: "1.5px solid rgba(255, 255, 255, 0.45)",
                                boxShadow: "0 12px 35px rgba(239, 68, 68, 0.35), inset 0 6px 8px rgba(255, 255, 255, 0.45), inset 0 -6px 12px rgba(0, 0, 0, 0.5)",
                                backdropFilter: "blur(10px)",
                                WebkitBackdropFilter: "blur(10px)"
                            }}
                            title="Start Recording Vocal Note"
                        >
                            {!isReadOnly && (
                                <div 
                                    className="absolute top-1 left-2.5 right-2.5 h-7 rounded-t-full pointer-events-none"
                                    style={{
                                        background: "linear-gradient(to bottom, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.05) 100%)",
                                        opacity: 0.85
                                    }}
                                />
                            )}
                            <Mic className={cn("h-9 w-9 relative z-10 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]", !isReadOnly && "animate-pulse")} />
                        </button>
                        <span className="text-sm font-medium text-slate-400 select-none">
                            {isReadOnly ? "Read Only Mode" : "Drop onto Canvas & Press to Record"}
                        </span>
                    </div>
                )}

                {isRecording && (
                    /* Recording State - Big Blue Stop Sign Bubble */
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-6">
                        <button
                            onClick={stopRecording}
                            className="relative h-24 w-24 rounded-full text-white flex items-center justify-center transition-all transform active:scale-95 hover:scale-105 cursor-pointer overflow-hidden animate-pulse"
                            style={{
                                background: "radial-gradient(circle at 35% 30%, rgba(59, 130, 246, 0.85) 0%, rgba(29, 78, 216, 0.45) 55%, rgba(30, 58, 138, 0.75) 100%)",
                                border: "1.5px solid rgba(255, 255, 255, 0.45)",
                                boxShadow: "0 12px 35px rgba(59, 130, 246, 0.35), inset 0 6px 8px rgba(255, 255, 255, 0.45), inset 0 -6px 12px rgba(0, 0, 0, 0.5)",
                                backdropFilter: "blur(10px)",
                                WebkitBackdropFilter: "blur(10px)"
                            }}
                            title="Stop Recording"
                        >
                            <div 
                                className="absolute top-1 left-2.5 right-2.5 h-7 rounded-t-full pointer-events-none"
                                style={{
                                    background: "linear-gradient(to bottom, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.05) 100%)",
                                    opacity: 0.85
                                }}
                            />
                            <Square className="h-9 w-9 fill-current relative z-10 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                        </button>
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-semibold text-blue-400 animate-pulse">
                                Recording...
                            </span>
                            <span className="text-2xl font-mono tracking-wider text-white">
                                {formatTime(recordingTime)}
                            </span>
                        </div>
                    </div>
                )}

                {audioBuffer && !isRecording && (
                    /* Waveform & Playback Area */
                    <div className="flex-1 flex flex-col justify-start gap-2.5 min-h-[145px]">
                        {/* Audio Waveform */}
                        <div className="relative bg-slate-950/40 border border-slate-800/40 rounded-lg p-2 flex flex-col justify-center min-h-[70px] nodrag">
                            {/* Waveform Drag Handler Overlay */}
                            <div
                                ref={waveformRef}
                                onMouseDown={handleWaveformMouseDown}
                                onMouseMove={handleWaveformMouseMove}
                                onMouseUp={handleWaveformMouseUp}
                                className="absolute inset-0 z-10 cursor-col-resize select-none nodrag"
                            />
                            
                            {/* Visual Bar Waves */}
                            <div className="h-10 flex items-center gap-[2px] justify-between relative px-1">
                                {peaks.map((peak, idx) => {
                                    const pct = idx / peaks.length;
                                    const barTime = pct * duration;

                                    const isPast = barTime <= currentTime;
                                    
                                    // Highlights if bar is within selection
                                    let isSelected = false;
                                    if (selectionStart !== null && selectionEnd !== null) {
                                        const start = Math.min(selectionStart, selectionEnd);
                                        const end = Math.max(selectionStart, selectionEnd);
                                        isSelected = barTime >= start && barTime <= end;
                                    }

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                height: `${Math.max(12, peak * 100)}%`
                                            }}
                                            className={cn(
                                                "w-[2px] rounded-full transition-colors",
                                                isSelected 
                                                    ? "bg-amber-400" 
                                                    : isPast 
                                                        ? "bg-blue-400" 
                                                        : "bg-slate-700"
                                            )}
                                        />
                                    );
                                })}

                                {/* Playing Cursor Line */}
                                <div
                                    className="absolute top-0 bottom-0 w-[1.5px] bg-red-400 pointer-events-none transition-all duration-100"
                                    style={{
                                        left: `${(currentTime / duration) * 100}%`
                                    }}
                                />
                            </div>
                        </div>

                        {/* Selection & Cursor context bar */}
                        <div className="flex items-center justify-between text-xs px-1 text-slate-400 shrink-0">
                            <div>
                                <span className="font-mono">{formatTime(currentTime)}</span>
                                <span className="mx-1.5">/</span>
                                <span className="font-mono text-slate-500">{formatTime(duration)}</span>
                            </div>
                            
                            {selectionStart !== null && selectionEnd !== null ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-amber-400 text-[11px] font-medium font-mono">
                                        Selected: {formatTime(Math.min(selectionStart, selectionEnd))} - {formatTime(Math.max(selectionStart, selectionEnd))}
                                    </span>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        onClick={handleDeleteSelection}
                                        className="h-6 px-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
                                    >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Delete
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-blue-400 font-mono">
                                        Position: {formatTime(currentTime)}
                                    </span>
                                    {!isReadOnly && (
                                        <Button
                                            size="xs"
                                            variant="outline"
                                            onClick={() => startRecording(true)}
                                            className="h-6 px-2 border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white"
                                        >
                                            <Mic className="h-3 w-3 mr-1 text-red-400" />
                                            Insert Recording
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Playback Controls & Action Buttons */}
                        <div className="flex items-center justify-between gap-1 shrink-0 pt-1">
                            {/* Playback controls */}
                            <div className="flex items-center gap-0.5">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800" onClick={handleJumpToBeginning} title="Beginning">
                                    <SkipBack className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800" onClick={handleRewind} title="Rewind 5s">
                                    <Rewind className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    onClick={handlePlayPause}
                                    className="h-9 w-9 rounded-full bg-blue-500 text-white hover:bg-blue-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/10 active:scale-95"
                                >
                                    {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800" onClick={handleForward} title="Forward 5s">
                                    <FastForward className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800" onClick={handleJumpToEnd} title="End">
                                    <SkipForward className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* Action buttons (Right side) */}
                            <div className="flex items-center gap-1">
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className={cn(
                                        "h-8 w-8 transition-colors",
                                        isDialogOpen ? "text-blue-400 bg-blue-500/10 hover:text-blue-300" : "text-slate-400 hover:text-white hover:bg-slate-800"
                                    )}
                                    onClick={() => {
                                        setEditedText(thing.content?.text as string || "");
                                        setIsDialogOpen(true);
                                    }}
                                    title="View & Edit Transcription"
                                >
                                    <FileText className="h-4 w-4" />
                                </Button>
                                
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-rose-500 hover:text-rose-400 hover:bg-rose-950/20"
                                    onClick={() => {
                                        if (window.confirm("Are you sure you want to clear this audio note?")) {
                                            updateThing(id, {
                                                content: { ...thing.content, audio: null, text: "" }
                                            });
                                            setAudioBuffer(null);
                                            setDuration(0);
                                            setPeaks([]);
                                        }
                                    }}
                                    title="Clear Audio Note"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Transcription Result Preview */}
                {showTranscription && audioBuffer && !isRecording && (
                    <div className="flex-1 min-h-[40px] pt-2 border-t border-slate-800/80 flex flex-col gap-1.5 overflow-y-auto custom-scrollbar select-text text-left">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold select-none">
                                AI Transcription
                            </span>
                            <button
                                onClick={() => {
                                    setEditedText(thing.content?.text as string || "");
                                    setIsDialogOpen(true);
                                }}
                                className="text-xs text-blue-400 hover:text-blue-350 font-medium select-none"
                                title="Open Full Screen / Edit"
                            >
                                Expand
                            </button>
                        </div>
                        <p 
                            className="text-xs text-slate-300 leading-relaxed italic cursor-pointer line-clamp-2"
                            onClick={() => {
                                setEditedText(thing.content?.text as string || "");
                                setIsDialogOpen(true);
                            }}
                            title="Click to view full transcription"
                        >
                            {thing.content?.text ? `"${thing.content.text as string}"` : "No transcription yet. Click to add."}
                        </p>
                    </div>
                )}
            </div>

            {/* Resize Handles */}
            {selected && !isReadOnly && (
                <NodeResizer
                    minWidth={320}
                    minHeight={220}
                    isVisible={selected && !isReadOnly}
                    lineClassName="border-blue-500"
                    handleClassName="h-3 w-3 bg-white border-2 border-blue-500 rounded-full"
                    onResizeEnd={(_, { width, height }) => onResizeEnd(id, width, height)}
                />
            )}

            {/* Full-screen Transcription Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) setIsEditingText(false);
            }}>
                <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-white rounded-xl shadow-2xl nodrag">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-100">
                            <FileText className="h-5 w-5 text-blue-400" />
                            <span>Transcription - {thing.title || "Vocal Note"}</span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-2 flex flex-col gap-4">
                        {isEditingText ? (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Edit Transcription</label>
                                <Textarea
                                    value={editedText}
                                    onChange={(e) => setEditedText(e.target.value)}
                                    placeholder="Type or edit the transcription here..."
                                    className="bg-slate-950 border-slate-800 text-slate-200 text-sm p-3 focus:border-blue-500 rounded-lg min-h-[180px] font-sans resize-y focus:outline-none"
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Transcription Content</label>
                                    {thing.content?.text && (
                                        <Button
                                            size="xs"
                                            variant="ghost"
                                            onClick={() => {
                                                navigator.clipboard.writeText(thing.content?.text as string);
                                                toast({ title: "Copied!", description: "Transcription copied to clipboard." });
                                            }}
                                            className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800"
                                        >
                                            Copy Text
                                        </Button>
                                    )}
                                </div>
                                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 max-h-[300px] overflow-y-auto select-text">
                                    <p className="text-sm text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                                        {thing.content?.text ? thing.content.text as string : "No transcription available yet. Speak during recording or edit to add text manually."}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full border-t border-slate-800/80 pt-3">
                        <div>
                            {!isReadOnly && !isEditingText && (
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setEditedText(thing.content?.text as string || "");
                                        setIsEditingText(true);
                                    }}
                                    className="bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/20"
                                >
                                    <Pencil className="h-4 w-4 mr-1.5" />
                                    Edit Text
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {isEditingText ? (
                                <>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setEditedText(thing.content?.text as string || "");
                                            setIsEditingText(false);
                                        }}
                                        className="text-slate-400 hover:text-white"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={async () => {
                                            await updateThing(id, {
                                                content: { ...thing.content, text: editedText }
                                            });
                                            setIsEditingText(false);
                                        }}
                                        className="bg-emerald-600 text-white hover:bg-emerald-500 font-semibold"
                                    >
                                        Save Changes
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    onClick={() => setIsDialogOpen(false)}
                                    className="bg-slate-850 text-white hover:bg-slate-800 font-semibold border border-slate-750"
                                >
                                    Close
                                </Button>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
