import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';

// 打錯網址或點到舊連結時給個出路，原本這種情況整個內容區是空白的
const NotFound = () => (
  <div className="text-center py-20 flex flex-col items-center gap-3">
    <SearchX size={40} className="text-ink-3" />
    <h1 className="text-lg font-bold text-ink-1">找不到這個頁面</h1>
    <p className="text-ink-3 text-sm">網址可能打錯了，或這個頁面已經移除。</p>
    <Link to="/" className="mt-2 bg-brand text-brand-fg px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
      回首頁
    </Link>
  </div>
);

export default NotFound;
