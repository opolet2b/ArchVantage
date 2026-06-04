import { API_URL } from "./utils";
import { toast } from "@/components/ui/use-toast";

export interface TTSOptions {
    presetName?: string;
    text: string;
}

class SpeechService {
    private currentAudio: HTMLAudioElement | null = null;
    private abortController: AbortController | null = null;
    private isGenerating: boolean = false;

    /**
     * Speaks the given text using the configured TTS preset.
     */
    async speak(text: string, presetName?: string) {
        // 1. If already generating, warn or handle
        if (this.isGenerating) {
            toast({
                title: "Generating Audio",
                description: "A TTS request is already in progress. Please wait...",
            });
            return;
        }

        // Stop any current playback
        this.stop();
        this.isGenerating = true;
        this.abortController = new AbortController();

        // 1. Fetch default or specific preset to check if it is browser native
        try {
            const token = localStorage.getItem("token") || "";
            const headers = {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            };

            const defaultsRes = await fetch(`${API_URL}/config/defaults`, { headers });
            const defaults = defaultsRes.ok ? await defaultsRes.json() : {};
            const activePresetName = presetName || defaults.default_tts;

            if (!activePresetName) {
                toast({
                    title: "TTS Not Configured",
                    description: "Please select a default Text-to-Speech preset in Settings.",
                    variant: "destructive"
                });
                this.isGenerating = false;
                return;
            }

            const presetsRes = await fetch(`${API_URL}/config/presets`, { headers });
            const presetsData = presetsRes.ok ? await presetsRes.json() : {};
            const preset = presetsData.presets?.find((p: any) => p.name === activePresetName);

            if (!preset) {
                toast({
                    title: "Preset Not Found",
                    description: `The TTS preset "${activePresetName}" could not be found.`,
                    variant: "destructive"
                });
                this.isGenerating = false;
                return;
            }

            if (preset.is_browser_native) {
                this.speakBrowserNative(text, preset);
                this.isGenerating = false;
            } else {
                await this.speakRemote(text, activePresetName);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("TTS Generation aborted.");
                return;
            }
            console.error("Failed to trigger speech:", error);
            toast({
                title: "Speech Failed",
                description: "An error occurred while trying to generate speech.",
                variant: "destructive"
            });
            this.isGenerating = false;
        }
    }

    private speakBrowserNative(text: string, preset: any) {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        
        const utterance = new SpeechSynthesisUtterance(text);
        if (preset.voice_name) {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === preset.voice_name);
            if (voice) utterance.voice = voice;
        }
        utterance.pitch = preset.pitch || 1.0;
        utterance.rate = preset.speed || 1.0;
        
        window.speechSynthesis.speak(utterance);
    }

    private async speakRemote(text: string, presetName: string) {
        try {
            toast({
                title: "Generating Audio",
                description: "Synthesizing speech with the remote provider...",
            });
            const token = localStorage.getItem("token") || "";
            const res = await fetch(`${API_URL}/tts/generate`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ text, config_name: presetName }),
                signal: this.abortController?.signal
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                this.currentAudio = new Audio(url);
                this.currentAudio.play();
            } else {
                const errorText = await res.text();
                console.error("Remote TTS failed:", errorText);
                toast({
                    title: "Remote TTS Failed",
                    description: errorText || "The remote speech service returned an error.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error("Failed to fetch remote speech:", error);
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Downloads the generated audio file for the given text.
     */
    async download(text: string, presetName?: string) {
        try {
            const token = localStorage.getItem("token") || "";
            const headers = {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            };
            const defaultsRes = await fetch(`${API_URL}/config/defaults`, { headers });
            const defaults = defaultsRes.ok ? await defaultsRes.json() : {};
            const activePresetName = presetName || defaults.default_tts;

            if (!activePresetName) {
                toast({
                    title: "TTS Not Configured",
                    description: "Please select a default TTS preset in Settings before downloading.",
                    variant: "destructive"
                });
                return;
            }

            const res = await fetch(`${API_URL}/tts/generate`, {
                method: "POST",
                headers: headers,
                body: JSON.stringify({ text, config_name: activePresetName })
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `speech_${new Date().getTime()}.wav`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                const errorText = await res.text();
                toast({
                    title: "Download Failed",
                    description: errorText || "Failed to generate audio for download.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error("Failed to download speech:", error);
            toast({
                title: "Download Error",
                description: "An error occurred while preparing the download.",
                variant: "destructive"
            });
        }
    }

    stop() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isGenerating = false;

        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }
}

export const speechService = new SpeechService();
