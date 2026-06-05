# Vocal Note Canvas Tool Documentation

The **Vocal Note** tool is an interactive canvas element designed to record, play, edit, splice, and transcribe audio content using local browser capabilities combined with AI-powered STT (Speech-To-Text) services on the backend.

## Features

1. **Interactive Recording Button**:
   - Displays a prominent red recording bubble when empty.
   - Turns into a blue stop bubble with a stop sign during active recording.
   
2. **AI Transcription**:
   - Recorded vocal notes are immediately sent to the backend STT service (`/api/stt/transcribe`) using the user's selected STT model configuration.
   - The transcribed text is saved within the node's content and displayed in a dedicated block below the waveform.

3. **High-Fidelity Audio Splicing & Editing**:
   - **Visual Waveform**: Renders calculated peak values from decoded audio buffers.
   - **Precision Playback**: Supports Play/Pause, jump to beginning/end, forward/rewind 5s, and cursor-based playback starting position.
   - **Selection Deletion**: Users can select regions on the waveform by dragging and delete them, which automatically joins the adjacent audio parts and re-transcribes the updated audio.
   - **Audio Splicing/Insertion**: Users can position the cursor at any timestamp, record a new segment, and insert/splice it exactly at that position.

## Technical Architecture

```mermaid
graph TD
    User([User]) -->|Drop Tool| CanvasPalette[Canvas Palette]
    CanvasPalette -->|vocal_note type| ReactFlow[React Flow Canvas]
    ReactFlow -->|Renders| VocalNoteNode[Vocal Note Node]
    
    VocalNoteNode -->|MediaRecorder API| Microphone[Microphone]
    Microphone -->|Audio WebM| AudioCtx[Browser AudioContext]
    AudioCtx -->|Decoded PCM| AudioBuffer[Audio Buffer]
    
    VocalNoteNode -->|bufferToWav| WavEncoder[WAV Encoder]
    WavEncoder -->|Audio WAV Blob| STTRoute[/api/stt/transcribe]
    STTRoute -->|STT Service| Whisper[OpenAI/Generic Whisper Provider]
    Whisper -->|Response Text| VocalNoteNode
    VocalNoteNode -->|Update Thing| ZustandStore[Zustand Store / DB]
```

### Audio Splicing Algorithms

#### 1. Selection Deletion
Cuts a slice from an `AudioBuffer` and joins the remaining segments.

```typescript
function deleteSelection(buffer: AudioBuffer, startSec: number, endSec: number): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.floor(endSec * sampleRate);
  const selectionLength = endSample - startSample;
  
  const newLength = buffer.length - selectionLength;
  const audioCtx = new AudioContext();
  const newBuffer = audioCtx.createBuffer(buffer.numberOfChannels, newLength, sampleRate);
  
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const oldData = buffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    
    // Copy part 1 (before start)
    newData.set(oldData.subarray(0, startSample), 0);
    // Copy part 2 (after end)
    newData.set(oldData.subarray(endSample), startSample);
  }
  return newBuffer;
}
```

#### 2. Splicing/Insertion
Inserts a new recorded buffer inside the original buffer at a given timestamp.

```typescript
function insertBuffer(original: AudioBuffer, toInsert: AudioBuffer, offsetSec: number): AudioBuffer {
  const sampleRate = original.sampleRate;
  const insertIndex = Math.floor(offsetSec * sampleRate);
  
  const newLength = original.length + toInsert.length;
  const audioCtx = new AudioContext();
  const newBuffer = audioCtx.createBuffer(original.numberOfChannels, newLength, sampleRate);
  
  for (let channel = 0; channel < original.numberOfChannels; channel++) {
    const originalData = original.getChannelData(channel);
    const insertData = toInsert.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    
    // Copy original up to insertIndex
    newData.set(originalData.subarray(0, insertIndex), 0);
    // Copy insert data
    newData.set(insertData, insertIndex);
    // Copy original after insertIndex
    newData.set(originalData.subarray(insertIndex), insertIndex + toInsert.length);
  }
  return newBuffer;
}
```

## User Guide

1. **Add a Vocal Note**: Drag and drop the **Vocal Note** tool from the **Canvas Tools** panel onto the canvas.
2. **Record**: Click the big red microphone button to start recording. Speak into your microphone and click the blue stop bubble to finish.
3. **Play**: Use the audio player controls (Play, Rewind, Forward, Beginning, End) to play back your note.
4. **Edit**:
   - Click/drag over the waveform to select a segment. A **Delete** action will appear. Click to remove that audio segment.
   - Click at any point on the waveform to position the playback cursor. Click **Insert Recording** to record a segment and splice it into the note at that exact location.
5. **Auto-Transcription**: The node automatically converts all modifications/recordings into text using the selected STT engine configured in your settings.
