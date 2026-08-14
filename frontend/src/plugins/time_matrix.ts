import { canvasPluginRegistry } from "./registry";
import { TimeMatrixViewer } from "../components/semantic-canvas/viewers";

canvasPluginRegistry.registerPlugin({
    type: "time_matrix_tool",
    ViewerComponent: TimeMatrixViewer
});
