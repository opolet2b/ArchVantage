import * as React from "react";
import { Thing } from "@/components/semantic-canvas/canvas-store";
import { useCanvasStore } from "@/components/semantic-canvas/canvas-store";
import { DataGrid, renderTextEditor, Column, SelectColumn, SortColumn } from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Settings } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface SpreadsheetToolViewerProps {
    thing: Thing;
}

type ColumnType = "text" | "checkbox" | "dropdown";

interface ColumnConfig {
    type: ColumnType;
    options?: string;
}

export function SpreadsheetToolViewer({ thing }: SpreadsheetToolViewerProps) {
    const updateThing = useCanvasStore(state => state.updateThing);
    const [selectedRows, setSelectedRows] = React.useState<ReadonlySet<number>>(new Set());
    const [sortColumns, setSortColumns] = React.useState<readonly SortColumn[]>([]);

    const initialData: string[][] = thing.content?.data || [
        ["", "", ""],
        ["", "", ""],
        ["", "", ""]
    ];

    const columnsConfig: Record<number, ColumnConfig> = thing.content?.columnsConfig || {};

    const updateColumnConfig = (colIndex: number, config: ColumnConfig) => {
        updateThing(thing.id, {
            content: {
                ...thing.content,
                columnsConfig: {
                    ...columnsConfig,
                    [colIndex]: config
                }
            }
        });
    };

    const colCount = Math.max(...initialData.map(r => r.length), 3);

    const columns: Column<any>[] = [
        SelectColumn,
        {
            key: "rowIndex",
            name: "#",
            width: 40,
            frozen: true,
            sortable: true,
            renderCell: ({ row }) => (
                <div className="flex items-center justify-center w-full h-full text-xs text-muted-foreground font-mono">
                    {row.rowIndex + 1}
                </div>
            )
        },
        ...Array.from({ length: colCount }, (_, i) => {
            const config = columnsConfig[i] || { type: "text" };
            
            return {
                key: `col${i}`,
                name: config.name || String.fromCharCode(65 + i),
                resizable: true,
                sortable: true,
                renderHeaderCell: (props: any) => (
                    <div className="flex items-center justify-between w-full group">
                        <span>{props.column.name}</span>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button 
                                    className="p-1 hover:bg-muted/80 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" 
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 shadow-xl z-50" onClick={e => e.stopPropagation()} side="bottom" align="end">
                                <div className="grid gap-4">
                                    <div className="space-y-1">
                                        <h4 className="font-medium leading-none text-sm">Column Type</h4>
                                        <p className="text-xs text-muted-foreground">Configure custom editors for column {props.column.name}.</p>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label className="text-xs">Type</Label>
                                        <Select 
                                            value={config.type || "text"} 
                                            onValueChange={(val) => updateColumnConfig(i, { ...config, type: val as ColumnType })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="text">Text (Default)</SelectItem>
                                                <SelectItem value="checkbox">Checkbox</SelectItem>
                                                <SelectItem value="dropdown">Dropdown Menu</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {config.type === "dropdown" && (
                                        <div className="grid gap-2">
                                            <Label className="text-xs">Options (comma separated)</Label>
                                            <Input 
                                                className="h-8 text-xs"
                                                value={config.options || ""} 
                                                onChange={(e) => updateColumnConfig(i, { ...config, options: e.target.value })}
                                                placeholder="Yes, No, Maybe"
                                            />
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                ),
                renderCell: ({ row, column, onRowChange }: any) => {
                    const val = row[column.key];
                    if (config.type === "checkbox") {
                        return (
                            <div className="flex items-center justify-center h-full w-full">
                                <input 
                                    type="checkbox" 
                                    className="cursor-pointer w-4 h-4"
                                    checked={val === "true"} 
                                    onChange={(e) => {
                                        onRowChange({ ...row, [column.key]: e.target.checked ? "true" : "false" });
                                    }}
                                />
                            </div>
                        );
                    }
                    return val;
                },
                renderEditCell: (props: any) => {
                    if (config.type === "dropdown") {
                        const options = (config.options || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                        return (
                            <select 
                                autoFocus
                                className="w-full h-full bg-background outline-none px-2 text-sm border-2 border-primary ring-0"
                                value={props.row[props.column.key] || ""}
                                onChange={(e) => props.onRowChange({ ...props.row, [props.column.key]: e.target.value }, true)}
                                onBlur={() => props.onClose(true, false)}
                            >
                                <option value=""></option>
                                {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                            </select>
                        );
                    }
                    if (config.type === "checkbox") {
                        // We handle clicking directly via renderCell, so we bypass edit mode
                        return null; 
                    }
                    return renderTextEditor(props);
                }
            };
        })
    ];

    let rows = initialData.map((row, rIdx) => {
        const rowObj: any = { rowIndex: rIdx };
        for (let i = 0; i < colCount; i++) {
            rowObj[`col${i}`] = row[i] || "";
        }
        return rowObj;
    });

    if (sortColumns.length > 0) {
        const sortColumn = sortColumns[0];
        rows = [...rows].sort((a, b) => {
            const valA = a[sortColumn.columnKey] || "";
            const valB = b[sortColumn.columnKey] || "";
            if (valA === valB) return 0;
            const comp = valA > valB ? 1 : -1;
            return sortColumn.direction === "ASC" ? comp : -comp;
        });
    }

    const handleRowsChange = (newRows: any[]) => {
        const newData = [...initialData];
        newRows.forEach(rowObj => {
            const rIdx = rowObj.rowIndex;
            const rowArr = [];
            for (let i = 0; i < colCount; i++) {
                rowArr.push(rowObj[`col${i}`] || "");
            }
            newData[rIdx] = rowArr;
        });

        updateThing(thing.id, {
            content: {
                ...thing.content,
                data: newData
            }
        });
    };

    const addRow = () => {
        const newRow = Array(colCount).fill("");
        updateThing(thing.id, {
            content: { ...thing.content, data: [...initialData, newRow] }
        });
    };

    const addColumn = () => {
        const newData = initialData.map(row => [...row, ""]);
        updateThing(thing.id, {
            content: { ...thing.content, data: newData }
        });
    };

    const deleteSelectedRows = () => {
        if (selectedRows.size === 0) return;
        const newData = initialData.filter((_, i) => !selectedRows.has(i));
        updateThing(thing.id, {
            content: { ...thing.content, data: newData }
        });
        setSelectedRows(new Set());
    };

    const deleteColumn = () => {
        if (colCount <= 1) return;
        const newData = initialData.map(row => {
            const newRow = [...row];
            newRow.pop();
            return newRow;
        });
        updateThing(thing.id, {
            content: { ...thing.content, data: newData }
        });
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const pasteData = e.clipboardData.getData("text");
        if (!pasteData) return;
        const pasteRows = pasteData.split(/\r?\n/).filter(r => r).map(r => r.split(/\t|,/));
        const newData = [...initialData, ...pasteRows];
        updateThing(thing.id, {
            content: { ...thing.content, data: newData }
        });
        e.preventDefault();
    };

    return (
        <div className="flex flex-col flex-1 h-full w-full min-h-0 min-w-0 bg-background rounded-b-md overflow-hidden text-sm" onPaste={handlePaste}>
            <div className="flex items-center gap-1 p-1 border-b bg-muted/30 shrink-0 flex-wrap">
                <Button variant="ghost" size="sm" onClick={addRow} className="h-7 px-2 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Row
                </Button>
                <Button variant="ghost" size="sm" onClick={addColumn} className="h-7 px-2 text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Col
                </Button>
                {selectedRows.size > 0 && (
                    <Button variant="destructive" size="sm" onClick={deleteSelectedRows} className="h-7 px-2 text-xs">
                        <Trash2 className="h-3 w-3 mr-1" /> Del {selectedRows.size} Rows
                    </Button>
                )}
                <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={deleteColumn} className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" title="Delete Last Column">
                        <Trash2 className="h-3 w-3" /> Col
                    </Button>
                </div>
            </div>
            <div className="flex-1 overflow-hidden relative group/grid min-h-0 min-w-0">
                <DataGrid
                    columns={columns}
                    rows={rows}
                    onRowsChange={handleRowsChange}
                    className="h-full w-full text-sm rdg-light"
                    rowHeight={32}
                    headerRowHeight={36}
                    rowKeyGetter={(row) => row.rowIndex}
                    selectedRows={selectedRows}
                    onSelectedRowsChange={setSelectedRows}
                    sortColumns={sortColumns}
                    onSortColumnsChange={setSortColumns}
                    defaultColumnOptions={{
                        sortable: true,
                        resizable: true
                    }}
                />
            </div>
        </div>
    );
}
