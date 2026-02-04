#!/bin/bash
# 令牌化功能测试脚本

echo "测试1: 身份证和手机号脱敏"
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: ${APIKEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "我的身份证号是 310101199001011234，手机号是 13800138000，请重复一遍"
    }],
    "stream": false
  }' | jq '.'

echo -e "\n测试2: 邮箱地址脱敏"
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: ${APIKEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "发送邮件到 admin@example.com"
    }],
    "stream": false
  }' | jq '.'

echo -e "\n测试3: 流式响应脱敏"
curl -X POST http://localhost:3456/v1/messages \
  -H "x-api-key: ${APIKEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai,gpt-4",
    "messages": [{
      "role": "user",
      "content": "我的手机号是 13912345678"
    }],
    "stream": true
  }'
