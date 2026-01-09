"use client";

import React from "react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    PieChart,
    Pie,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell
} from "recharts";
import { cn } from "@/lib/utils";

interface ChartViewerProps {
    type: string;
    data: any; // The full payload from LLM (data + config)
    className?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function ChartViewer({ type, data, className }: ChartViewerProps) {
    // Normalize input: data might be just an array (simple mode) or an object with config
    const chartData = Array.isArray(data) ? data : (data.data || []);
    const config = Array.isArray(data) ? {} : data;

    // Infer keys if not provided
    const keys = chartData.length > 0 ? Object.keys(chartData[0]) : [];
    const xAxisKey = config.xAxis || keys[0] || "name";
    // If series not defined, assume all other numerics are series
    const series = config.series || keys.filter(k => k !== xAxisKey && typeof chartData[0][k] === 'number').map(k => ({ key: k }));

    const renderChart = () => {
        switch (type.toLowerCase()) {
            case "linechart":
            case "line":
                return (
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xAxisKey} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {series.map((s: any, idx: number) => (
                            <Line
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                stroke={s.color || COLORS[idx % COLORS.length]}
                                name={s.label || s.key}
                            />
                        ))}
                    </LineChart>
                );

            case "barchart":
            case "bar":
                return (
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xAxisKey} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {series.map((s: any, idx: number) => (
                            <Bar
                                key={s.key}
                                dataKey={s.key}
                                fill={s.color || COLORS[idx % COLORS.length]}
                                name={s.label || s.key}
                            />
                        ))}
                    </BarChart>
                );

            case "areachart":
            case "area":
                return (
                    <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xAxisKey} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {series.map((s: any, idx: number) => (
                            <Area
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                stackId="1"
                                stroke={s.color || COLORS[idx % COLORS.length]}
                                fill={s.color || COLORS[idx % COLORS.length]}
                                name={s.label || s.key}
                            />
                        ))}
                    </AreaChart>
                );

            case "piechart":
            case "pie":
                const pieKey = series[0]?.key || keys.find(k => typeof chartData[0][k] === 'number');
                return (
                    <PieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey={pieKey}
                            nameKey={xAxisKey} // Use x-axis key as the label name
                            label
                        >
                            {chartData.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                );

            default:
                return (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        Unsupported chart type: {type}
                    </div>
                );
        }
    };

    return (
        <div className={cn("w-full h-full min-h-[300px] p-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border", className)}>
            {config.title && (
                <h3 className="text-sm font-semibold mb-4 text-center">{config.title}</h3>
            )}
            <ResponsiveContainer width="100%" height="90%">
                {renderChart()}
            </ResponsiveContainer>
        </div>
    );
}
