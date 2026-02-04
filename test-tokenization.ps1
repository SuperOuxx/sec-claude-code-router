# 简化的令牌化测试脚本

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  令牌化功能测试" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 获取配置文件路径
$configPath = "$env:USERPROFILE\.claude-code-router\config.json"
Write-Host "配置文件: $configPath" -ForegroundColor Yellow

# 检查令牌化是否启用
if (Test-Path $configPath) {
    $config = Get-Content $configPath | ConvertFrom-Json
    if ($config.enableTokenization) {
        Write-Host "✅ 令牌化已启用" -ForegroundColor Green
    } else {
        Write-Host "⚠️ 警告: 令牌化未启用，请在配置文件中添加:" -ForegroundColor Yellow
        Write-Host '  "enableTokenization": true' -ForegroundColor Gray
    }
} else {
    Write-Host "❌ 配置文件不存在" -ForegroundColor Red
}

Write-Host ""
Write-Host "测试1: 发送包含敏感数据的请求" -ForegroundColor Green
Write-Host "----------------------------------------" -ForegroundColor Gray

$body = @"
{
  "model": "ds,r1",
  "messages": [
    {
      "role": "user",
      "content": "我的身份证号是 310101199001011234，手机号是 13800138000，请简短地重复这两个信息"
    }
  ],
  "stream": false,
  "max_tokens": 200
}
"@

try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:3456/v1/messages" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
        } `
        -Body $body `
        -TimeoutSec 30

    Write-Host ""
    Write-Host "✅ 请求成功!" -ForegroundColor Green
    Write-Host ""
    Write-Host "LLM 响应内容:" -ForegroundColor Cyan
    
    if ($response.content -and $response.content.Count -gt 0) {
        $text = $response.content[0].text
        Write-Host $text -ForegroundColor White
        
        Write-Host ""
        Write-Host "验证结果:" -ForegroundColor Yellow
        
        # 检查响应中是否包含真实数据（已还原）
        if ($text -match "310101199001011234") {
            Write-Host "  ✅ 身份证号已还原: 310101199001011234" -ForegroundColor Green
        } else {
            Write-Host "  ❌ 身份证号未找到" -ForegroundColor Red
        }
        
        if ($text -match "13800138000") {
            Write-Host "  ✅ 手机号已还原: 13800138000" -ForegroundColor Green
        } else {
            Write-Host "  ❌ 手机号未找到" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "💡 提示: 查看日志确认令牌化过程" -ForegroundColor Yellow
        Write-Host "   日志位置: $env:USERPROFILE\.claude-code-router\logs\" -ForegroundColor Gray
        Write-Host "   应该看到: 'Request body tokenized' 和 'Tokenized: chinese_id_card -> ID_xxxxx'" -ForegroundColor Gray
        
    } else {
        Write-Host "⚠️ 响应格式异常" -ForegroundColor Yellow
        Write-Host ($response | ConvertTo-Json -Depth 10)
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ 请求失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "可能的原因:" -ForegroundColor Yellow
    Write-Host "  1. CCR 服务未启动 (运行 'ccr status' 检查)" -ForegroundColor Gray
    Write-Host "  2. 端口 3456 被占用" -ForegroundColor Gray
    Write-Host "  3. 模型配置错误" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
