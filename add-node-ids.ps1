# Add Node ID Script
# This script adds ID badges to all node components

$nodes = @(
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
    
    # Add id to function params if not present
    if ($content -match 'export const \w+Node = memo\(function[^(]*\(\{([^}]*)\}') {
        $params = $matches[1]
        if ($params -notmatch '\bid\b') {
            $content = $content -replace '(export const \w+Node = memo\(function[^(]*\(\{)', '$1`n    id,'
        }
    }
    
    # Add relative class to main div if not present
    $content = $content -replace '(className=\{`[^`]*)(border-2[^`]*)`\})', '$1$2 relative`}'
    
    # Add ID badge after opening main div
    $badge = @"
            {/* Node ID Badge */}
            <div className="absolute -top-2 left-2 bg-slate-700 text-white text-[10px] px-1.5 py-0.5 rounded font-mono opacity-70">
                {id.substring(0, 6)}
            </div>
            
"@
    
    # Insert badge after first div opening if not already present
    if ($content -notmatch 'Node ID Badge') {
        $content = $content -replace '(className=\{`[^`]*border-2[^>]*>\r?\n)', "`$1$badge"
    }
    
    Set-Content $path $content -NoNewline
    Write-Host "Updated $node"
}
