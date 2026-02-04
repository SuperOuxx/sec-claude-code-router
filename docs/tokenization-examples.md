# 令牌化系统使用示例

本文档提供令牌化系统的实际使用示例和测试场景。

## 示例 1：基础脱敏测试

### 配置
```json
{
  "enableTokenization": true,
  "tokenization": {
    "ttl": 3600000
  }
}
```

### 测试请求

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "我的信息：身份证 310101199001011234，手机 13800138000，邮箱 user@example.com"
    }],
    "stream": false
  }'
```

### 预期行为

1. **LLM 收到的内容**（查看日志）：
```json
{
  "content": "我的信息：身份证 ID_A1B2C3D4，手机 MOBILE_E5F6G7H8，邮箱 EMAIL_12345678"
}
```

2. **客户端收到的响应**（已还原）：
```json
{
  "content": [{
    "text": "您好！您的信息已收到：\n- 身份证：310101199001011234\n- 手机：13800138000\n- 邮箱：user@example.com"
  }]
}
```

---

## 示例 2：流式响应脱敏

### 测试流式请求

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "请重复我的手机号: 13912345678"
    }],
    "stream": true
  }'
```

### SSE 事件流

**LLM 生成的流**（包含令牌）:
```
event: content_block_delta
data: {"delta":{"text":"您的手机号是 MOBILE_9ABCDEF0"}}

event: message_delta
data: {"delta":{"stop_reason":"end_turn"}}
```

**客户端接收的流**（已还原）:
```
event: content_block_delta
data: {"delta":{"text":"您的手机号是 13912345678"}}

event: message_delta
data: {"delta":{"stop_reason":"end_turn"}}
```

---

## 示例 3：自定义规则

### 配置自定义规则

检测护照号码（假设格式为 E12345678）：

```json
{
  "tokenization": {
    "customRules": [
      {
        "name": "passport",
        "pattern": "\\b[A-Z]\\d{8}\\b",
        "tokenPrefix": "PASSPORT_",
        "enabled": true,
        "description": "护照号码"
      }
    ]
  }
}
```

### 测试请求

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "我的护照号是 E12345678，请帮我检查状态"
    }]
  }'
```

### 预期结果

- **LLM 收到**: `我的护照号是 PASSPORT_ABCD1234，请帮我检查状态`
- **客户端收到**: 真实护照号 `E12345678` 已还原

---

## 示例 4：禁用特定规则

### 配置

仅检测身份证和手机号，禁用其他规则：

```json
{
  "tokenization": {
    "disabledRules": [
      "email",
      "ipv4",
      "bank_card",
      "credit_card",
      "password_field"
    ]
  }
}
```

### 测试

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "role": "user",
      "content": "身份证: 310101199001011234, 邮箱: test@example.com, IP: 192.168.1.1"
    }]
  }'
```

### 预期结果

- ✅ 身份证被令牌化: `ID_xxxxxxxx`
- ❌ 邮箱不被令牌化: `test@example.com`
- ❌ IP 不被令牌化: `192.168.1.1`

---

## 示例 5：工具调用中的脱敏

### 场景

Agent 调用 `sendEmail` 工具时，邮箱地址应该被脱敏。

### 测试请求

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "发送邮件到 admin@company.com"
    }],
    "tools": [{
      "name": "sendEmail",
      "description": "发送邮件",
      "input_schema": {
        "type": "object",
        "properties": {
          "to": {"type": "string"}
        }
      }
    }]
  }'
```

### LLM 工具调用

```json
{
  "tool_use": {
    "id": "toolu_123",
    "name": "sendEmail",
    "input": {
      "to": "EMAIL_12345678"
    }
  }
}
```

### 工具实际执行

系统自动还原后，工具收到：
```json
{
  "to": "admin@company.com"
}
```

---

## 示例 6：批量数据脱敏

### 测试请求

```bash
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "role": "user",
      "content": "用户列表:\n1. 张三 - 13800138001 - zhang@test.com\n2. 李四 - 13800138002 - li@test.com\n3. 王五 - 13800138003 - wang@test.com"
    }]
  }'
```

### LLM 收到

```
用户列表:
1. 张三 - MOBILE_AAAA1111 - EMAIL_BBBB2222
2. 李四 - MOBILE_CCCC3333 - EMAIL_DDDD4444
3. 王五 - MOBILE_EEEE5555 - EMAIL_FFFF6666
```

### 客户端收到

所有手机号和邮箱已还原为真实值。

---

## 测试验证脚本

### Node.js 测试脚本

```javascript
// test-tokenization.js
const fetch = require('node-fetch');

async function testTokenization() {
  const response = await fetch('http://localhost:3456/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': 'your-api-key',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai,gpt-4',
      messages: [{
        role: 'user',
        content: '我的手机号是 13800138000，请重复一遍'
      }],
      stream: false
    })
  });

  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  
  // 验证响应中是否包含真实手机号
  const hasRealPhone = JSON.stringify(data).includes('13800138000');
  console.log('✅ Real phone number restored:', hasRealPhone);
}

testTokenization().catch(console.error);
```

运行测试：
```bash
node test-tokenization.js
```

---

## 日志验证

启用 DEBUG 日志查看令牌化过程：

```json
{
  "LOG_LEVEL": "debug"
}
```

预期日志输出：

```
[INFO] Tokenization service initialized
[INFO] Request body tokenized
[DEBUG] Tokenized: chinese_mobile -> MOBILE_A1B2C3D4
[DEBUG] Tokenized: email -> EMAIL_E5F6G7H8
[INFO] Tokenized 2 sensitive items in text
[DEBUG] Response detokenized
[INFO] Detokenized 2 tokens
```

---

## 性能测试

### 测试脚本

```bash
#!/bin/bash
# benchmark-tokenization.sh

for i in {1..100}; do
  curl -X POST http://localhost:3456/v1/messages \
    -H "x-api-key: your-api-key" \
    -H "Content-Type: application/json" \
    -d '{
      "model": "openai,gpt-4",
      "messages": [{"role": "user", "content": "测试 13800138000"}],
      "stream": false
    }' -w "\nTime: %{time_total}s\n" -o /dev/null -s
done | grep "Time:" | awk '{sum+=$2; count++} END {print "Average:", sum/count, "s"}'
```

预期结果：
```
Average: 0.045 s
```

(令牌化增加约 1-5ms 延迟)

---

## 错误处理示例

### 场景：存储已满

当令牌数量超过 `maxTokens` 限制时，LRU 缓存会自动清理最旧的令牌。

### 配置

```json
{
  "tokenization": {
    "maxTokens": 10
  }
}
```

### 行为

- 前 10 个令牌正常存储
- 第 11 个令牌存储时，最旧的令牌被清理
- 系统继续正常运行

---

## 完整配置示例

```json
{
  "enableTokenization": true,
  "LOG_LEVEL": "debug",
  "tokenization": {
    "maxTokens": 50000,
    "ttl": 7200000,
    "customRules": [
      {
        "name": "passport",
        "pattern": "\\b[A-Z]\\d{8}\\b",
        "tokenPrefix": "PASSPORT_",
        "enabled": true
      },
      {
        "name": "license_plate",
        "pattern": "\\b[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-F0-9]{5}\\b",
        "tokenPrefix": "PLATE_",
        "enabled": true
      }
    ],
    "disabledRules": ["api_key"]
  }
}
```
