/* ================================================================
   providers.js — LLM 服务商 / 模型 / 协议 数据表（host 侧单一来源）
   由参考项目（next-ai-drawio）配置表对齐而来：24 家服务商 + 推荐模型 + 无需密钥标记 + logo 映射。
   扩展通过 GET /api/ai/providers 拉取渲染，避免两端重复维护。
   本地适配：ollama 指向 127.0.0.1:11434（参考项目为云端 ollama.com/api）。
   ================================================================ */

/* ── 服务商信息（24 家） ─────────────────────────────────── */
export const PROVIDER_INFO = {
  "openai": {
    "label": "OpenAI",
    "defaultBaseUrl": "https://api.openai.com/v1"
  },
  "anthropic": {
    "label": "Anthropic",
    "defaultBaseUrl": "https://api.anthropic.com/v1"
  },
  "google": {
    "label": "Google",
    "defaultBaseUrl": "https://generativelanguage.googleapis.com/v1beta"
  },
  "vertexai": {
    "label": "Google Vertex AI"
  },
  "azure": {
    "label": "Azure OpenAI",
    "defaultBaseUrl": "https://your-resource.openai.azure.com/openai"
  },
  "bedrock": {
    "label": "Amazon Bedrock"
  },
  "ollama": {
    "label": "Ollama",
    "defaultBaseUrl": "http://127.0.0.1:11434/v1"
  },
  "openrouter": {
    "label": "OpenRouter",
    "defaultBaseUrl": "https://openrouter.ai/api/v1"
  },
  "aihubmix": {
    "label": "AIHubMix",
    "defaultBaseUrl": "https://aihubmix.com/v1"
  },
  "deepseek": {
    "label": "DeepSeek",
    "defaultBaseUrl": "https://api.deepseek.com/v1"
  },
  "siliconflow": {
    "label": "SiliconFlow",
    "defaultBaseUrl": "https://api.siliconflow.cn/v1"
  },
  "sglang": {
    "label": "SGLang",
    "defaultBaseUrl": "http://127.0.0.1:8000/v1"
  },
  "gateway": {
    "label": "AI Gateway",
    "defaultBaseUrl": "https://ai-gateway.vercel.sh/v1/ai"
  },
  "edgeone": {
    "label": "EdgeOne Pages"
  },
  "doubao": {
    "label": "Doubao (ByteDance)",
    "defaultBaseUrl": "https://ark.cn-beijing.volces.com/api/v3"
  },
  "modelscope": {
    "label": "ModelScope",
    "defaultBaseUrl": "https://api-inference.modelscope.cn/v1"
  },
  "glm": {
    "label": "GLM (Zhipu)",
    "defaultBaseUrl": "https://open.bigmodel.cn/api/paas/v4"
  },
  "qwen": {
    "label": "Qwen (Alibaba)",
    "defaultBaseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
  },
  "qiniu": {
    "label": "Qiniu",
    "defaultBaseUrl": "https://api.qnaigc.com/v1"
  },
  "kimi": {
    "label": "Kimi (Moonshot)",
    "defaultBaseUrl": "https://api.moonshot.cn/v1"
  },
  "minimax": {
    "label": "MiniMax",
    "defaultBaseUrl": "https://api.minimaxi.com/anthropic"
  },
  "novita": {
    "label": "Novita AI",
    "defaultBaseUrl": "https://api.novita.ai/openai"
  },
  "mimo": {
    "label": "MiMo (Xiaomi)",
    "defaultBaseUrl": "https://api.xiaomimimo.com/v1"
  },
  "atlascloud": {
    "label": "Atlas Cloud",
    "defaultBaseUrl": "https://api.atlascloud.ai/v1"
  }
};

/* ── 无需 API Key 的服务商（选中时 UI 置灰密钥输入框） ────── */
export const FIXED_CRED_PROVIDERS = [
  "bedrock",
  "vertexai",
  "ollama"
];

