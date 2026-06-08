import re

with open('src/backend/data_fetcher.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Add LRUCache definition at the top, after imports
lru_code = """
from collections import OrderedDict

class LRUCache(OrderedDict):
    def __init__(self, maxsize=50, *args, **kwds):
        self.maxsize = maxsize
        super().__init__(*args, **kwds)

    def __getitem__(self, key):
        value = super().__getitem__(key)
        self.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        if len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]
"""

if 'class LRUCache' not in code:
    code = code.replace('import json', 'import json\n' + lru_code, 1)

# Change cache initialization
code = code.replace('self._revenue_cache = {}', 'self._revenue_cache = LRUCache(maxsize=50)')
code = code.replace('self._history_cache = {}', 'self._history_cache = LRUCache(maxsize=50)')
code = code.replace('self._chip_cache = {}', 'self._chip_cache = LRUCache(maxsize=50)')
code = code.replace('self._intraday_cache = {}', 'self._intraday_cache = LRUCache(maxsize=50)')
code = code.replace('self._broker_cache = {}', 'self._broker_cache = LRUCache(maxsize=50)')

# Update load method
load_func = """
    def _load_persistent_caches(self):
        \"\"\"從硬碟載入快取\"\"\"
        for cache_name in ["history", "chip", "revenue", "official"]:
            path = os.path.join(config.CACHE_DIR, f"{cache_name}_cache.pkl")
            if os.path.exists(path):
                try:
                    with open(path, "rb") as f:
                        data = pickle.load(f)
                        if cache_name == "history": 
                            self._history_cache.update(data)
                        elif cache_name == "chip": 
                            self._chip_cache.update(data)
                        elif cache_name == "revenue": 
                            self._revenue_cache.update(data)
                        elif cache_name == "official": 
                            self._official_cache = data
                            # 如果有舊數據，將最後同步時間設為檔案修改時間
                            self._last_sync_time = os.path.getmtime(path)
                except: pass
"""
code = re.sub(r'    def _load_persistent_caches\(self\):.*?except: pass\n', load_func, code, flags=re.DOTALL)

with open('src/backend/data_fetcher.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Memory optimization applied to data_fetcher.py")
