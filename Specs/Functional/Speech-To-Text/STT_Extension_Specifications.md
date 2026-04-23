# **SemanticCanvas Extension: Speech-to-Text (STT) Integration**

## **1\. Overview**

This extension introduces Speech-to-Text (STT) capabilities to the SemanticCanvas environment. It allows users to dictate text directly into "Text Things" and provides a configurable pipeline for various transcription engines (Local, Remote, or Browser-native).

## **2\. Configuration and Settings**

### **2.1 STT Model Profiles**

The "Models & API" settings section shall be expanded to include a dedicated tab for **STT Profiles**. Each profile defines a specific transcription provider and its parameters.

* **Provider Types**:  
  * **Local**: Integration with local STT engines (e.g., OpenAI Whisper running via Ollama or a dedicated local FastAPI endpoint).  
  * **Remote (API)**: Support for cloud-based providers such as OpenRouter, OpenAI (Whisper API), or Deepgram.  
  * **Browser-Native**: Utilizes the standard Web Speech API available in modern browsers (zero-cost, no server-side processing).  
* **Profile Parameters**:  
  * Profile Name: Unique identifier for the configuration.  
  * Endpoint URL: (For Local/Remote) The API target. Defaults to https://openrouter.ai/api/v1/audio/transcriptions for OpenRouter profiles.  
  * API Key: (For Remote) Secure credential storage.  
  * Model ID: Specific model string. For OpenRouter, supported models include:  
    * openai/whisper-large-v3  
    * openai/whisper-large-v3-turbo  
    * groq/whisper-large-v3  
    * groq/whisper-large-v3-turbo  
    * groq/distil-whisper-large-v3-en  
  * Language: ISO code (e.g., en-US, fr-FR) or Auto-detect.  
  * Temperature: Sampling temperature for probabilistic models (0.0 to 1.0).  
  * Prompt: (Optional) Contextual text to guide the model's style or terminology.

### **2.2 Global Defaults**

In the general AI settings, a **Default STT Profile** must be selectable. This profile is automatically assigned to any new Canvas or Text Thing unless explicitly overridden.

## **3\. User Interface (UI) Updates**

### **3.1 Top Panel Controls**

The Canvas top panel, which currently houses LLM and VLM selection dropdowns, shall be updated to include an **STT Selector**.

* **Component**: A searchable dropdown menu.  
* **Function**: Allows the user to change the active STT configuration for the entire canvas session.  
* **Visuals**: Prefixed with a Mic icon (Lucide-react: mic).

### **3.2 Text Thing (Node) Integration**

The "Text" type node is enhanced with direct voice input capabilities.

* **Microphone Icon**: A small button located in the node's toolbar or footer.  
* **Interactive States**:  
  * **Idle**: Standard gray mic icon.  
  * **Active/Listening**: Pulsing red icon or a glowing ring around the node to indicate the microphone is hot.  
  * **Processing**: A loading spinner replaces the mic icon while the audio is being transcribed by the backend.  
* **Input Logic**:  
  * Single-click to start/stop (Toggle).  
  * Transcription results are appended to the current text content or inserted at the cursor position if the node is in edit mode.

## **4\. Technical Implementation**

### **4.1 Backend Engine (FastAPI)**

The backend must handle audio streaming or file-based uploads depending on the provider.

* **Audio Pre-processing**: If using Whisper, the backend should handle basic noise reduction and normalization.  
* **Async Handling**: Transcription requests must be handled as asynchronous tasks to prevent blocking the UI.  
* **OpenRouter / OpenAI Integration**:  
  * Requests are sent as multipart/form-data.  
  * Mandatory fields: file (Blob/File), model.  
  * Optional fields: language, prompt, response\_format (default: json), temperature.  
* **Provider Adapters**:  
  * STTProviderInterface: Abstract class ensuring consistent output (Text \+ Confidence Score) regardless of the provider.

### **4.2 Browser Implementation**

For the Browser-Native provider:

* Use window.SpeechRecognition (or webkitSpeechRecognition).  
* Implement continuous listening logic if requested by the user.  
* **Limitation Handling**: Provide UI feedback if the browser does not support the Web Speech API or if microphone permissions are denied.

### **4.3 Data Model Updates (SQLite)**

* **Table stt\_configs**:  
  * id (PK)  
  * name (String)  
  * provider\_type (Enum: LOCAL, REMOTE, BROWSER)  
  * api\_endpoint (String, nullable)  
  * api\_key (Encrypted String, nullable)  
  * model\_id (String)  
  * language\_code (String)  
  * is\_default (Boolean)

## **5\. Security & Privacy**

* **Permission Management**: Explicit browser permission prompts must be triggered only when the user clicks the microphone icon.  
* **Data Privacy**: Local profiles must ensure audio data never leaves the local network. Remote profiles (OpenRouter, OpenAI) must comply with the general application RBAC and security protocols.  
* **Sensitive Data**: Implement a "Mute" indicator and an easy-access global stop button in the top panel to kill all active STT sessions.