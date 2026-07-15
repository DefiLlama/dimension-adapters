import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// RFQ DEX. Pools are factory-created, so match trade events by topic rather than address.
const TRADE_EVENT = "event Trade(address trader, address effectiveTrader, bytes32 txid, address baseToken, address quoteToken, uint256 baseTokenAmount, uint256 quoteTokenAmount)";
const XCHAIN_TRADE_EVENT = "event XChainTrade(uint16 dstChainId, bytes32 dstPool, address trader, bytes32 dstTrader, bytes32 txid, address baseToken, bytes32 quoteToken, uint256 baseTokenAmount, uint256 quoteTokenAmount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // single-chain swaps
  const trades = await options.getLogs({ noTarget: true, eventAbi: TRADE_EVENT, skipIndexer: true });
  trades.forEach((log: any) => dailyVolume.add(log.baseToken, log.baseTokenAmount));

  // cross-chain source leg (destination only emits XChainTradeFill, no amounts)
  const xChainTrades = await options.getLogs({ noTarget: true, eventAbi: XCHAIN_TRADE_EVENT, skipIndexer: true });
  xChainTrades.forEach((log: any) => dailyVolume.add(log.baseToken, log.baseTokenAmount));

  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of the USD value of the token leaving the settling chain on each Hashflow RFQ swap, read from the Trade and XChainTrade events emitted by Hashflow's on-chain pool contracts. Each swap is counted once (the base-token leg), including the source-chain leg of cross-chain swaps.",
};

// Hashflow 2.0 pools deployed from Sep 2023.
const chains = {
  [CHAIN.ETHEREUM]: "2023-09-01",
  [CHAIN.ARBITRUM]: "2023-09-01",
  [CHAIN.OPTIMISM]: "2023-09-01",
  [CHAIN.POLYGON]: "2023-09-01",
  [CHAIN.BSC]: "2023-09-01",
  [CHAIN.AVAX]: "2023-09-01",
  [CHAIN.BASE]: "2023-09-01",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: Object.fromEntries(
    Object.entries(chains).map(([chain, start]) => [chain, { fetch, start }])
  ),
};

export default adapter;
