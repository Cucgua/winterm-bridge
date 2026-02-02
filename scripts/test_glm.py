#!/usr/bin/env python3
"""
测试 LLM API 是否正常返回 JSON
用法: python test_glm.py <endpoint> <api_key> [model]

示例:
  python test_glm.py https://open.bigmodel.cn/api/paas/v4 your-api-key glm-4-flash
  python test_glm.py https://your-relay.com/v1 your-api-key glm-4.7
  python test_glm.py https://dashscope.aliyuncs.com/compatible-mode/v1 your-api-key qwen-turbo
"""

import sys
import json
import re
import requests

# 与 Go 代码一致的 prompt（精简版，减少推理模型过度思考）
SYSTEM_PROMPT = """你是终端状态分析器。分析终端输出，返回 JSON。

# 输出格式
{"tag":"标签","description":"描述"}

# 标签（二选一）
- 完毕：显示提示符或命令结束
- 进行：有持续输出
- 需确认：等待 y/n 或回车
- 需输入：等待密码或文件名
- 需选择：菜单选择
- 错误：出现错误
- 等待：长时间无输出

# 忽略
- 提示符行（❯$#>>> 开头）
- 状态栏（⏵⏵、快捷键）

# 规则
1. 只输出 JSON，禁止其他内容
2. 禁止 markdown 代码块
3. 禁止分析过程

示例：{"tag":"完毕","description":"命令执行完成"}"""

# 模拟终端输出
TEST_TERMINAL_CONTENT = """$ npm install
added 150 packages in 3.2s
$ """


def extract_json(text: str) -> str:
    """模拟 Go 代码的 extractJSON 函数：提取有效 JSON 对象（跳过模板 JSON）"""
    start = 0
    while True:
        idx = text.find('{', start)
        if idx == -1:
            return ""

        start = idx
        depth = 0
        end = -1

        for i in range(start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break

        if end == -1:
            return ""

        json_str = text[start:end+1]

        # 跳过模板 JSON（包含占位符值）
        if '"状态标签"' in json_str or '"简短描述"' in json_str:
            print(f"⚠️  跳过模板 JSON: {json_str[:50]}...")
            start = end + 1
            continue

        return json_str

    return ""


def test_api(endpoint: str, api_key: str, model: str = "glm-4.7"):
    url = endpoint.rstrip("/")
    if not url.endswith("/chat/completions"):
        url += "/chat/completions"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": TEST_TERMINAL_CONTENT}
        ],
        "temperature": 0.3,
        "max_tokens": 2000,  # High for reasoning models
        "stream": False
    }

    print(f"{'='*60}")
    print(f"请求信息")
    print(f"{'='*60}")
    print(f"URL: {url}")
    print(f"Model: {model}")
    print(f"Stream: {payload['stream']}")
    print()

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=30)

        print(f"{'='*60}")
        print(f"响应信息")
        print(f"{'='*60}")
        print(f"Status: {resp.status_code}")
        print(f"Content-Type: {resp.headers.get('Content-Type', 'N/A')}")
        print()

        # 检查是否是 SSE 流式响应
        content_type = resp.headers.get('Content-Type', '')
        if 'text/event-stream' in content_type:
            print("⚠️  警告: 返回了流式响应 (SSE)，stream: false 可能被忽略")
            print()

        print(f"{'='*60}")
        print(f"原始响应")
        print(f"{'='*60}")
        raw = resp.text
        print(raw[:2000] if len(raw) > 2000 else raw)
        print()

        print(f"{'='*60}")
        print(f"解析结果")
        print(f"{'='*60}")

        # 检查是否以 data: 开头（SSE 格式）
        if raw.strip().startswith("data:"):
            print("❌ SSE 格式响应，无法直接解析")
            print("   原因：API 返回了流式响应，需要检查中转站配置")
            return

        try:
            data = resp.json()

            if "error" in data:
                print(f"❌ API 错误: {data['error']}")
                return

            # 检查 finish_reason
            if "choices" in data and len(data["choices"]) > 0:
                finish_reason = data["choices"][0].get("finish_reason", "")
                if finish_reason == "length":
                    print(f"⚠️  警告: finish_reason=length，响应可能被截断")
                    print(f"   建议增加 max_tokens 参数")
                    print()

            if "choices" not in data or len(data["choices"]) == 0:
                print(f"❌ 意外的响应结构: {list(data.keys())}")
                return

            message = data["choices"][0]["message"]
            content = message.get("content")
            reasoning_content = message.get("reasoning_content")

            # GLM-4.7 等推理模型使用 reasoning_content 而非 content
            if content is None and reasoning_content:
                print(f"⚠️  检测到推理模型格式 (content=null, reasoning_content 存在)")
                print(f"推理内容:")
                print(f"  {repr(reasoning_content[:500])}..." if len(reasoning_content) > 500 else f"  {repr(reasoning_content)}")
                print()
                # 尝试从 reasoning_content 中提取 JSON
                content = reasoning_content
            elif content is None:
                print(f"❌ content 为 null 且无 reasoning_content")
                return

            print(f"模型原始输出:")
            print(f"  {repr(content[:500])}..." if len(str(content)) > 500 else f"  {repr(content)}")
            print()

            # 检查是否用 markdown 包裹
            if "```" in content:
                print("⚠️  模型使用了 markdown 代码块包裹")

            # 使用 extractJSON 提取
            json_str = extract_json(content)
            if not json_str:
                print("❌ 未找到 JSON 对象")
                return

            print(f"提取的 JSON:")
            print(f"  {json_str}")
            print()

            # 解析 JSON
            result = json.loads(json_str)
            print(f"✅ 解析成功:")
            print(f"   tag: {result.get('tag', 'N/A')}")
            print(f"   description: {result.get('description', 'N/A')}")

        except json.JSONDecodeError as e:
            print(f"❌ JSON 解析失败: {e}")
            if raw.strip().startswith("data:"):
                print("   提示：这可能是流式响应（SSE 格式）")

    except requests.exceptions.Timeout:
        print("❌ 请求超时 (30s)")
    except requests.exceptions.RequestException as e:
        print(f"❌ 请求失败: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    endpoint = sys.argv[1]
    api_key = sys.argv[2]
    model = sys.argv[3] if len(sys.argv) > 3 else "glm-4.7"

    test_api(endpoint, api_key, model)
    print()
    print("=" * 60)
    print("测试完成")
    print("=" * 60)
