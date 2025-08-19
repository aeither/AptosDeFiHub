export interface PoolConfig {
    poolId: string;
    name: string;
    enabled: boolean;
    rangePercent?: number | null; // Percentage from current price (1 = 1%, 0.01 = 0.01%)
}

/**
 * Default pools to monitor/manage - Single source of truth
 */
export const DEFAULT_POOLS_TO_MANAGE: PoolConfig[] = [
    // {
    //     poolId: '0x10d8e8f6197f75749044fa67eff972ec4262ffee3fdd386fde4f88c076542442', // APT/ECHO
    //     name: 'APT/ECHO',
    //     enabled: true,
    //     rangePercent: 13 // null = use tightest range, or set percentage like 2 for 2%
    // },
    {
        poolId: '0xbab8526a9eb7403a444fcc1f73bf02d8f94dafd3c88a02b5736a1a77fafe4169', // APT/kAPT
        name: 'APT/kAPT',
        enabled: false,
        rangePercent: null // null = use tightest range, or set percentage like 2 for 2%
    },
    {
        poolId: '0x925660b8618394809f89f8002e2926600c775221f43bf1919782b297a79400d8', // APT/USDC
        name: 'APT/USDC',
        enabled: false,
        rangePercent: 5 // null = use tightest range, or set percentage like 2 for 2%
    },
    {
        poolId: '0x18269b1090d668fbbc01902fa6a5ac6e75565d61860ddae636ac89741c883cbc', // APT/USDT
        name: 'APT/USDT',
        enabled: true,
        rangePercent: 5 // null = use tightest range, or set percentage like 2 for 2%
    },
    {
        poolId: '0x9878b6f039b1fce27240fd51f536fceefac939268ecaa8dd6c84b7640177abe4', // APT/stkAPT
        name: 'APT/stkAPT',
        enabled: false,
        rangePercent: null // 2% range from current tick (±2%), null = use tightest range
    }
];

/**
 * Get pool configurations formatted for filter functions
 */
export function getPoolConfigsForFilter(): Array<{ poolId: string, rangePercent: number | null }> {
    return DEFAULT_POOLS_TO_MANAGE.map(p => ({
        poolId: p.poolId,
        rangePercent: p.rangePercent ?? null
    }));
} 