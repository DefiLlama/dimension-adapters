import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Aqua registry, deployed at the same address on every supported chain:
// https://github.com/1inch/aqua#deployments
const AQUA_REGISTRY = "0x499943e74fb0ce105688beee8ef2abec5d936d31";

const PULLED_ABI = "event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount)";
const SHIPPED_ABI = "event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy)";
const DOCKED_ABI = "event Docked(address maker, address app, bytes32 strategyHash)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // entireLog keeps transactionHash on the parsed logs so swap pulls can be
  // separated from strategy lifecycle transactions below
  const pulledLogs = await options.getLogs({ target: AQUA_REGISTRY, eventAbi: PULLED_ABI, entireLog: true });
  const shippedLogs = await options.getLogs({ target: AQUA_REGISTRY, eventAbi: SHIPPED_ABI, entireLog: true });
  const dockedLogs = await options.getLogs({ target: AQUA_REGISTRY, eventAbi: DOCKED_ABI, entireLog: true });

  // Transactions that ship (deploy) or dock (revoke) a strategy move liquidity,
  // not swap volume - Pulled/Pushed events they emit must not be counted.
  // Hashes are lowercased because the three fetches may be served by different
  // backends (indexer/RPC/cache) with no canonical casing guarantee
  const strategyLifecycleTxs = new Set<string>();
  shippedLogs.forEach((log: any) => strategyLifecycleTxs.add(log.transactionHash.toLowerCase()));
  dockedLogs.forEach((log: any) => strategyLifecycleTxs.add(log.transactionHash.toLowerCase()));

  pulledLogs.forEach((log: any) => {
    if (strategyLifecycleTxs.has(log.transactionHash.toLowerCase())) return;
    dailyVolume.add(log.args.token, log.args.amount);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.BASE,
    CHAIN.OPTIMISM,
    CHAIN.POLYGON,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.BSC,
    CHAIN.XDAI,
    CHAIN.LINEA,
    CHAIN.SONIC,
    CHAIN.UNICHAIN,
    CHAIN.ERA,
  ],
  start: "2025-11-17", // Aqua developer release: https://blog.1inch.com/aqua-developer-release/
  methodology: {
    Volume:
      "Sum of tokens delivered to takers by Aqua strategies during swap execution, measured as Pulled events on the Aqua registry. Only the taker-received side of each swap is counted to avoid double counting. Pulled events emitted in transactions that also ship or dock a strategy are excluded, as those move liquidity rather than trade it.",
  },
};

export default adapter;
