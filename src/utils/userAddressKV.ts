import type { Env } from '../env';

export interface UserAddresses {
  userId: string;
  addresses: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all tracked addresses for a specific user
 */
export async function getUserAddresses(userId: string, env: Env): Promise<string[]> {
  try {
    const userKey = `user:${userId}`;
    const data = await env.USER_ADDRESSES.get(userKey, 'json') as UserAddresses | null;
    
    if (!data || !Array.isArray(data.addresses)) {
      return [];
    }
    
    return data.addresses;
  } catch (error) {
    console.error(`❌ Error getting addresses for user ${userId}:`, error);
    return [];
  }
}

/**
 * Add an address to user's tracking list
 */
export async function addUserAddress(userId: string, address: string, env: Env): Promise<{ success: boolean; message: string }> {
  try {
    // Validate address format (basic Aptos address validation)
    if (!address || !address.startsWith('0x') || address.length < 10) {
      return { success: false, message: '❌ Invalid address format. Address must start with 0x and be at least 10 characters.' };
    }

    const userKey = `user:${userId}`;
    const existingData = await env.USER_ADDRESSES.get(userKey, 'json') as UserAddresses | null;
    
    let addresses: string[] = [];
    
    if (existingData && Array.isArray(existingData.addresses)) {
      addresses = existingData.addresses;
    }

    // Check if address already exists
    if (addresses.includes(address)) {
      return { success: false, message: '❌ Address already in your tracking list.' };
    }

    // Add the new address
    addresses.push(address);

    const userData: UserAddresses = {
      userId,
      addresses,
      createdAt: existingData?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await env.USER_ADDRESSES.put(userKey, JSON.stringify(userData));

    return { 
      success: true, 
      message: `✅ Address added successfully!\n\n🔍 Now tracking: \`${address}\`\n📊 Total addresses: ${addresses.length}` 
    };

  } catch (error) {
    console.error(`❌ Error adding address for user ${userId}:`, error);
    return { success: false, message: '❌ Failed to add address. Please try again.' };
  }
}

/**
 * Remove a specific address from user's tracking list
 */
export async function removeUserAddress(userId: string, address: string, env: Env): Promise<{ success: boolean; message: string }> {
  try {
    const userKey = `user:${userId}`;
    const existingData = await env.USER_ADDRESSES.get(userKey, 'json') as UserAddresses | null;
    
    if (!existingData || !Array.isArray(existingData.addresses)) {
      return { success: false, message: '❌ No addresses found in your tracking list.' };
    }

    const addressIndex = existingData.addresses.indexOf(address);
    if (addressIndex === -1) {
      return { success: false, message: '❌ Address not found in your tracking list.' };
    }

    // Remove the address
    existingData.addresses.splice(addressIndex, 1);
    existingData.updatedAt = new Date().toISOString();

    if (existingData.addresses.length === 0) {
      // If no addresses left, delete the key
      await env.USER_ADDRESSES.delete(userKey);
      return { success: true, message: '✅ Address removed. Your tracking list is now empty.' };
    }
    
    // Update with remaining addresses
    await env.USER_ADDRESSES.put(userKey, JSON.stringify(existingData));
    return { 
      success: true, 
      message: `✅ Address removed successfully!\n\n📊 Remaining addresses: ${existingData.addresses.length}` 
    };

  } catch (error) {
    console.error(`❌ Error removing address for user ${userId}:`, error);
    return { success: false, message: '❌ Failed to remove address. Please try again.' };
  }
}

/**
 * Clear all addresses for a user
 */
export async function clearUserAddresses(userId: string, env: Env): Promise<{ success: boolean; message: string }> {
  try {
    const userKey = `user:${userId}`;
    await env.USER_ADDRESSES.delete(userKey);
    
    return { success: true, message: '✅ All addresses cleared from your tracking list.' };

  } catch (error) {
    console.error(`❌ Error clearing addresses for user ${userId}:`, error);
    return { success: false, message: '❌ Failed to clear addresses. Please try again.' };
  }
}

/**
 * Get all users with their addresses (for worker.ts scheduled task)
 */
export async function getAllUserAddresses(env: Env): Promise<{ userId: string; addresses: string[] }[]> {
  try {
    // List all keys with the user: prefix
    const { keys } = await env.USER_ADDRESSES.list({ prefix: 'user:' });
    
    const allUserAddresses: { userId: string; addresses: string[] }[] = [];
    
    for (const key of keys) {
      try {
        const userData = await env.USER_ADDRESSES.get(key.name, 'json') as UserAddresses | null;
        
        if (userData && Array.isArray(userData.addresses) && userData.addresses.length > 0) {
          allUserAddresses.push({
            userId: userData.userId,
            addresses: userData.addresses
          });
        }
      } catch (error) {
        console.error(`❌ Error processing user data for key ${key.name}:`, error);
      }
    }
    
    return allUserAddresses;

  } catch (error) {
    console.error('❌ Error getting all user addresses:', error);
    return [];
  }
}

/**
 * Get formatted list of user's addresses for display
 */
export async function getFormattedUserAddresses(userId: string, env: Env): Promise<string> {
  try {
    const addresses = await getUserAddresses(userId, env);
    
    if (addresses.length === 0) {
      return "📭 *Your Address List*\n\nNo addresses tracked yet.\n\n💡 Use `/add <address>` to start tracking an address.";
    }

    let message = `📊 *Your Tracked Addresses* (${addresses.length})\n\n`;
    
    addresses.forEach((address, index) => {
      const shortAddress = `${address.slice(0, 8)}...${address.slice(-8)}`;
      message += `${index + 1}. \`${address}\`\n   📱 ${shortAddress}\n\n`;
    });

    message += "💡 *Commands:*\n";
    message += "• `/add <address>` - Add new address\n";
    message += "• `/remove <address>` - Remove address\n";
    message += "• `/clear` - Clear all addresses\n";
    message += "• `/positions <address>` - View positions";

    return message;

  } catch (error) {
    console.error(`❌ Error formatting addresses for user ${userId}:`, error);
    return '❌ Error loading your address list. Please try again.';
  }
} 