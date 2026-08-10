import { canvasPluginRegistry } from "./registry";
import { TradeOffMatrixViewer } from "../components/semantic-canvas/viewers";

canvasPluginRegistry.registerPlugin({
    type: "trade_off_matrix",
    ViewerComponent: TradeOffMatrixViewer
});
