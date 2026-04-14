import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const chainConfig: Record<string, { id: number, start: string }> = {
    [CHAIN.ETHEREUM]: { id: 1, start: '2025-03-24' },
    [CHAIN.BSC]: { id: 56, start: '2025-04-07' },
    [CHAIN.BASE]: { id: 8453, start: '2025-03-17' },
    [CHAIN.ARBITRUM]: { id: 42161, start: '2025-03-17' },
    [CHAIN.SOLANA]: { id: 901, start: '2025-04-01' },
    [CHAIN.ECLIPSE]: { id: 902, start: '2025-04-02' },
    [CHAIN.HYPERLIQUID]: { id: 999, start: '2025-05-28' },
    [CHAIN.PLUME]: { id: 98866, start: '2025-06-02' },
    [CHAIN.MANTLE]: { id: 5000, start: '2025-05-28' },
    [CHAIN.SUI]: { id: 1001, start: '2025-06-22' },
    [CHAIN.MONAD]: { id: 143, start: '2025-11-25' },
    [CHAIN.MEGAETH]: { id: 4326, start: '2026-02-18' },
    [CHAIN.TEMPO]: { id: 4217, start: '2026-04-13' }
}

const skateDataApi = "https://api.skatechain.org/amm-data/pools/stats";

const fetch = async (options: FetchOptions) => {

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const tokenVolume_options = {
        params: {
            chainId: chainConfig[options.api.chain].id,
            startTime: options.startTimestamp,
            endTime: options.endTimestamp,
        }
    }
    const tokenVolumeInfo = await httpGet(skateDataApi, tokenVolume_options);

    if (tokenVolumeInfo.success && tokenVolumeInfo.data) {
      for (const tokenInfo of tokenVolumeInfo.data) {
          dailyVolume.add(tokenInfo.token, tokenInfo.volume);
          dailyFees.add(tokenInfo.token, tokenInfo.fees);
      }
    }

    return {
        dailyVolume,
        dailyFees
    }
};

const methodology = {
    Volume: "Total token swap volumes by users.",
    Fees: 'All fees paid by users for trading.'
}

const adapter: SimpleAdapter = {
    methodology,
    version: 2,
    fetch,
    adapter: chainConfig,
}

export default adapter;
