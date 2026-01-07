from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
from enum import Enum

# --- Shared Types ---

class ContentType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    TABLE = "table"
    JSON = "json"

class AssetRef(BaseModel):
    id: str
    type: str  # pdf, png, etc.
    url: Optional[str] = None
    content: Optional[str] = None  # Resolved text content
    
# --- Extractor Contracts ---

class ExtractionInstructions(BaseModel):
    focus: str = Field(..., description="Main topic or elements to focus on during extraction")
    exclude: Optional[str] = Field(None, description="Elements or topics to explicitly ignore")
    additional_instructions: Optional[str] = Field(None, description="Detailed instructions for the extraction")
    mode: str = Field("default", description="Extraction mode: default, structured, image_only, etc.")

class ExtractorInput(BaseModel):
    assets: List[AssetRef]
    extraction_instructions: ExtractionInstructions

class ExtractedElement(BaseModel):
    source_id: str
    content_type: ContentType
    data: Union[str, Dict[str, Any]]
    metadata: Dict[str, Any] = Field(default_factory=dict)

class ExtractorOutput(BaseModel):
    extracted_elements: List[ExtractedElement]

# --- Agent Contracts ---

class AgentConfiguration(BaseModel):
    persona: str
    reasoning_depth: str # basic, comprehensive, etc.
    framework: Optional[str] = None
    instructions: str
    user_variables: Dict[str, Any] = Field(default_factory=dict)

class AgentInput(BaseModel):
    data_context: ExtractorOutput
    configuration: AgentConfiguration

class AnalyzedSection(BaseModel):
    title: str
    findings: List[str] = Field(default_factory=list)
    supporting_evidence: List[str] = Field(default_factory=list, description="List of source_ids")

class AnalysisResults(BaseModel):
    summary: str
    sections: List[AnalyzedSection]
    raw_data_points: Dict[str, Any] = Field(default_factory=dict)
    formatted_output: Optional[str] = Field(None, description="Use this for requested specific formats like Markdown tables, code blocks, or matrices.")

class AgentOutput(BaseModel):
    analysis_results: AnalysisResults

# --- Visualizer Contracts ---

class VisualConfig(BaseModel):
    output_format: str # Diagram, Table, Text, etc.
    result_type: str # Sequence diagram, Markdown report, etc.
    styling: Optional[str] = "default"

class VisualizerInput(BaseModel):
    analysis_data: AgentOutput
    visual_config: VisualConfig

class VisualPayload(BaseModel):
    structure_type: str # mermaid_spec, markdown, html_table
    content: str
    labels: List[str] = Field(default_factory=list)

class VisualizerOutput(BaseModel):
    visual_payload: VisualPayload

# --- Formatter Contracts ---

class TargetFormat(BaseModel):
    extension: str # pdf, docx, png
    template: Optional[str] = None

class FormatterInput(BaseModel):
    visual_payload: VisualizerOutput
    target_format: TargetFormat

class FinalOutput(BaseModel):
    file_name: str
    mime_type: str
    data_base64: str

class FormatterOutput(BaseModel):
    final_output: FinalOutput
