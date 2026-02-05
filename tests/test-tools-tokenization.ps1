# 简化的工具调用测试脚本 V3
# 支持流式输出测试

$uri = "http://127.0.0.1:3456/v1/messages"

# 使用简单的 JSON 字符串
$json = '
{
    "model": "ds,r1",
    "messages": [
        {
            "role": "user",
            "content": "请验证：身份证 310101199001011234，手机 13800138000"
        }
    ],
    "tools": [
        {
            "name": "verify_user_info",
            "description": "验证信息",
            "input_schema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "phone": { "type": "string" }
                },
                "required": ["id", "phone"]
            }
        }
    ],
    "tool_choice": { "type": "tool", "name": "verify_user_info" },
    "stream": true,
    "max_tokens": 1000
}
'

try {
    Write-Host "Sending request..." -ForegroundColor Yellow
    
    # Load assembly
    Add-Type -AssemblyName System.Net.Http
    
    # Use HttpClient
    $httpClient = New-Object System.Net.Http.HttpClient
    $content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
    $responseTask = $httpClient.PostAsync($uri, $content)
    $response = $responseTask.Result
    
    Write-Host "Response status: $($response.StatusCode)" -ForegroundColor Green
    
    $rawResponse = $response.Content.ReadAsStringAsync().Result
    
    if ($json -match '"stream":\s*true') {
        Write-Host "Streaming response detected. Raw output fragment:" -ForegroundColor Gray
        Write-Host ($rawResponse.Substring(0, [Math]::Min(1000, $rawResponse.Length)))
        
        # Simple check for values in raw text
        $idPass = $rawResponse -match "310101199001011234"
        $phonePass = $rawResponse -match "13800138000"
        
        if ($idPass) {
            Write-Host "[PASS] ID restored correctly in stream!" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] ID not found or still tokenized in stream." -ForegroundColor Red
        }
        
        if ($phonePass) {
            Write-Host "[PASS] Phone restored correctly in stream!" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Phone not found or still tokenized in stream." -ForegroundColor Red
        }
    }
    else {
        $responseObj = $rawResponse | ConvertFrom-Json
        $toolUse = $null
        
        if ($responseObj.content) {
            foreach ($item in $responseObj.content) {
                if ($item.type -eq "tool_use") {
                    $toolUse = $item
                    break
                }
            }
        }
        
        if ($toolUse) {
            Write-Host "TOOL USE FOUND: $($toolUse.name)" -ForegroundColor Cyan
            $args = $toolUse.input
            Write-Host "ARGUMENTS:"
            Write-Host ($args | ConvertTo-Json)
            
            if ($args.id -eq "310101199001011234") {
                Write-Host "[PASS] ID restored correctly: $($args.id)" -ForegroundColor Green
            } else {
                Write-Host "[FAIL] ID mismatch: $($args.id)" -ForegroundColor Red
            }
            
            if ($args.phone -eq "13800138000") {
                Write-Host "[PASS] Phone restored correctly: $($args.phone)" -ForegroundColor Green
            } else {
                Write-Host "[FAIL] Phone mismatch: $($args.phone)" -ForegroundColor Red
            }
        } else {
            Write-Host "NO TOOL USE FOUND in response." -ForegroundColor Red
            Write-Host $rawResponse
        }
    }

}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}
