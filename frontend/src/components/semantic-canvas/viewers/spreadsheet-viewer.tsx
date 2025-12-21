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
    const [page, setPage] = React.useState(0);
    const PAGE_SIZE = 100;

    // Reset page when loading new content
    React.useEffect(() => {
        setPage(0);
    }, [content]);

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

    // State for multi-selection tracking
    const lastSelectedRowRef = React.useRef<number | null>(null);
    const lastSelectedColRef = React.useRef<number | null>(null);
    const lastSelectedCellRef = React.useRef<{ r: number; c: number } | null>(null);

    // Handle cell click
    const handleCellClick = (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
        if (!selectionEnabled || !onSelect) return;

        let newSelectedCells = [...selectedCells];
        let fragmentRange = "";
        let fragmentValues: any[][] = [];
        let type: "cell" | "range" = "cell";
        let cellContent = "";

        // Handle Shift+Click (Rectangular Range)
        if (e.shiftKey && lastSelectedCellRef.current) {
            const rStart = Math.min(lastSelectedCellRef.current.r, rowIndex);
            const rEnd = Math.max(lastSelectedCellRef.current.r, rowIndex);
            const cStart = Math.min(lastSelectedCellRef.current.c, colIndex);
            const cEnd = Math.max(lastSelectedCellRef.current.c, colIndex);

            newSelectedCells = [];
            for (let r = rStart; r <= rEnd; r++) {
                const rowVals = [];
                for (let c = cStart; c <= cEnd; c++) {
                    newSelectedCells.push({ row: r, col: c });
                    rowVals.push(data[r]?.[c]);
                }
                fragmentValues.push(rowVals);
            }

            // Calculations for range string
            // Data index 0 = Sheet row 1 (since header is row 0)
            // XLSX.utils uses 0-based indexing.
            // Previous code used `rowIndex + 1`, implying visual rows start at 2 (Header = 1).
            // Let's stick to that convention.
            const startRef = XLSX.utils.encode_cell({ r: rStart + 1, c: cStart });
            const endRef = XLSX.utils.encode_cell({ r: rEnd + 1, c: cEnd });
            fragmentRange = `${startRef}:${endRef}`;
            type = "range";
            cellContent = `Cells ${fragmentRange}`;

        } else {
            // Single Cell Select
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex });
            const cellValue = data[rowIndex]?.[colIndex];

            fragmentRange = cellRef;
            cellContent = String(cellValue ?? "");
            fragmentValues = [[cellValue]];
            type = "cell";

            newSelectedCells = [{ row: rowIndex, col: colIndex }];
            lastSelectedCellRef.current = { r: rowIndex, c: colIndex };
        }

        const fragment: CellFragment = {
            type: "cell",
            sheet: activeSheet,
            range: fragmentRange,
            content: cellContent,
            values: fragmentValues,
            selectionType: type,
        };

        setSelectedCells(newSelectedCells);
        onSelect(fragment);
    };

    // Handle row click (select entire row)
    const handleRowClick = (rowIndex: number, e: React.MouseEvent) => {
        if (!selectionEnabled || !onSelect) return;

        let newSelectedCells = [...selectedCells];
        let description = "";
        let fragmentRange = "";
        let fragmentValues: any[][] = [];
        let type: "row" | "range" = "row";

        // Handle Shift+Click (Range)
        if (e.shiftKey && lastSelectedRowRef.current !== null) {
            const start = Math.min(lastSelectedRowRef.current, rowIndex);
            const end = Math.max(lastSelectedRowRef.current, rowIndex);

            // Clear previous if simple shift-select logic (or just add?)
            // For simplicity: Clear all and select range
            newSelectedCells = [];
            for (let r = start; r <= end; r++) {
                headers.forEach((_, c) => newSelectedCells.push({ row: r, col: c }));
                fragmentValues.push(data[r]);
            }
            fragmentRange = `${start + 1}:${end + 1}`;
            description = `Rows ${start + 1}-${end + 1}`;
            type = "range";
        }
        // Handle Ctrl/Cmd+Click (Toggle/Add - simplified to Add for now)
        else if (e.metaKey || e.ctrlKey) {
            // Add this row
            headers.forEach((_, c) => newSelectedCells.push({ row: rowIndex, col: c }));
            fragmentValues.push(data[rowIndex]); // Note: this might separate values weirdly for disjoint rows

            // Complex fragment for multi-select? Just show latest or range?
            // User wants "rows: 1, 3, 5" or "rows: 1-5"
            // Let's rely on calculating the full range from newSelectedCells later if needed
            // For now, simplify: just select this row visually, set fragment to this specific addition?
            // Or better: Re-calculate full bounding box? 
            // Let's reset purely to this row for fragment, but keep visual selection?
            // No, standard behavior: Shift defines range, Ctrl adds. 
            // Let's implement Shift (Range) primarily as requested "multiple rows".

            lastSelectedRowRef.current = rowIndex;
            const rowNum = rowIndex + 1;
            fragmentRange = `${rowNum}:${rowNum}`;
            fragmentValues = [data[rowIndex]];
            description = rowValues.join(", ");
        }
        // Normal Click (Single Row)
        else {
            newSelectedCells = headers.map((_, colIndex) => ({ row: rowIndex, col: colIndex }));
            lastSelectedRowRef.current = rowIndex;
            const rowNum = rowIndex + 1;
            fragmentRange = `${rowNum}:${rowNum}`;
            fragmentValues = [data[rowIndex]];
            description = fragmentValues[0].join(", ");
        }

        const fragment: CellFragment = {
            type: "cell",
            sheet: activeSheet,
            range: fragmentRange,
            content: description,
            values: fragmentValues,
            selectionType: type === "range" ? "range" : "row",
        };

        setSelectedCells(newSelectedCells);
        onSelect(fragment);
    };

    // Handle column click (select entire column)
    const handleColumnClick = (colIndex: number, e: React.MouseEvent) => {
        if (!selectionEnabled || !onSelect) return;

        let newSelectedCells = [...selectedCells];
        let fragmentRange = "";
        let fragmentValues: any[][] = [];
        let type: "column" | "range" = "column";

        // Handle Shift+Click (Range)
        if (e.shiftKey && lastSelectedColRef.current !== null) {
            const start = Math.min(lastSelectedColRef.current, colIndex);
            const end = Math.max(lastSelectedColRef.current, colIndex);

            newSelectedCells = [];
            const colValues: any[][] = []; // Vector of columns

            // Collect data for ALL rows in these columns
            for (let r = 0; r < data.length; r++) {
                const rowVals = [];
                for (let c = start; c <= end; c++) {
                    newSelectedCells.push({ row: r, col: c });
                    rowVals.push(data[r][c]);
                }
                colValues.push(rowVals);
            }

            fragmentValues = colValues;
            fragmentRange = `${getColumnLetter(start)}:${getColumnLetter(end)}`;
            type = "range";
        }
        else {
            newSelectedCells = data.map((_, rowIndex) => ({ row: rowIndex, col: colIndex }));
            lastSelectedColRef.current = colIndex;
            const colLetter = getColumnLetter(colIndex);
            fragmentRange = `${colLetter}:${colLetter}`;
            fragmentValues = data.map(row => [row[colIndex]]);
        }

        const fragment: CellFragment = {
            type: "cell",
            sheet: activeSheet,
            range: fragmentRange,
            content: "Column Selection",
            values: fragmentValues,
            selectionType: type === "range" ? "range" : "column",
        };

        setSelectedCells(newSelectedCells);
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

    const totalPages = Math.ceil(data.length / PAGE_SIZE);
    const paginatedData = data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Sheet tabs */}
            {sheets.length > 1 && (
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 border-b shrink-0 overflow-x-auto">
                    {sheets.map((sheet) => (
                        <button
                            key={sheet}
                            onClick={() => setActiveSheet(sheet)}
                            className={cn(
                                "px-2 py-1 text-xs rounded whitespace-nowrap",
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

            {/* Table */}
            <div className="flex-1 overflow-auto max-w-full relative">
                <table className="min-w-max border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-sm">
                        <tr>
                            <th className="border border-slate-300 dark:border-slate-600 px-2 py-1 w-8 bg-slate-100 dark:bg-slate-800">
                                #
                            </th>
                            {headers.map((header, i) => (
                                <th
                                    key={i}
                                    onClick={(e) => handleColumnClick(i, e)}
                                    className={cn(
                                        "border border-slate-300 dark:border-slate-600 px-2 py-1 text-left font-medium bg-slate-100 dark:bg-slate-800",
                                        selectionEnabled && "cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
                                    )}
                                    title="Click to select column (Shift+Click for range)"
                                >
                                    <span className="text-muted-foreground mr-1">{getColumnLetter(i)}</span>
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row, index) => {
                            const rowIndex = page * PAGE_SIZE + index;
                            return (
                                <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                                    <td
                                        onClick={(e) => handleRowClick(rowIndex, e)}
                                        className={cn(
                                            "border border-slate-300 dark:border-slate-600 px-2 py-1 text-muted-foreground text-center bg-slate-50 dark:bg-slate-800 sticky left-0 z-10",
                                            selectionEnabled && "cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
                                        )}
                                        title="Click to select row (Shift+Click for range)"
                                    >
                                        {rowIndex + 2}
                                    </td>
                                    {headers.map((_, colIndex) => {
                                        const isSelected = selectedCells.some(
                                            (c) => c.row === rowIndex && c.col === colIndex
                                        );
                                        return (
                                            <td
                                                key={colIndex}
                                                onClick={(e) => handleCellClick(rowIndex, colIndex, e)}
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
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-t shrink-0">
                    <div className="text-xs text-muted-foreground">
                        Page {page + 1} of {totalPages} ({data.length} rows)
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="px-2 py-1 rounded bg-white dark:bg-slate-700 border shadow-sm text-xs disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-600"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="px-2 py-1 rounded bg-white dark:bg-slate-700 border shadow-sm text-xs disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-600"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
