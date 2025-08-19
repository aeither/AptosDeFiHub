import type { Env } from '../env';

/**
 * Send scheduled position updates to all users with tracked addresses
 * This handles Step 3: Regular position status notifications
 */
export async function sendScheduledUserNotifications(env: Env): Promise<void> {
    try {
        console.log('📊 Starting scheduled user notifications...');

        // Lazy import heavy modules
        const { generatePositionsResponse } = await import('./hyperion/read');
        const { sendTelegramMessage } = await import('../utils/telegramMessage');
        const { getAllUserAddresses } = await import('../utils/userAddressKV');

        // Get all users and their tracked addresses
        const allUserData = await getAllUserAddresses(env);
        console.log(`📊 Found ${allUserData.length} users with tracked addresses`);

        if (allUserData.length === 0) {
            console.log('ℹ️ No users have any tracked addresses yet');
            return;
        }
        // Get current UTC time for scheduling logic
        const now = new Date();
        const utcMinutes = now.getUTCMinutes();
        const isWithinRange = utcMinutes >= 58 || utcMinutes <= 2; // Within ±2 minutes of hour mark

        let totalNotificationsSent = 0;
        let totalAddressesProcessed = 0;

        // Process each user's addresses
        for (const userData of allUserData) {
            console.log(`👤 Processing notifications for user ${userData.userId} with ${userData.addresses.length} addresses...`);

            // Process each address for this user
            for (const address of userData.addresses) {
                totalAddressesProcessed++;
                console.log(`📊 Checking positions for address ${address}...`);

                try {
                    // Import pool configurations from config file
                    const { getPoolConfigsForFilter } = await import('../config/pools');
                    const poolConfigs = getPoolConfigsForFilter();
                    const { message, hasInactive } = await generatePositionsResponse(env, address, poolConfigs);

                    // Send message only if it's within the time range
                    if (isWithinRange) {
                        const success = await sendTelegramMessage(
                            message,
                            { ...env, TG_CHAT_ID: userData.userId }
                        );

                        if (success) {
                            totalNotificationsSent++;
                            console.log(`✅ Position update sent successfully for ${address}`);
                        } else {
                            console.error(`❌ Failed to send position update for ${address}`);
                        }
                    } else {
                        console.log(`⏰ Skipping position update for ${address} - not within hourly window`);
                    }

                } catch (positionError) {
                    console.error(`❌ Failed to generate/send position update for ${address}:`, positionError);

                    // Send error notification to user
                    try {
                        const errorMessage = positionError instanceof Error ? positionError.message : String(positionError);
                        const escapedError = errorMessage.replace(/[_*[\]()~`>#+=|{}.!-]/g, ' ');
                        await sendTelegramMessage(
                            `❌ **Error Loading Positions**\n\n📍 Address: \`${address}\`\n\n${escapedError}`,
                            { ...env, TG_CHAT_ID: userData.userId }
                        );
                    } catch (errorMsgError) {
                        console.error('❌ Failed to send error message:', errorMsgError);
                    }
                }
            }
        }

        console.log(`✅ Completed user notifications: ${totalNotificationsSent}/${totalAddressesProcessed} notifications sent`);

    } catch (error) {
        console.error('❌ Error in sendScheduledUserNotifications:', error);
        throw error;
    }
} 