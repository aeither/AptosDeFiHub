import type { Env } from '../env';

/**
 * Escape special characters for Telegram Markdown
 */
function escapeMarkdownV2(text: string): string {
  // Characters that need to be escaped in MarkdownV2
  const specialChars = /[_*[\]()~`>#+=|{}.!-]/g;
  return text.replace(specialChars, '\\$&');
}

/**
 * Send a message to Telegram - handles everything
 */
export async function sendTelegramMessage(
  text: string,
  env: Env,
  parseMode: 'Markdown' | 'MarkdownV2' | 'HTML' | undefined = 'Markdown'
): Promise<boolean> {
  const apiUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  
  try {
    const processedText = text;
    
    // If parseMode is Markdown and we detect potential issues, try without parse mode first
    if (parseMode === 'Markdown') {
      // First try to send with Markdown
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: env.TG_CHAT_ID, 
          text: processedText, 
          parse_mode: parseMode 
        }),
      });

      // If Markdown fails, try without parse mode
      if (!response.ok) {
        const errorData = await response.json();
        console.warn(`Markdown parsing failed: ${errorData.description}, retrying without parse mode`);
        
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: env.TG_CHAT_ID, 
            text: processedText,
            // No parse_mode
          }),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        console.error(`Failed to send Telegram message: ${data.description || 'Unknown error'}`);
        return false;
      }
    } else {
      // For other parse modes, send as is
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chat_id: env.TG_CHAT_ID, 
          text: processedText, 
          parse_mode: parseMode 
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error(`Failed to send Telegram message: ${data.description || 'Unknown error'}`);
        return false;
      }
    }

    return true;

  } catch (error) {
    console.error('Network error sending Telegram message:', error);
    return false;
  }
} 