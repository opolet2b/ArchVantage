# Update all node files to conditionally show IDs
$nodes = @(
    "llm-decision-node.tsx",
    "call-tool-node.tsx",
    "condition-node.tsx",
    "end-node.tsx",
    "foreach-node.tsx",
    "http-request-node.tsx",
    "json-mapping-node.tsx",
    "text-template-node.tsx"
)

foreach ($node in $nodes) {
    $path = "c:\Users\opole\Downloads\ChatBotn\frontend\src\components\builder\nodes\$node"
    $content = Get-Content $path -Raw
    
    # Add showNodeIds state after activeNodeId (if not already added)
    if ($content -notmatch 'showNodeIds') {
        $content = $content -replace '(const activeNodeId = useBuilderStore\(\(state\) => state\.activeNodeId\);)', "`$1`r`n    const showNodeIds = useBuilderStore((state) => state.showNodeIds);"
        
        # If no activeNodeId, add after the first useBuilderStore or after NodeData
        if ($content -notmatch 'const showNodeIds') {
            # Try adding after node data assignment
            $content = $content -replace '(const nodeData = .* as unknown as .*Data;)', "`$1`r`n    const showNodeIds = useBuilderStore((state) => state.showNodeIds);"
        }
    }
    
    # Wrap ID badge in conditional
    $content = $content -replace '(\s*){/\* Node ID Badge \*/}\s*<div className="absolute -top-6', "`$1{/* Node ID Badge */}`r`n`$1{showNodeIds && (`r`n`$1    <div className=`"absolute -top-6"
    $content = $content -replace '(ID: \{id\})\s*</div>', "`$1`r`n                </div>`r`n            )}"
    
    Set-Content $path $content -NoNewline
    Write-Host "Updated $node"
}

Write-Host "All nodes updated!"
