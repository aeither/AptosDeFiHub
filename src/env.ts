import type { KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  BOT_TOKEN: string;
  APTOS_API_KEY: string;
  TG_CHAT_ID: string;
  PRIVATE_KEY: string;
  PANORA_API_KEY: string;
  
  // KV binding for user address tracking
  USER_ADDRESSES: KVNamespace;
} 