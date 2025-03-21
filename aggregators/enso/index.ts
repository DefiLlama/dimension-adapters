import { CHAIN } from "../../helpers/chains";
import { FetchV2 } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";

const chains: Record<string, { duneChain: string; start: string }> = {
  [CHAIN.ETHEREUM]: { duneChain: "ethereum", start: "2023-06-22" },
  [CHAIN.OPTIMISM]: { duneChain: "optimism", start: "2023-09-19" },
  [CHAIN.BSC]: { duneChain: "binance", start: "2023-09-20" },
  [CHAIN.POLYGON]: { duneChain: "polygon", start: "2023-09-05" },
  [CHAIN.BASE]: { duneChain: "base", start: "2023-12-24" },
  [CHAIN.ARBITRUM]: { duneChain: "arbitrum", start: "2023-09-11" },
  [CHAIN.BERACHAIN]: { duneChain: "berachain", start: "2025-01-25" },
  [CHAIN.LINEA]: { duneChain: "linea", start: "2023-12-14" },
};

const queryId = "4687193";

const fetchVolume = async (_:any, _1:any, { startTimestamp, endTimestamp, chain }) => {
  const chainConfig = chains[chain];
  if (!chainConfig) throw new Error(`Chain configuration not found for: ${chain}`);

  const data = await queryDune(queryId, {
    timestamp_from: startTimestamp,
    timestamp_to: endTimestamp,
    chain: chainConfig.duneChain,
  });

  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);

  return {
    dailyVolume: chainData.volume_timerange,
    totalVolume: chainData.total_volume,
    timestamp: endTimestamp,
  };
};

const adapter: any = {
  version: 1,
  isExpensiveAdapter: true,
  adapter: Object.fromEntries(
      Object.entries(chains).map(([chain, { start }]) => [
        chain,
        { fetch: fetchVolume, start },
      ])
  ),
};

export default adapter;
