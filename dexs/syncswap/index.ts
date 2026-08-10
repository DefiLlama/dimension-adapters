import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken, isCoreAsset } from "../../helpers/prices";

// SyncSwap PoolMaster registry per chain. Enumerates every Classic + Stable pool
const chainConfig: Record<string, { master: string, start: string }> = {
  [CHAIN.ERA]: {
    master: "0xbB05918E9B4bA9Fe2c8384d223f0844867909Ffb",
    start: "2023-03-24",
  },
  [CHAIN.LINEA]: {
    master: "0x608Cb7C3168427091F5994A45Baf12083964B4A3",
    start: "2023-07-14",
  },
  [CHAIN.SCROLL]: {
    master: "0x608Cb7C3168427091F5994A45Baf12083964B4A3",
    start: "2023-10-17",
  },
  [CHAIN.SOPHON]: {
    master: "0x5b9f21d407F35b10CbfDDca17D5D84b129356ea3",
    start: "2024-12-17",
  },
};

// SyncSwap fees are uint24 values scaled to MAX_FEE (1e5). swapFee is the total
// fee as a fraction of the input amount; protocolFee is the share of that fee
// taken by the protocol (the remainder accrues to LPs).
const FEE_DENOMINATOR = 100_000;
const ZERO = "0x0000000000000000000000000000000000000000";

const abi = {
  poolsLength: "function poolsLength() view returns (uint256)",
  pools: "function pools(uint256) view returns (address)",
  getSwapFee: "function getSwapFee(address pool, address sender, address tokenIn, address tokenOut, bytes data) view returns (uint24)",
  getProtocolFee: "function getProtocolFee(address pool) view returns (uint24)",
  swap: "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
};

// Enumerate the PoolMaster registry (pools(i)), not factory PoolCreated logs: the
// registry was migrated without backfilling creation events, so log discovery is
// incomplete
async function loadPools(options: FetchOptions, master: string) {
  const { api } = options;
  const length = Number(await api.call({ target: master, abi: abi.poolsLength }));
  const calls = Array.from({ length }, (_, i) => ({ target: master, params: [i] }));
  const pools: string[] = await api.multiCall({ abi: abi.pools, calls });
  const token0s: string[] = await api.multiCall({ abi: "address:token0", calls: pools, permitFailure: true });
  const token1s: string[] = await api.multiCall({ abi: "address:token1", calls: pools, permitFailure: true });
  return { pools, token0s, token1s };
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;
  const { master } = chainConfig[chain];

  const { pools, token0s, token1s } = await loadPools(options, master);
  const pairObject: Record<string, string[]> = {};
  pools.forEach((pool: string, i: number) => {
    if (pool && token0s[i] && token1s[i]) pairObject[pool] = [token0s[i], token1s[i]];
  });

  // Volume is valued on the core-asset side of each swap (addOneToken), so only
  // pools pairing a core asset can contribute. Filtering to these skips the dead/
  // unpriceable long tail and bounds the number of getLogs targets.
  const pairIds = Object.keys(pairObject).filter(
    (p) => isCoreAsset(chain, pairObject[p][0]) || isCoreAsset(chain, pairObject[p][1])
  );

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  if (!pairIds.length) {
    return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
  }

  const allLogs = await getLogs({ targets: pairIds, eventAbi: abi.swap, flatten: false });

  // Read the fee config only for pools that actually traded in the window.
  const activeIdx = allLogs.map((logs: any[], i: number) => (logs.length ? i : -1)).filter((i: number) => i >= 0);
  const activePools = activeIdx.map((i: number) => pairIds[i]);
  const swapFees = await api.multiCall({
    abi: abi.getSwapFee,
    target: master,
    calls: activePools.map((p) => ({ params: [p, ZERO, pairObject[p][0], pairObject[p][1], "0x"] })),
    permitFailure: true,
  });
  const protocolFees = await api.multiCall({
    abi: abi.getProtocolFee,
    target: master,
    calls: activePools.map((p) => ({ params: [p] })),
    permitFailure: true,
  });
  activeIdx.forEach((index: number, j: number) => {
    const swapFee = Number(swapFees[j] ?? 0) / FEE_DENOMINATOR; // total fee, fraction of volume
    if (!swapFee) return;
    const protocolFee = swapFee * (Number(protocolFees[j] ?? 0) / FEE_DENOMINATOR); // protocol share of the fee
    const lpFee = swapFee - protocolFee;
    const [token0, token1] = pairObject[pairIds[index]];
    const core0 = isCoreAsset(chain, token0);

    allLogs[index].forEach((log: any) => {
      const amount0 = log.amount0Out > 0n ? Number(log.amount0Out) : Number(log.amount0In);
      const amount1 = log.amount1Out > 0n ? Number(log.amount1Out) : Number(log.amount1In);
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 });

      // Apply fees to the core-asset side of the trade (addOneToken's priced side).
      const [token, amount] = core0 ? [token0, amount0] : [token1, amount1];
      dailyFees.add(token, amount * swapFee);
      dailyRevenue.add(token, amount * protocolFee);
      dailySupplySideRevenue.add(token, amount * lpFee);
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Token swap volume on SyncSwap Classic and Stable pools, summed from on-chain Swap events and valued on the core-asset side of each trade.",
  Fees: "Swap fees paid by users, computed per pool as swap volume times the pool's swap fee rate read from the SyncSwap PoolMaster.",
  UserFees: "Users pay a swap fee on every trade.",
  Revenue: "Protocol share of swap fees, taken as the pool's protocol fee percentage of the swap fee.",
  ProtocolRevenue: "Protocol share of swap fees, taken as the pool's protocol fee percentage of the swap fee.",
  SupplySideRevenue: "LP share of swap fees, the remainder after the protocol fee.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology,
  pullHourly: true,
  adapter: chainConfig
};

export default adapter;
