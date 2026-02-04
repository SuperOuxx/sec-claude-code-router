# 简化的工具调用测试脚本 V3

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
    "stream": false,
    "max_tokens": 1000
}
'

Write-Host "Sending request..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -Body $json -ContentType "application/json"
    
    Write-Host "Response received." -ForegroundColor Green
    
    $content = $response.content
    $toolUse = $null
    
    # 查找 tool_use
    if ($content) {
        foreach ($item in $content) {
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
        
        $id = $args.id
        $phone = $args.phone
        
        # 验证 ID
        if ($id -eq "310101199001011234") {
            Write-Host "[PASS] ID restored correctly: $id" -ForegroundColor Green
        }
        elseif ($id -match "ID_") {
            Write-Host "[FAIL] ID is still tokenized: $id" -ForegroundColor Red
        }
        else {
            Write-Host "[WARN] ID mismatch: $id" -ForegroundColor Yellow
        }
        
        # 验证 Phone
        if ($phone -eq "13800138000") {
            Write-Host "[PASS] Phone restored correctly: $phone" -ForegroundColor Green
        }
        elseif ($phone -match "MOBILE_") {
            Write-Host "[FAIL] Phone is still tokenized: $phone" -ForegroundColor Red
        }
        else {
            Write-Host "[WARN] Phone mismatch: $phone" -ForegroundColor Yellow
        }
        
    }
    else {
        Write-Host "NO TOOL USE FOUND in response." -ForegroundColor Red
        Write-Host ($response | ConvertTo-Json -Depth 5)
    }

}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}
