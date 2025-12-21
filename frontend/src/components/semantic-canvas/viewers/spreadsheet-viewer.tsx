/**
 * Spreadsheet Viewer Component
 *
 * Renders CSV and Excel files as interactive tables.
 * Supports cell/range selection for fragment creation.
 *
 * PEP 8 style comments
 */
"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import type { CellFragment } from "./types";

// =============================================================================
// Props
// =============================================================================

interface SpreadsheetViewerProps {
    /** The spreadsheet content - can be text (CSV) or file_path (blob URL) */
    content: string;
    /** File name to determine type */
    filename?: string;
    /** Callback when cells are selected */
    onSelect?: (fragment: CellFragment) => void;
    /** Optional className for styling */
    className?: string;
    /** Whether selection is enabled */
    selectionEnabled?: boolean;
}

// =============================================================================
// Spreadsheet Viewer Component
// =============================================================================

export function SpreadsheetViewer({
    content,
    filename,
    onSelect,
    className,
    selectionEnabled = true,
}: SpreadsheetViewerProps) {
    const [data, setData] = React.useState<any[][]>([]);
    const [headers, setHeaders] = React.useState<string[]>([]);
    const [sheets, setSheets] = React.useState<string[]>([]);
    const [activeSheet, setActiveSheet] = React.useState<string>("");
    const [selectedCells, setSelectedCells] = React.useState<{ row: number; col: number }[]>([]);
    const [isLoaded, setIsLoaded] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Manual load handler
    const handleLoad = React.useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            let workbook: XLSX.WorkBook;

            // Check if content is a blob URL (binary file)
            if (content.startsWith("blob:")) {
                const response = await fetch(content);
                const arrayBuffer = await response.arrayBuffer();
                workbook = XLSX.read(arrayBuffer, { type: "array" });
            } else {
                // Assume CSV or text content
                workbook = XLSX.read(content, { type: "string" });
            }

            // Get sheet names
            const sheetNames = workbook.SheetNames;
            setSheets(sheetNames);
            setActiveSheet(sheetNames[0] || "");

            // Parse first sheet
            if (sheetNames.length > 0) {
                const sheet = workbook.Sheets[sheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

                if (jsonData.length > 0) {
                    setHeaders(jsonData[0] as string[]);
                    setData(jsonData.slice(1) as any[][]);
                }
            }
            setIsLoaded(true);
        } catch (err) {
            console.error("Failed to parse spreadsheet:", err);
            setError("Failed to parse spreadsheet");
        } finally {
            setIsLoading(false);
        }
    }, [content]);

    // Handle cell click
    const handleCellClick = (rowIndex: number, colIndex: number) => {
        if (!selectionEnabled || !onSelect) return;

        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
        const cellValue = data[rowIndex]?.[colIndex];

        const fragment: CellFragment = {
            type: "cell",
            sheet: activeSheet,
            range: cellRef,
            content: String(cellValue ?? ""),
            values: [[cellValue]],
        };

        setSelectedCells([{ row: rowIndex, col: colIndex }]);
        onSelect(fragment);
    };

    // Column letter helper
    const getColumnLetter = (index: number): string => {
        return XLSX.utils.encode_col(index);
    };

    if (error) {
        return (
            <div className={cn("flex flex-col items-center justify-center p-4 gap-2", className)}>
                <span className="text-sm text-red-500">{error}</span>
                <button
                    onClick={handleLoad}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className={cn("flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800", className)}>
                {isLoading ? (
                    <span className="text-sm text-muted-foreground">Loading spreadsheet...</span>
                ) : (
                    <button
                        onClick={handleLoad}
                        className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-sm font-medium transition-colors"
                    >
                        Load Spreadsheet ({filename || "Data"})
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Sheet tabs */}
            {sheets.length > 1 && (
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 border-b">
                    {sheets.map((sheet) => (
                        <button
                            key={sheet}
                            onClick={() => setActiveSheet(sheet)}
                            className={cn(
                                "px-2 py-1 text-xs rounded",
                                activeSheet === sheet
                                    ? "bg-white dark:bg-slate-700 shadow"
                                    : "hover:bg-slate-200 dark:hover:bg-slate-700"
                            )}
                        >
                            {sheet}
                        </button>
                    ))}
                </div>
            )}

            {/* Table - Virtualization/Pagination Hack (First 500 rows) */}
            <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                        <tr>
                            <th className="border border-slate-300 dark:border-slate-600 px-2 py-1 w-8">
                                #
                            </th>
                            {headers.map((header, i) => (
                                <th
                                    key={i}
                                    className="border border-slate-300 dark:border-slate-600 px-2 py-1 text-left font-medium"
                                >
                                    <span className="text-muted-foreground mr-1">{getColumnLetter(i)}</span>
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.slice(0, 100).map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                                <td className="border border-slate-300 dark:border-slate-600 px-2 py-1 text-muted-foreground text-center bg-slate-50 dark:bg-slate-800">
                                    {rowIndex + 2}
                                </td>
                                {headers.map((_, colIndex) => {
                                    const isSelected = selectedCells.some(
                                        (c) => c.row === rowIndex && c.col === colIndex
                                    );
                                    return (
                                        <td
                                            key={colIndex}
                                            onClick={() => handleCellClick(rowIndex, colIndex)}
                                            className={cn(
                                                "border border-slate-300 dark:border-slate-600 px-2 py-1",
                                                selectionEnabled && "cursor-pointer",
                                                isSelected && "bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-500"
                                            )}
                                        >
                                            {row[colIndex] ?? ""}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {data.length > 100 && (
                            <tr>
                                <td colSpan={headers.length + 1} className="p-4 text-center text-muted-foreground bg-slate-50">
                                    Showing first 100 rows of {data.length} (Rendering limit applied)
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
