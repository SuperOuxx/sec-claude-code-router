# 数据脱敏与令牌化配置指南

## 功能概述

Claude Code Router 提供了自动化的敏感数据脱敏功能，通过令牌化技术在将数据发送给 LLM 之前自动替换敏感信息，并在响应返回时自动还原真实数据。

## 工作原理

### 三阶段保护流程

```
用户请求 → [入站拦截] → 令牌化 → 发送给 LLM
                             ↓
客户端 ← [出站还原] ← 真实数据还原 ← LLM 响应
```

1. **入站映射（Input Guard）**: 自动检测请求中的敏感数据（如身份证号、手机号、邮箱等）并替换为无语义令牌
2. **模型处理**: LLM 仅看到令牌（如 `ID_A1B2C3D4`），完全隔离真实数据
3. **出站还原（Output Guard）**: 响应返回前自动将令牌还原为真实数据

## 配置方法

### 基础配置

在 `~/.claude-code-router/config.json` 中添加：

```json
{
  "enableTokenization": true,
  "tokenization": {
    "maxTokens": 10000,
    "ttl": 3600000
  }
}
```

### 配置选项说明

| 选项 | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `enableTokenization` | boolean | `true` | 是否启用令牌化功能 |
| `tokenization.maxTokens` | number | `10000` | 最大令牌存储数量 |
| `tokenization.ttl` | number | `3600000` | 令牌有效期（毫秒，默认1小时） |
| `tokenization.customRules` | array | `[]` | 自定义检测规则 |
| `tokenization.disabledRules` | array | `[]` | 禁用的默认规则名称 |

## 默认检测规则

系统内置以下敏感数据检测规则：

| 规则名称 | 检测内容 | 令牌前缀 | 默认状态 |
|---------|---------|---------|---------|
| `chinese_id_card` | 中国身份证号（18位） | `ID_` | ✅ 启用 |
| `chinese_mobile` | 中国手机号 | `MOBILE_` | ✅ 启用 |
| `email` | 邮箱地址 | `EMAIL_` | ✅ 启用 |
| `ipv4` | IPv4 地址 | `IP_` | ✅ 启用 |
| `bank_card` | 银行卡号（16-19位） | `CARD_` | ✅ 启用 |
| `credit_card` | 信用卡号 | `CC_` | ✅ 启用 |
| `password_field` | 密码字段 | `PWD_` | ✅ 启用 |
| `api_key` | API密钥 | `KEY_` | ❌ 禁用（避免误判） |

## 自定义规则

### 添加自定义检测规则

```json
{
  "tokenization": {
    "customRules": [
      {
        "name": "my_custom_rule",
        "pattern": "\\b[A-Z]{2}\\d{6}\\b",
        "tokenPrefix": "CUSTOM_",
        "enabled": true,
        "description": "自定义规则：两个大写字母+6位数字"
      }
    ]
  }
}
```

**注意**: `pattern` 需要使用转义的字符串格式，`\b` 需要写成 `\\b`。

### 禁用特定默认规则

```json
{
  "tokenization": {
    "disabledRules": ["password_field", "credit_card"]
  }
}
```

### 仅启用 API Key 规则

```json
{
  "tokenization": {
    "customRules": [
      {
        "name": "api_key",
        "pattern": "\\b(?:sk|pk)-[A-Za-z0-9]{32,}\\b",
        "tokenPrefix": "KEY_",
        "enabled": true
      }
    ]
  }
}
```

## 使用示例

### 示例 1：自动脱敏身份证和手机号

**发送请求：**
```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "我的身份证号是 310101199001011234，手机号是 13800138000，请帮我验证信息"
    }]
  }'
```

**LLM 实际收到：**
```json
{
  "messages": [{
    "role": "user",
    "content": "我的身份证号是 ID_A1B2C3D4，手机号是 MOBILE_E5F6G7H8，请帮我验证信息"
  }]
}
```

**客户端收到的响应：**
```json
{
  "content": [{
    "text": "您的身份证号 310101199001011234 和手机号 13800138000 已验证"
  }]
}
```

### 示例 2：邮箱地址脱敏

**请求：**
```json
{
  "messages": [{
    "role": "user",
    "content": "请发送邮件到 admin@example.com 和 user@test.org"
  }]
}
```

**LLM 收到：**
```json
{
  "messages": [{
    "role": "user",
    "content": "请发送邮件到 EMAIL_12345678 和 EMAIL_9ABCDEF0"
  }]
}
```

## 监控和调试

### 查看日志

启用 logger 后，可以在日志中看到令牌化操作：

```
[INFO] Tokenization service initialized
[INFO] Request body tokenized
[DEBUG] Tokenized: chinese_id_card -> ID_A1B2C3D4
[DEBUG] Tokenized: chinese_mobile -> MOBILE_E5F6G7H8
[INFO] Tokenized 2 sensitive items in text
[INFO] Detokenized 2 tokens
[DEBUG] Response detokenized
```

### 查看存储统计

可以通过服务器实例获取令牌化统计信息：

```typescript
// 在代码中
const stats = tokenizationService.getStats();
console.log(stats);
// 输出: { size: 42, hits: 128, misses: 5 }
```

## 性能影响

- **内存占用**: 每个令牌约占用 100-200 字节
- **处理延迟**: 每次请求增加约 1-5ms 延迟（取决于文本长度）
- **自动清理**: LRU 缓存自动清理过期令牌

## 安全考虑

### 令牌安全性

- ✅ 令牌使用随机生成的十六进制字符串，无法反向推导真实数据
- ✅ 令牌存储在服务器内存中，不写入磁盘
- ✅ 令牌自动过期（默认 1 小时）
- ✅ 服务重启后所有令牌自动失效

### 降级策略

如果令牌化过程失败：
- ✅ 自动记录错误日志
- ✅ 继续发送原始请求（不中断服务）
- ✅ 不影响其他正常请求

## 完全禁用令牌化

如果需要禁用令牌化功能：

```json
{
  "enableTokenization": false
}
```

或者从配置文件中完全删除 `tokenization` 配置项。

## 高级配置

### 调整令牌有效期

根据会话长度调整：

```json
{
  "tokenization": {
    "ttl": 7200000  // 2小时
  }
}
```

### 增加令牌存储容量

对于高并发场景：

```json
{
  "tokenization": {
    "maxTokens": 50000  // 5万个令牌
  }
}
```

## 常见问题

**Q: 令牌化会影响 LLM 的理解能力吗？**

A: 不会。LLM 仍然能够理解业务逻辑，只是看到的是令牌而非真实数据。例如 "给 `MOBILE_12345678` 发送短信" 的逻辑完全可以理解。

**Q: 服务重启后会怎样？**

A: 所有令牌会失效。但由于会话也会断开，这不会影响正常使用。

**Q: 能否持久化令牌？**

A: 当前版本使用内存存储，未来可以扩展支持 Redis 实现持久化。

**Q: 如何验证令牌化是否正常工作？**

A: 查看日志中的 "Request body tokenized" 和 "Response detokenized" 信息。
