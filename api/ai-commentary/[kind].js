/**
 * AI 解讀 — Vercel Function，四個種類共用一支動態路由。
 *
 *   POST /api/ai-commentary/stock-analysis  → { commentary }
 *   POST /api/ai-commentary/integrated      → { report }
 *   POST /api/ai-commentary/market          → { commentary }
 *   POST /api/ai-commentary/capital-flow    → { commentary }
 *
 * 所有 prompt 組裝邏輯逐行對應 src/backend/ai_commentary.py 的
 * generate_* 函式；回應形狀與 web_app.py 的四個端點一致，所以前端不用改。
 *
 * 核心原則沿用後端：分數與訊號一律由規則引擎算好，模型只負責翻成白話，
 * 不重算、不給買賣建議。任何失敗都回 { commentary: null }，呼叫端判斷
 * null 就不顯示該區塊，不影響頁面其他內容。
 */
import { callNvidia, field, listField } from '../_lib/nvidia.js';
import {
  ANALYSIS_SYSTEM_PROMPT,
  INTEGRATED_SYSTEM_PROMPT,
  MARKET_SYSTEM_PROMPT,
  CAPITAL_FLOW_SYSTEM_PROMPT,
} from '../_lib/prompts.js';

// ── 個股分析頁的綜合解讀 ──────────────────────────────────────
function buildStockAnalysis(p) {
  const g = (k, d) => field(p, k, d);
  const cdp = p.cdp || {};
  const lines = [
    `股票：${g('stock_name')}（${g('stock_id')}）`,
    `目前股價：${g('price')}（漲跌 ${g('change_percent')}%），分類：${g('category')}`,
    `系統綜合評分：${g('total_score')} 分，狀態標籤：${g('recommend_status', '無')}`,
    `技術指標：KD ${g('kd')}、RSI ${g('rsi')}、MACD ${g('macd')}、`
      + `5日均線 ${g('ma5')}、20日均線 ${g('ma20')}、60日均線 ${g('ma60')}、`
      + `量比 ${g('vol_ratio')}、年化波動率 ${g('volatility')}%`,
    `基本面：本益比 ${g('pe')}、殖利率 ${g('yield')}%、ROE ${g('roe')}%、負債比 ${g('debt_ratio')}%`,
  ];
  const diagnosis = listField(p, 'diagnosis', 8);
  if (diagnosis) lines.push('系統診斷訊號：' + diagnosis.join('；'));
  const patterns = listField(p, 'volume_patterns', 5);
  if (patterns) lines.push('成交量形態：' + patterns.join('、'));
  if (cdp.CDP !== undefined && cdp.CDP !== null) {
    lines.push(`CDP 區間：AH ${cdp.AH} / NH ${cdp.NH} / CDP ${cdp.CDP} / NL ${cdp.NL} / AL ${cdp.AL}`);
  }
  if (p.strategy_name) {
    lines.push(`系統建議策略：${g('strategy_name')}，進場價位 ${g('entry_range')}，`
      + `停損價位 ${g('stop_loss')}，出場鐵律：${g('exit_rule')}`);
  }
  lines.push('請將以上「已經算好」的資訊整合成一段 3~5 句的繁體中文綜合解讀。');
  return { system: ANALYSIS_SYSTEM_PROMPT, user: lines.join('\n'), maxTokens: 350 };
}

