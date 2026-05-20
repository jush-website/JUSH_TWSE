import pickle
import os
import pandas as pd

import config

def check_cache():
    cache_dir = config.CACHE_DIR
    files = ['official_cache.pkl', 'history_cache.pkl', 'chip_cache.pkl']
    
    for filename in files:
        path = os.path.join(cache_dir, filename)
        if not os.path.exists(path):
            print(f"{filename} not found")
            continue
            
        print(f"\nAnalyzing {filename}:")
        with open(path, "rb") as f:
            try:
                data = pickle.load(f)
                if not data:
                    print("  Empty cache")
                    continue
                
                print(f"  Total items: {len(data)}")
                first_key = list(data.keys())[0]
                item = data[first_key]
                print(f"  Example key: {first_key}")
                
                if filename == 'official_cache.pkl':
                    print(f"  Data Date: {item.get('date', 'N/A')}")
                elif filename == 'history_cache.pkl':
                    if hasattr(item, 'index'):
                        print(f"  Last Index: {item.index[-1]}")
                elif filename == 'chip_cache.pkl':
                    if isinstance(item, pd.DataFrame) and not item.empty:
                        print(f"  Last Date: {item['date'].iloc[-1] if 'date' in item.columns else 'N/A'}")
            except Exception as e:
                print(f"  Error: {e}")

if __name__ == "__main__":
    check_cache()
