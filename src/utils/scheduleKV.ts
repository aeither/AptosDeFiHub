import type { Env } from '../env';

export interface ScheduleConfig {
  enabled: boolean;
  updatedAt: string;
  updatedBy?: string; // Optional: track which user changed it
}

const SCHEDULE_KEY = 'system:schedule_config';

/**
 * Get current schedule configuration
 */
export async function getScheduleConfig(env: Env): Promise<boolean> {
  try {
    const data = await env.USER_ADDRESSES.get(SCHEDULE_KEY, 'json') as ScheduleConfig | null;
    
    // Default to enabled if no config exists
    if (!data) {
      return true;
    }
    
    return data.enabled;
  } catch (error) {
    console.error('❌ Error getting schedule config:', error);
    // Default to enabled on error for safety
    return true;
  }
}

/**
 * Set schedule configuration
 */
export async function setScheduleConfig(enabled: boolean, env: Env, updatedBy?: string): Promise<{ success: boolean; message: string }> {
  try {
    const config: ScheduleConfig = {
      enabled,
      updatedAt: new Date().toISOString(),
      updatedBy
    };

    await env.USER_ADDRESSES.put(SCHEDULE_KEY, JSON.stringify(config));

    const status = enabled ? 'enabled' : 'disabled';
    let message = `✅ **Scheduled automation ${status}**\n\n`;
    message += `🔄 **Current Status:** ${enabled ? '🟢 ON' : '🔴 OFF'}\n`;
    message += `⏰ **Updated:** ${new Date().toLocaleString()}\n`;
    
    if (enabled) {
      message += '\n📅 **Next Actions:**\n';
      message += '• Automatic rebalancing will run every 5 minutes\n';
      message += '• User notifications will be sent for tracked addresses\n';
      message += '• All portfolio monitoring features active';
    } else {
      message += '\n⏸️ **Paused Actions:**\n';
      message += '• Automatic rebalancing suspended\n';
      message += '• User notifications suspended\n';
      message += '• Manual commands still work normally';
    }

    return { success: true, message };

  } catch (error) {
    console.error('❌ Error setting schedule config:', error);
    return { success: false, message: '❌ Failed to update schedule configuration. Please try again.' };
  }
}

/**
 * Get formatted schedule status for display
 */
export async function getFormattedScheduleStatus(env: Env): Promise<string> {
  try {
    const data = await env.USER_ADDRESSES.get(SCHEDULE_KEY, 'json') as ScheduleConfig | null;
    
    const enabled = data?.enabled ?? true; // Default to enabled
    const lastUpdated = data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'Never configured';
    const updatedBy = data?.updatedBy || 'System default';

    let message = `⚙️ **Scheduled Automation Status**\n\n`;
    message += `🔄 **Current Status:** ${enabled ? '🟢 ON' : '🔴 OFF'}\n`;
    message += `⏰ **Last Updated:** ${lastUpdated}\n`;
    message += `👤 **Updated By:** ${updatedBy}\n\n`;
    
    if (enabled) {
      message += '📅 **Active Features:**\n';
      message += '• ✅ Automatic rebalancing (every 5 minutes)\n';
      message += '• ✅ User notifications for tracked addresses\n';
      message += '• ✅ Portfolio monitoring\n';
      message += '• ✅ Position management\n\n';
      message += '💡 Use `/schedule off` to pause automation';
    } else {
      message += '⏸️ **Paused Features:**\n';
      message += '• ❌ Automatic rebalancing\n';
      message += '• ❌ User notifications\n';
      message += '• ✅ Manual commands still work\n\n';
      message += '💡 Use `/schedule on` to resume automation';
    }

    return message;

  } catch (error) {
    console.error('❌ Error formatting schedule status:', error);
    return '❌ Error loading schedule status. Please try again.';
  }
} 