// ── AI 整合分析分頁的分段報告 ──────────────────────────────────
function buildIntegrated(p) {
  const g = (k, d) => field(p, k, d);
  const lines = [
    `股票：${g('stock_name')}（${g('stock_id')}），分類：${g('category')}`,
    `目前股價：${g('price')}（漲跌 ${g('change_percent')}%），系統綜合評分：${g('total_score')} 分，`
      + `狀態標籤：${g('recommend_status', '無')}`,
    '',
    '== 技術面 ==',
    `KD ${g('kd')}、RSI ${g('rsi')}、MACD ${g('macd')}、`
      + `5日均線 ${g('ma5')}、20日均線 ${g('ma20')}、60日均線 ${g('ma60')}、`
      + `量比 ${g('vol_ratio')}、年化波動率 ${g('volatility')}%`,
  ];
  const diagnosis = listField(p, 'diagnosis', 8);
  if (diagnosis) lines.push('系統診斷：' + diagnosis.join('；'));
  const patterns = listField(p, 'volume_patterns', 5);
  if (patterns) lines.push('成交量形態：' + patterns.join('、'));

  const section = (title, value) => { lines.push('', title, value || '無資料'); };
  section('== 日 K 走勢（近 20 個交易日，含近 60 日高低點）==', p.kline_summary);
  section('== 籌碼面（近 5 個交易日）==', p.chip_summary);
  section('== 分點動向（最新交易日主力進出）==', p.branch_summary);

  lines.push('', '== 基本面 ==');
  lines.push(`本益比 ${g('pe')}、殖利率 ${g('yield')}%、ROE ${g('roe')}%、負債比 ${g('debt_ratio')}%`);
  lines.push(p.fundamental_summary || '無其他財報節錄');

  const news = listField(p, 'news_titles', 15);
  lines.push('', '== 消息面（近期新聞，格式：日期 標題）==', news ? news.join('；') : '無資料');

  section('== 市場情緒（PTT 股板近期文章，格式：日期 標題(推文數)）==', p.community_summary);
  section('== 策略回測（系統以固定規則對歷史日 K 的模擬結果）==', p.backtest_summary);

  lines.push('', '請依指定格式輸出整合分析報告。');
  return { system: INTEGRATED_SYSTEM_PROMPT, user: lines.join('\n'), maxTokens: 900 };
}

// ── 首頁大盤解讀 ─────────────────────────────────────────────
function buildMarket(p) {
  const lines = [];
  if (p.outlook_trend) lines.push(`系統走勢展望：${p.outlook_trend}。${p.outlook_desc || ''}`);
  const signals = listField(p, 'outlook_signals', 8);
  if (signals) lines.push('系統訊號：' + signals.join('；'));
  if (p.futures) lines.push(`台指期：${p.futures}`);
  if (p.markets) lines.push(`全球市場漲跌：${p.markets}`);
  if (p.breadth) lines.push(`大盤多空分布：${p.breadth}`);
  if (p.capital_flow) lines.push(`資金流向（產業成交比重/平均漲跌）：${p.capital_flow}`);
  const tw = listField(p, 'taiwan_news', 10);
  if (tw) lines.push('台股要聞：' + tw.join('；'));
  const gl = listField(p, 'global_news', 5);
  if (gl) lines.push('國際財經：' + gl.join('；'));
  // 完全沒有素材時不要白打一次 API
  if (lines.length === 0) return null;
  lines.push('請整合以上資訊，產出一段大盤解讀。');
  return { system: MARKET_SYSTEM_PROMPT, user: lines.join('\n'), maxTokens: 400 };
}

// ── 資金流向頁摘要 ───────────────────────────────────────────
function buildCapitalFlow(p) {
  const lines = [];
  const industries = listField(p, 'industries', 10);
  if (industries) lines.push('今日產業資金分布（成交比重/平均漲跌）：' + industries.join('；'));
  const tw = listField(p, 'taiwan_news', 10);
  if (tw) lines.push('台股要聞：' + tw.join('；'));
  const gl = listField(p, 'global_news', 5);
  if (gl) lines.push('國際財經：' + gl.join('；'));
  if (lines.length === 0) return null;
  lines.push('請整合以上資訊，解讀今日熱門產業與可能的題材。');
  return { system: CAPITAL_FLOW_SYSTEM_PROMPT, user: lines.join('\n'), maxTokens: 400 };
}

// kind → [builder, 回應欄位名]。欄位名必須與 web_app.py 的端點一致。
const KINDS = {
  'stock-analysis': [buildStockAnalysis, 'commentary'],
  integrated: [buildIntegrated, 'report'],
  market: [buildMarket, 'commentary'],
  'capital-flow': [buildCapitalFlow, 'commentary'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const entry = KINDS[req.query?.kind];
  if (!entry) {
    return res.status(404).json({ error: `未知的解讀種類：${req.query?.kind}` });
  }
  const [build, responseKey] = entry;

  // Vercel 會幫 application/json 解析好 body；字串的情況自己兜一下
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'body 必須是 JSON 物件' });
  }

  const prompt = build(payload);
  // 素材不足：直接回 null，與後端「安靜不顯示」的行為一致
  if (!prompt) return res.status(200).json({ [responseKey]: null });

  const text = await callNvidia(prompt.system, prompt.user, { maxTokens: prompt.maxTokens });
  // AI 解讀相同輸入會給相同結果的機會不高，不做 CDN 快取；
  // 但也不要讓瀏覽器自己快取成舊解讀。
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ [responseKey]: text });
}
