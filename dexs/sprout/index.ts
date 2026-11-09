import { ChainApi } from "@defillama/sdk";
import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Sprout LaunchpadCore contracts on Injective EVM: the current core and the two legacy cores still
// listed in the trysprout.fun frontend config. All three emit the same Buy/Sell events.
// Event definitions are copied from the verified source of the current core:
// https://blockscout.injective.network/address/0x1333692eB905823df110762525c26f7489BB9300
const CORES = [
  "0x1333692eB905823df110762525c26f7489BB9300", // current
  "0xd948740da926E8908A08414879490d0D8F96D463", // legacy
  "0xeBF62508F322137EE0986935Ee3b4A60a3F0D227", // legacy
];

const ABI = {
  // pairIn is the gross pair amount paid by the buyer, fee included
  buy: "event Buy(uint256 indexed launchId, address indexed buyer, uint256 pairIn, uint256 fee, uint256 tokenOut, uint256 realPair, uint256 tokensSold, uint256 spotPriceWad, uint256 progressBps)",
  // pairOutGross is the pair amount taken out of the curve, before the fee is deducted
  sell: "event Sell(uint256 indexed launchId, address indexed seller, uint256 tokenIn, uint256 pairOutGross, uint256 fee, uint256 realPair, uint256 tokensSold, uint256 spotPriceWad, uint256 progressBps)",
  getLaunchPairAsset: "function getLaunchPairAsset(uint256 launchId) view returns (address)",
};

// the sdk cannot resolve an Injective EVM block from a timestamp, so use the llama block endpoint
// (same approach as fees/sprout)
const getBlock = async (timestamp: number): Promise<number> => {
  const { height } = await httpGet(`https://coins.llama.fi/block/${CHAIN.INJECTIVE}/${timestamp}`);
  if (!height) throw new Error(`Sprout: no injective block for timestamp ${timestamp}`);
  return height;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const fromBlock = await getBlock(options.fromTimestamp);
  const toBlock = await getBlock(options.toTimestamp);
  const api = new ChainApi({ chain: options.chain, block: toBlock });

  // launch ids are per core, so keep the logs grouped by core (flatten: false returns one array per target)
  const buys = await options.getLogs({ targets: CORES, eventAbi: ABI.buy, fromBlock, toBlock, flatten: false });
  const sells = await options.getLogs({ targets: CORES, eventAbi: ABI.sell, fromBlock, toBlock, flatten: false });
  const trades = CORES.flatMap((core, i) => [
    ...buys[i].map((log: any) => ({ core, launchId: String(log.launchId), amount: log.pairIn })),
    ...sells[i].map((log: any) => ({ core, launchId: String(log.launchId), amount: log.pairOutGross })),
  ]);

  // every launch trades against one pair asset (wINJ, USDC, SAI or SPROUT)
  const launchKeys = [...new Set(trades.map((trade) => `${trade.core}:${trade.launchId}`))];
  const pairAssets = await api.multiCall({
    abi: ABI.getLaunchPairAsset,
    calls: launchKeys.map((key) => {
      const [target, launchId] = key.split(":");
      return { target, params: [launchId] };
    }),
  });
  const pairAssetByLaunch: Record<string, string> = {};
  launchKeys.forEach((key, i) => {
    if (!pairAssets[i] || pairAssets[i] === ADDRESSES.null) throw new Error(`Sprout: no pair asset for launch ${key}`);
    pairAssetByLaunch[key] = pairAssets[i];
  });

  trades.forEach((trade) => dailyVolume.add(pairAssetByLaunch[`${trade.core}:${trade.launchId}`], trade.amount));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INJECTIVE],
  start: "2026-08-24",
  methodology: {
    Volume: "Value of every buy and sell on sprout.fun bonding curves, fees included. Excludes trades in the Choice v2 pools that launches graduate into, which are counted under Choice Exchange.",
  },
};

export default adapter;
