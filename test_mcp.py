import asyncio
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client

async def main():
    headers = {"Authorization": "Bearer sk-DFL9uXi7f_eIrGDOY6tFFA"}
    async with sse_client("https://api.twinkleai.tw/mcp/sse", headers=headers) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # 獲取工具列表
            tools = await session.list_tools()
            for t in tools.tools:
                print(f"Tool: {t.name} - {t.description}")
                print(f"  Schema: {t.inputSchema}")

if __name__ == "__main__":
    asyncio.run(main())
