/**
 * NVIDIA NIM 呼叫的共用邏輯。
 *
 * 搬到 Vercel Function 的理由跟報價一樣：原本打 Render，冷啟動要 30-60 秒，
 * 而 AI 解讀本來就是「慢慢來、失敗就不顯示」的非阻塞功能，再疊一層冷啟動
 * 等於永遠等不到。這裡同源、無依賴、冷啟動接近零。
 *
 * 金鑰留在伺服器側是這層存在的另一個理由——NVIDIA_API_KEY 不能進瀏覽器。
 *
 * 行為與 src/backend/ai_commentary.py 的 _call_nvidia() 一致：
 * 沒有金鑰、逾時、額度用盡、上游非 200——全部安靜回傳 null，
 * 絕不讓 AI 服務的可用性影響頁面其他內容。
 *
 * 注意：api/ 底下以底線開頭的目錄不會被 Vercel 當成端點，所以這支是純模組。
 */

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// 預設用小型、低延遲模型，免費額度才夠用；可用 NVIDIA_MODEL 覆蓋。
const DEFAULT_MODEL = 'meta/llama-3.1-8b-instruct';
const TIMEOUT_MS = 15000;

/**
 * @returns {Promise<string|null>} 模型輸出的文字；任何失敗都是 null。
 */
export async function callNvidia(systemPrompt, userPrompt, { maxTokens = 150, temperature = 0.4 } = {}) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.NVIDIA_MODEL || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const body = await resp.json();
    const text = body?.choices?.[0]?.message?.content?.trim();
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
