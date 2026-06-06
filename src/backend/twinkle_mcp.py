import os
import json
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

TWINKLE_API_KEY = os.environ.get("TWINKLE_API_KEY", "sk-DFL9uXi7f_eIrGDOY6tFFA")
TWINKLE_SSE_URL = "https://api.twinkleai.tw/mcp/sse"

async def get_twinkle_tools():
    """獲取 Twinkle Hub 提供的所有工具列表"""
    headers = {"Authorization": f"Bearer {TWINKLE_API_KEY}", "Accept": "text/event-stream"}
    try:
        async with sse_client(TWINKLE_SSE_URL, headers=headers) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.list_tools()
                tools = []
                for t in result.tools:
                    tools.append({
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": t.inputSchema
                    })
                return tools
    except Exception as e:
        print(f"Error fetching Twinkle Hub tools: {e}")
        raise e

async def call_twinkle_tool(name: str, arguments: dict):
    """執行特定 Twinkle Hub 工具"""
    headers = {"Authorization": f"Bearer {TWINKLE_API_KEY}", "Accept": "text/event-stream"}
    try:
        async with sse_client(TWINKLE_SSE_URL, headers=headers) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(name, arguments)
                # content 通常是一個列表，包含 TextContent 或 ImageContent 等
                return [c.model_dump() for c in result.content] if result.content else []
    except Exception as e:
        print(f"Error calling Twinkle Hub tool '{name}': {e}")
        raise e
