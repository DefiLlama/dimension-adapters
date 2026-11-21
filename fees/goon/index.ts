import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { filterPools } from "../../helpers/uniswap";
import ADDRESSES from "../../helpers/coreAssets.json";

const MIN_TVL = 100; // Minimum TVL for a pool to be considered, in USD. Pools with less than this are considered dust and ignored.
const MAX_POOLS = 10_000; // Maximum number of pools to consider. Launchpads can have thousands of pools, but we only want to consider the largest ones.

const chainConfig: Record<string, { goon: string; usdToken: string; fromBlock: number; start: string; deadFrom?: string; }> = {
  [CHAIN.ROBINHOOD]: {
    goon: "0x80ea4cd0e33f8323cd3d33d7006f247733177a9e",
    usdToken: ADDRESSES.robinhood.USDG,
    fromBlock: 15102260, // Goon deploy block
    start: "2026-07-20",
    deadFrom: "2026-08-17", // migrated to Base
  },
  [CHAIN.BASE]: {
    goon: "0x60e6f91783546C78265CdCB5B69aD1ad41BB9537",
    usdToken: ADDRESSES.base.USDC,
    fromBlock: 50060858, // Goon deploy block
    start: "2026-08-17",
  },
};

const LAUNCHED =
  "event Launched(address token, uint256 supply, string name, string symbol, string image, address creator, address pool, address lock)";
const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
// Selector 0x3850c7bd - feeProtocol is a uint8 packing two nibbles: bits 0-3 for token0's
// protocol fee denominator, bits 4-7 for token1's (0 = fee switch off for that side).
const SLOT0_ABI =
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";

const SWAP_FEES_TO_PROTOCOL = "Token Swap Fees to Protocol";
const SWAP_FEES_TO_CREATOR = "Token Swap Fees to Creators";
const SWAP_FEES_TO_UNISWAP = "Token Swap Fees to Uniswap";

const fetch = async (options: FetchOptions) => {
  const { goon, usdToken, fromBlock } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Full history of launches, needed to know every pool that could still be trading.
  const allLaunches = await options.getLogs({
    target: goon,
    eventAbi: LAUNCHED,
    fromBlock,
    cacheInCloud: true,
  });

  const pairObject: IJSON<string[]> = {};
  for (const launch of allLaunches) {
    pairObject[launch.pool.toLowerCase()] = [usdToken.toLowerCase(), launch.token.toLowerCase()];
  }

  const filteredPools = await filterPools({
    api: options.api,
    pairs: pairObject,
    createBalances: options.createBalances,
    minUSDValue: MIN_TVL,
    maxPairSize: MAX_POOLS,
  });
  const pools = Object.keys(filteredPools);

  if (pools.length) {
    const [feeTiers, slot0Results] = await Promise.all([
      options.api.multiCall({
        abi: "function fee() view returns (uint24)",
        calls: pools,
        permitFailure: true,
      }),
      options.api.multiCall({ abi: SLOT0_ABI, calls: pools, permitFailure: true }),
    ]);

    const swapLogsByPool = await options.getLogs({
      targets: pools,
      eventAbi: SWAP_EVENT,
      flatten: false,
    });

    swapLogsByPool.forEach((logs: any[], i: number) => {
      if (!logs.length) return;
      const feeTier = Number(feeTiers[i] ?? 0) / 1e6;
      if (!feeTier) return;

      // Uniswap's fee switch diverts part of the LP fee to Uniswap itself
      const feeProtocol = Number(slot0Results[i]?.feeProtocol ?? 0);
      const usdRatioToUniswap = feeProtocol & 0x0f ? 1 / (feeProtocol & 0x0f) : 0;
      const tokenRatioToUniswap = (feeProtocol >> 4) & 0x0f ? 1 / ((feeProtocol >> 4) & 0x0f) : 0;

      for (const log of logs) {
        const usdRaw = Number(log.amount0);
        const usdIn = usdRaw > 0; // launcher enforces usd to always be token0
        const usdLeg = Math.abs(usdRaw);

        if (usdIn) {
          // USD was the input - fee is charged directly in USD, split between Uniswap and protocol.
          const totalFee = usdLeg * feeTier;
          const uniswapCut = totalFee * usdRatioToUniswap;
          dailyFees.add(usdToken, totalFee, METRIC.SWAP_FEES);
          dailyRevenue.add(usdToken, totalFee - uniswapCut, SWAP_FEES_TO_PROTOCOL);
          if (uniswapCut) dailySupplySideRevenue.add(usdToken, uniswapCut, SWAP_FEES_TO_UNISWAP);
        } else {
          // The launch token was the input, fee is charged in that token and split between
          // Uniswap and the creator. We can't reliably price the arbitrary launch token itself,
          // but we can value the fee in USD-equivalent terms using this same swap's implied
          // exchange rate (grossing up the USD output by the fee rate).
          const totalFee = (usdLeg * feeTier) / (1 - feeTier);
          const uniswapCut = totalFee * tokenRatioToUniswap;
          dailyFees.add(usdToken, totalFee, METRIC.SWAP_FEES);
          dailySupplySideRevenue.add(usdToken, totalFee - uniswapCut, SWAP_FEES_TO_CREATOR);
          if (uniswapCut) dailySupplySideRevenue.add(usdToken, uniswapCut, SWAP_FEES_TO_UNISWAP);
        }
      }
    });
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Uniswap V3 swap fees generated by Goon-launched pools (pools with under $100 TVL are excluded as dust).",
  Revenue: "The USD share of swap fees, minus whatever Uniswap's protocol fee switch (read live per pool via slot0().feeProtocol) diverts to Uniswap itself.",
  ProtocolRevenue: "Same as Revenue.",
  SupplySideRevenue: "The token share of swap fees paid to the token creator, plus Uniswap's diverted cut of both swap fee legs (read live per pool via slot0().feeProtocol).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Uniswap V3 swap fees generated by Goon-launched pools, split by which side of the swap was the input: USD-input fees (to protocol/Uniswap) and Token-input fees (to creator/Uniswap). Pools with under $100 TVL are excluded as dust.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Swap fees charged when USD was the input token, minus Uniswap's live per-pool protocol fee cut, accrue to the protocol treasury.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Swap fees charged when USD was the input token, minus Uniswap's live per-pool protocol fee cut, accrue to the protocol treasury.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_CREATOR]: "Swap fees charged when the Token was the input token, minus Uniswap's live per-pool protocol fee cut, accrue to the token creator.",
    [SWAP_FEES_TO_UNISWAP]: "Uniswap's protocol fee switch cut of both swap fee legs, read live per pool via slot0().feeProtocol - no longer reaches Goon's protocol or the token creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  doublecounted: true, // Goon pools are Uniswap V3 pools
  adapter: chainConfig,
};

export default adapter;