/* ── 推荐模型（按服务商；未列出的服务商 UI 显示「自定义」） ── */
export const SUGGESTED_MODELS = {
  "openai": [
    "gpt-5.5-pro",
    "gpt-5.5",
    "gpt-5.4-pro",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5-codex-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4o",
    "gpt-4o-mini"
  ],
  "anthropic": [
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-5-20251101",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022"
  ],
  "google": [
    "gemini-3.1-pro",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ],
  "vertexai": [
    "gemini-3.1-pro-preview",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ],
  "azure": [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o4-mini"
  ],
  "bedrock": [
    "anthropic.claude-opus-4-8",
    "anthropic.claude-opus-4-7",
    "anthropic.claude-sonnet-4-6",
    "anthropic.claude-opus-4-6-v1",
    "anthropic.claude-opus-4-5-20251101-v1:0",
    "anthropic.claude-sonnet-4-5-20250929-v1:0",
    "anthropic.claude-haiku-4-5-20251001-v1:0",
    "anthropic.claude-opus-4-1-20250805-v1:0",
    "anthropic.claude-opus-4-20250514-v1:0",
    "anthropic.claude-sonnet-4-20250514-v1:0",
    "anthropic.claude-3-5-haiku-20241022-v1:0",
    "amazon.nova-2-lite-v1:0",
    "amazon.nova-premier-v1:0",
    "amazon.nova-pro-v1:0",
    "amazon.nova-lite-v1:0",
    "amazon.nova-micro-v1:0",
    "meta.llama4-maverick-17b-instruct-v1:0",
    "meta.llama4-scout-17b-instruct-v1:0",
    "meta.llama3-3-70b-instruct-v1:0",
    "mistral.mistral-large-3-675b-instruct",
    "mistral.pixtral-large-2502-v1:0"
  ],
  "openrouter": [
    "anthropic/claude-opus-4.8",
    "anthropic/claude-sonnet-4.6",
    "anthropic/claude-haiku-4.5",
    "openai/gpt-5.5",
    "openai/gpt-5.4",
    "openai/gpt-5.4-mini",
    "openai/gpt-4o-mini",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3.5-flash",
    "google/gemini-2.5-flash-lite",
    "x-ai/grok-4.3",
    "meta-llama/llama-4-maverick",
    "meta-llama/llama-4-scout",
    "meta-llama/llama-3.3-70b-instruct",
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-v3.2",
    "qwen/qwen3.7-max",
    "qwen/qwen3-coder",
    "minimax/minimax-m3"
  ],
  "aihubmix": [
    "claude-fable-5",
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "gpt-5.5",
    "gpt-5.5-pro",
    "gpt-5.4",
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "qwen3.7-max",
    "qwen3-coder-next",
    "glm-5.1",
    "kimi-k2.6",
    "minimax-m3",
    "grok-4.3",
    "ernie-5.1",
    "mistral-large-3",
    "llama-4-maverick"
  ],
  "deepseek": [
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "deepseek-chat",
    "deepseek-reasoner"
  ],
  "siliconflow": [
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V4-Flash",
    "deepseek-ai/DeepSeek-V3.2",
    "MiniMaxAI/MiniMax-M3",
    "moonshotai/Kimi-K2.6",
    "zai-org/GLM-5",
    "Qwen/Qwen3.6-35B-A3B",
    "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    "Qwen/Qwen3-30B-A3B-Instruct-2507",
    "Qwen/Qwen3-VL-32B-Instruct",
    "openai/gpt-oss-120b"
  ],
  "sglang": [
    "default"
  ],
  "gateway": [
    "openai/gpt-5.5",
    "anthropic/claude-opus-4.7",
    "google/gemini-3.1-pro-preview",
    "xai/grok-4.3",
    "anthropic/claude-sonnet-4.6",
    "anthropic/claude-haiku-4.5",
    "openai/gpt-5.4-mini"
  ],
  "edgeone": [
    "@tx/deepseek-ai/deepseek-v32"
  ],
  "doubao": [
    "doubao-seed-2-0-pro-260215",
    "doubao-seed-2-0-lite-260428",
    "doubao-seed-2-0-mini-260428",
    "doubao-seed-1-8-251228",
    "doubao-seed-1-6-251015",
    "doubao-seed-1-6-flash-250828",
    "doubao-seed-1-6-vision-250815",
    "doubao-1-5-pro-32k-250115",
    "doubao-1-5-lite-32k-250115"
  ],
  "modelscope": [
    "deepseek-ai/DeepSeek-V4-Pro",
    "deepseek-ai/DeepSeek-V3.2",
    "deepseek-ai/DeepSeek-R1-0528",
    "deepseek-ai/DeepSeek-R1",
    "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "Qwen/Qwen3-VL-235B-A22B-Instruct",
    "Qwen/Qwen3-Coder-30B-A3B-Instruct",
    "Qwen/Qwen3-32B",
    "Qwen/Qwen2.5-72B-Instruct"
  ],
  "minimax": [
    "MiniMax-M3",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5"
  ],
  "novita": [
    "minimax/minimax-m3",
    "deepseek/deepseek-v4-pro",
    "zai-org/glm-5.1",
    "moonshotai/kimi-k2.6",
    "deepseek/deepseek-v4-flash"
  ],
  "mimo": [
    "mimo-v2.5-pro",
    "mimo-v2.5"
  ],
  "atlascloud": [
    "qwen/qwen3.5-flash",
    "deepseek-ai/deepseek-v4-pro"
  ]
};

/* ── logo 品牌名（扩展侧映射为 emoji 近似展示） ───────────── */
export const PROVIDER_LOGO_MAP = {
  "openai": "openai",
  "anthropic": "anthropic",
  "google": "google",
  "azure": "azure",
  "bedrock": "amazon-bedrock",
  "openrouter": "openrouter",
  "aihubmix": "aihubmix",
  "deepseek": "deepseek",
  "siliconflow": "siliconflow",
  "sglang": "openai",
  "gateway": "vercel",
  "edgeone": "tencent-cloud",
  "vertexai": "google",
  "doubao": "bytedance",
  "modelscope": "modelscope",
  "minimax": "minimax",
  "novita": "novita",
  "mimo": "xiaomi",
  "atlascloud": "openai"
};

/* ── 协议家族：按服务商分派请求格式 ───────────────────────── */
/**
 * minimax 走 anthropic 原生协议（其 defaultBaseUrl 即 .../anthropic）；
 * google / vertexai 走 gemini 原生协议；其余均为 OpenAI 兼容。
 */
const ANTHROPIC_PROVIDERS = new Set(['anthropic', 'minimax']);
const GEMINI_PROVIDERS = new Set(['google', 'vertexai']);

/** @returns {'openai'|'anthropic'|'gemini'} */
export function resolveProtocol(provider) {
  const p = String(provider || '').toLowerCase();
  if (ANTHROPIC_PROVIDERS.has(p)) return 'anthropic';
  if (GEMINI_PROVIDERS.has(p)) return 'gemini';
  return 'openai';
}

/** 该服务商是否无需 API Key */
export function needsApiKey(provider) {
  return !FIXED_CRED_PROVIDERS.includes(String(provider || '').toLowerCase());
}

/** 该服务商是否有可用的默认 baseURL（无则 UI 提示需云厂商凭据） */
export function hasDefaultBaseUrl(provider) {
  return Boolean(PROVIDER_INFO[String(provider || '')]?.defaultBaseUrl);
}
