import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// RFQ DEX. Pools are factory-created, so enumerate them from the factory's CreatePool
// events and read each pool's Trade / XChainTrade events.
const TRADE_EVENT = "event Trade(address trader, address effectiveTrader, bytes32 txid, address baseToken, address quoteToken, uint256 baseTokenAmount, uint256 quoteTokenAmount)";
const XCHAIN_TRADE_EVENT = "event XChainTrade(uint16 dstChainId, bytes32 dstPool, address trader, bytes32 dstTrader, bytes32 txid, address baseToken, bytes32 quoteToken, uint256 baseTokenAmount, uint256 quoteTokenAmount)";
const CREATE_POOL_EVENT = "event CreatePool(address pool, address operations)";

// factory address + block to start scanning for pools (just before the Sep-2023 deploy)
const config = {
  [CHAIN.ETHEREUM]: { factory: "0xdE828fdc3F497F16416D1bB645261C7C6a62DAb5", fromBlock: 17952252 },
  [CHAIN.ARBITRUM]: { factory: "0xdE828fdc3F497F16416D1bB645261C7C6a62DAb5", fromBlock: 123071231 },
  [CHAIN.OPTIMISM]: { factory: "0x6D551f4D999faC0984eb75B2B230ba7e7651BdE7", fromBlock: 108445412 },
  [CHAIN.POLYGON]: { factory: "0xdE828fdc3F497F16416D1bB645261C7C6a62DAb5", fromBlock: 46516155 },
  [CHAIN.BSC]: { factory: "0xdE828fdc3F497F16416D1bB645261C7C6a62DAb5", fromBlock: 31003016 },
  [CHAIN.AVAX]: { factory: "0xdE828fdc3F497F16416D1bB645261C7C6a62DAb5", fromBlock: 34137624 },
  [CHAIN.BASE]: { factory: "0xdE828fdc3F497F16416D1bB645261C7C6a62DAb5", fromBlock: 2850127 },
};

const fetch = async (options: FetchOptions) => {
  const { factory, fromBlock } = config[options.chain];
  const dailyVolume = options.createBalances();

  const poolLogs = await options.getLogs({
    target: factory,
    eventAbi: CREATE_POOL_EVENT,
    fromBlock,
    toBlock: await options.getToBlock(),
    cacheInCloud: true,
  });
  const targets = poolLogs.map((log: any) => log.pool);

  // single-chain swaps
  const trades = await options.getLogs({ targets, eventAbi: TRADE_EVENT });
  trades.forEach((log: any) => dailyVolume.add(log.baseToken, log.baseTokenAmount));

  // cross-chain source leg (destination only emits XChainTradeFill, no amounts)
  const xChainTrades = await options.getLogs({ targets, eventAbi: XCHAIN_TRADE_EVENT });
  xChainTrades.forEach((log: any) => dailyVolume.add(log.baseToken, log.baseTokenAmount));

  return { dailyVolume };
};

const methodology = {
  Volume: "Sum of the USD value of the token leaving the settling chain on each Hashflow RFQ swap, read from the Trade and XChainTrade events on Hashflow's pool contracts. Each swap is counted once (the base-token leg), including the source-chain leg of cross-chain swaps.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: Object.fromEntries(
    Object.keys(config).map((chain) => [chain, { fetch, start: "2023-09-01" }])
  ),
};

export default adapter;
