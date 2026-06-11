import os
import json
import requests
import asyncio

TWINKLE_API_KEY = os.environ.get("TWINKLE_API_KEY", "sk-DFL9uXi7f_eIrGDOY6tFFA")
TWINKLE_SSE_URL = "https://api.twinkleai.tw/mcp/"

_SESSION_ID = None

def _get_session_id():
    global _SESSION_ID
    if _SESSION_ID:
        return _SESSION_ID
        
    headers = {
        "Authorization": f"Bearer {TWINKLE_API_KEY}",
        "Accept": "application/json, text/event-stream"
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "jush-backend", "version": "1.0"}
        }
    }
    
    res = requests.post(TWINKLE_SSE_URL, headers=headers, json=payload, timeout=30)
    res.encoding = 'utf-8'
    
    if res.status_code == 200:
        session_id = res.headers.get("mcp-session-id")
        if session_id:
            _SESSION_ID = session_id
            return session_id
            
    res.raise_for_status()
    raise Exception("Twinkle Hub 未回傳 mcp-session-id")

def _send_mcp_request(method: str, params: dict = None, retry=True):
    global _SESSION_ID
    session_id = _get_session_id()
    
    headers = {
        "Authorization": f"Bearer {TWINKLE_API_KEY}",
        "Accept": "application/json, text/event-stream",
        "mcp-session-id": session_id
    }
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method
    }
    if params:
        payload["params"] = params

    res = requests.post(TWINKLE_SSE_URL, headers=headers, json=payload, timeout=30)
    res.encoding = 'utf-8'
    
    # Check if session expired or missing
    if res.status_code in [400, 401] and retry and "session" in res.text.lower():
        _SESSION_ID = None
        return _send_mcp_request(method, params, retry=False)
        
    res.raise_for_status()

    # Parse SSE response
    full_data = []
    for line in res.text.splitlines():
        if line.startswith("data: "):
            full_data.append(line[6:])
    
    if not full_data:
        print(f"Twinkle Hub API HTTP {res.status_code} Response: {res.text}")
        raise Exception("Twinkle Hub 未回傳任何 data 事件")
        
    merged_data = "".join(full_data)
    try:
        data_json = json.loads(merged_data)
        if "error" in data_json:
            raise Exception(str(data_json["error"]))
        return data_json.get("result", {})
    except json.JSONDecodeError as e:
        print(f"Twinkle Hub SSE JSON 解析失敗: {e}. 原始字串: {merged_data[:200]}...")
        raise Exception("Twinkle Hub 回傳的資料無法解析為 JSON")

async def get_twinkle_tools():
    """獲取 Twinkle Hub 提供的所有工具列表"""
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

async def call_twinkle_tool(name: str, arguments: dict):
    """執行特定 Twinkle Hub 工具"""
    loop = asyncio.get_event_loop()
    params = {"name": name, "arguments": arguments}
    result = await loop.run_in_executor(None, _send_mcp_request, "tools/call", params)
    return result.get("content", [])
