import re

with open('src/backend/web_app.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Patch get_market_breadth_api
new_market_breadth = """def get_market_breadth_api():
    loop = asyncio.get_event_loop()
    res = await loop.run_in_executor(api_executor, fetcher.get_market_breadth)
    return {
        "data": res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }"""
code = re.sub(r'def get_market_breadth_api\(\):[\s\S]*?return res', new_market_breadth, code)

# Patch get_capital_flow_recommendations
new_capital_flow = """    loop = asyncio.get_event_loop()
    cf_data = await loop.run_in_executor(api_executor, fetcher.get_capital_flow)
    final_res = sanitize_data(cf_data)
    wrapper = {
        "data": final_res,
        "base_date": fetcher.get_last_expected_trading_date().strftime("%Y-%m-%d")
    }
    set_cached_response("capital_flow", wrapper)
    return wrapper"""
code = re.sub(r'    loop = asyncio\.get_event_loop\(\)[\s\S]*?return final_res', new_capital_flow, code)

with open('src/backend/web_app.py', 'w', encoding='utf-8') as f:
    f.write(code)

with open('src/services/api.js', 'r', encoding='utf-8') as f:
    api_js = f.read()

# Replace getMarketBreadth
new_get_mb = """export const getMarketBreadth = async () => {
  const apiRes = await api.get('/api/market-breadth');
  const d = apiRes.data;
  const timeStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  return { 
    data: d.data || d, 
    updated_at: d.base_date ? `${d.base_date} ${timeStr}` : `${new Date().toLocaleDateString('zh-TW')} ${timeStr}`
  };
};"""
api_js = re.sub(r'export const getMarketBreadth = async \(\) => \{[\s\S]*?\};', new_get_mb, api_js)

# Replace getCapitalFlow api return
new_get_cf = """  const apiRes = await api.get('/api/capital-flow');
  const d = apiRes.data;
  const timeStr = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  return { 
    data: d.data || d, 
    updated_at: d.base_date ? `${d.base_date} ${timeStr}` : `${new Date().toLocaleDateString('zh-TW')} ${timeStr}`
  };
};"""
api_js = re.sub(r'  const apiRes = await api\.get\(\'/api/capital-flow\'\);[\s\S]*?\};', new_get_cf, api_js)

with open('src/services/api.js', 'w', encoding='utf-8') as f:
    f.write(api_js)

print("Backend and Frontend API wrapper patched!")
