/**
 * Fragment Types
 *
 * Data models for representing selections within documents.
 * Each fragment type corresponds to a specific content type.
 *
 * PEP 8 style comments
 */

// Base fragment interface
export interface Fragment {
    type: "text" | "range" | "cell" | "region" | "message" | "slide";
    content?: string;  // The selected content (text, etc.)
}

// Text fragment for PDF, Markdown, plain text
export interface TextFragment extends Fragment {
    type: "text";
    startOffset: number;
    endOffset: number;
    pageNumber?: number;  // For PDFs
    lineStart?: number;   // For line-based selection
    lineEnd?: number;
}

// Cell/range fragment for spreadsheets
export interface CellFragment extends Fragment {
    type: "cell";
    sheet?: string;
    range: string;  // "A1:B5" notation
    values?: any[][]; // The actual cell values
}

// Region fragment for images
export interface RegionFragment extends Fragment {
    type: "region";
    x: number;
    y: number;
    width: number;
    height: number;
}

// Message fragment for conversations
export interface MessageFragment extends Fragment {
    type: "message";
    messageId: string;
    startOffset?: number;
    endOffset?: number;
}

// Slide fragment for presentations
export interface SlideFragment extends Fragment {
    type: "slide";
    slideNumber: number;
    elementId?: string;
}
