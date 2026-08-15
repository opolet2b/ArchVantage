import { canvasPluginRegistry } from "./registry";
import { ComplianceAuditViewer } from "../components/semantic-canvas/viewers";

canvasPluginRegistry.registerPlugin({
    type: "compliance_audit_tool",
    ViewerComponent: ComplianceAuditViewer
});
