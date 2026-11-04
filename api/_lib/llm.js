/**
 * AI 解讀的模型呼叫共用邏輯（Node 端；Python 端在 src/backend/ai_commentary.py）。
 *
 * 支援兩種上游，依環境變數自動選擇：
 *
 * 1. 實驗室自架模型（Ollama 相容 API，例如 DGX Spark 上的
 *    qwen3.6:35b-a3b-mtp-q8_0）——設定 LLM_BASE_URL 就會走這條。
 *    打的是 Ollama 原生的 POST {LLM_BASE_URL}/api/chat，並帶 think:false，
 *    原因：qwen3 系列預設會先「思考」，思考內容會吃掉 num_predict 的額度，
 *    短評只給 150 token 時常常思考完就沒有正文了。
 * 2. NVIDIA NIM（舊的雲端免費 API）——沒設 LLM_BASE_URL、但有 NVIDIA_API_KEY 時才用。
 *
 * 兩個都沒設：AI 解讀整個關閉，安靜回 null。
 *
 * 行為與 Python 版 _call_llm() 一致：設定不全、逾時、上游非 200——全部安靜回傳
 * null，絕不讓 AI 服務的可用性影響頁面其他內容。
 *
 * 注意：api/ 底下以底線開頭的目錄不會被 Vercel 當成端點，所以這支是純模組。
 */

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct';
export const LOCAL_DEFAULT_MODEL = 'qwen3.6:35b-a3b-mtp-q8_0';

/** 讀環境變數決定要打哪個上游；回 null 代表 AI 解讀關閉。每次呼叫都重讀，方便測試切換。 */
export function resolveLlmConfig(env = process.env) {
  const base = (env.LLM_BASE_URL || '').trim().replace(/\/+$/, '');
  if (base) {
    return {
      provider: 'ollama',
      url: `${base}/api/chat`,
      model: env.LLM_MODEL || LOCAL_DEFAULT_MODEL,
      apiKey: env.LLM_API_KEY || null,
      // 35B 模型產生整合報告（900 token）要十幾秒到數十秒，預設給寬一點
      timeoutMs: Number(env.LLM_TIMEOUT_MS) || 90000,
      think: /^(1|true|yes)$/i.test(env.LLM_THINK || ''),
    };
  }
  if (env.NVIDIA_API_KEY) {
    return {
      provider: 'nvidia',
      url: NVIDIA_API_URL,
      model: env.NVIDIA_MODEL || NVIDIA_DEFAULT_MODEL,
      apiKey: env.NVIDIA_API_KEY,
      timeoutMs: 15000,
    };
  }
  return null;
}

/** qwen3 等推理模型若仍把思考過程塞進正文，拿掉 <think>…</think>。 */
export const stripThinking = (text) =>
  String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

/**
 * @returns {Promise<string|null>} 模型輸出的文字；任何失敗都是 null。
 */
export async function callLlm(systemPrompt, userPrompt, { maxTokens = 150, temperature = 0.4 } = {}) {
  const cfg = resolveLlmConfig();
  if (!cfg) return null;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const body = cfg.provider === 'ollama'
    ? {
        model: cfg.model,
        messages,
        stream: false,
        think: cfg.think,
        options: { temperature, num_predict: maxTokens },
      }
    : { model: cfg.model, messages, temperature, max_tokens: maxTokens };

  try {
    const resp = await fetch(cfg.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = cfg.provider === 'ollama'
      ? data?.message?.content
      : data?.choices?.[0]?.message?.content;
    const text = raw ? stripThinking(raw) : '';
    return text || null;
  } catch {
    // 逾時、網路錯誤、回應不是 JSON——一律安靜失敗
    return null;
  }
}

/** payload 取值：null/空字串都換成預設字樣，與 Python 版的 g() 一致。 */
export const field = (payload, key, fallback = '未知') => {
  const v = payload?.[key];
  return v === null || v === undefined || v === '' ? fallback : v;
};

/** 取陣列欄位並截斷；空的回 null 讓呼叫端決定要不要加那一行。 */
export const listField = (payload, key, limit) => {
  const v = payload?.[key];
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.slice(0, limit).map(String);
};
