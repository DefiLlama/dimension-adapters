import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Rysk Premium VaultRegistry per chain — lists every LiquidityPool (vault).
const CONFIG: Record<string, { vaultRegistry: string; start: string }> = {
    [CHAIN.ETHEREUM]: {
        vaultRegistry: "0x12a86ae14992c5a5e8671d30cfd60289f9d0afbe",
        start: '2026-07-11',
    },
    [CHAIN.HYPERLIQUID]: {
        vaultRegistry: "0x425ffAB71CEFc7aB96CBFbb75282e731234C1885",
        start: '2026-02-05',
    },
};

const WRITE_OPTION =
    "event WriteOption(address indexed series, uint256 amount, uint256 premium, uint256 escrow, address indexed buyer)";
const BUYBACK_OPTION =
    "event BuybackOption(address indexed series, uint256 amount, uint256 premium, uint256 collateralReturned, address indexed seller)";

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyNotionalVolume = options.createBalances();
    const dailyPremiumVolume = options.createBalances();

    const { vaultRegistry } = CONFIG[options.chain];

    // Discover all vaults (LiquidityPools) from the registry.
    const pools: string[] = await options.api.call({
        target: vaultRegistry,
        abi: "address[]:getAllVaults",
    });

    // Premium + collateral are denominated in each pool's own collateralAsset
    // (WETH for the call vault, USDT/USDC for put vaults), in native decimals.
    const collateralAssets: string[] = await options.api.multiCall({
        abi: "address:collateralAsset",
        calls: pools.map((pool) => ({ target: pool })),
    });

    // Batch all pools into one getLogs per event type; flatten:false keeps
    // per-pool arrays aligned to `pools`, so we can attribute each log to its
    // pool's collateralAsset.
    const writeLogsByPool = await options.getLogs({ targets: pools, eventAbi: WRITE_OPTION, flatten: false });
    const buybackLogsByPool = await options.getLogs({ targets: pools, eventAbi: BUYBACK_OPTION, flatten: false });

    for (let i = 0; i < pools.length; i++) {
        const collateral = collateralAssets[i];

        // Writes: buyer pays premium into the pool; escrow = collateral locked ~ notional.
        writeLogsByPool[i].forEach((log: any) => {
            dailyPremiumVolume.add(collateral, log.premium);
            dailyNotionalVolume.add(collateral, log.escrow);
        });

        // Buybacks: pool pays premium back to the seller — premium turnover.
        buybackLogsByPool[i].forEach((log: any) => {
            dailyPremiumVolume.add(collateral, log.premium);
        });
    }

    return { dailyNotionalVolume, dailyPremiumVolume };
}

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    adapter: CONFIG,
};

export default adapter;
