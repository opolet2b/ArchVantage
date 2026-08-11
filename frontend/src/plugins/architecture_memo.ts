import { canvasPluginRegistry } from "./registry";
import { ArchitectureMemoViewer } from "../components/semantic-canvas/viewers";

canvasPluginRegistry.registerPlugin({
    type: "architecture_memo",
    ViewerComponent: ArchitectureMemoViewer
});
