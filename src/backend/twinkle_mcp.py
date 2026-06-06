import os
import json
import requests
import asyncio

TWINKLE_API_KEY = os.environ.get("TWINKLE_API_KEY", "sk-DFL9uXi7f_eIrGDOY6tFFA")
TWINKLE_SSE_URL = "https://api.twinkleai.tw/mcp/"

def _send_mcp_request(method: str, params: dict = None):
    headers = {
        "Authorization": f"Bearer {TWINKLE_API_KEY}",
        "Accept": "application/json, text/event-stream"
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method
    }
    if params:
        payload["params"] = params

    res = requests.post(TWINKLE_SSE_URL, headers=headers, json=payload, timeout=30)
    res.raise_for_status()

    # Parse SSE response
    for line in res.text.split("\n"):
        if line.startswith("data: "):
            try:
                data_json = json.loads(line[6:])
                if "error" in data_json:
                    raise Exception(data_json["error"])
                return data_json.get("result", {})
            except json.JSONDecodeError:
                pass
    return {}

async def get_twinkle_tools():
    """獲取 Twinkle Hub 提供的所有工具列表"""
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _send_mcp_request, "tools/list")
        
        tools = []
        for t in result.get("tools", []):
            tools.append({
                "name": t.get("name"),
                "description": t.get("description"),
                "inputSchema": t.get("inputSchema")
            })
        return tools
    except Exception as e:
        print(f"Error fetching Twinkle Hub tools: {e}")
        raise e

async def call_twinkle_tool(name: str, arguments: dict):
    """執行特定 Twinkle Hub 工具"""
    try:
        loop = asyncio.get_event_loop()
        params = {"name": name, "arguments": arguments}
        result = await loop.run_in_executor(None, _send_mcp_request, "tools/call", params)
        return result.get("content", [])
    except Exception as e:
        print(f"Error calling Twinkle Hub tool '{name}': {e}")
        raise e
