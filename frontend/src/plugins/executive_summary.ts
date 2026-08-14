import { canvasPluginRegistry } from "./registry";
import { ExecutiveSummaryViewer } from "../components/semantic-canvas/viewers";

canvasPluginRegistry.registerPlugin({
    type: "executive_summary_tool",
    ViewerComponent: ExecutiveSummaryViewer
});
