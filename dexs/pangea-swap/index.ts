import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const MASTER_DEPLOYER = "0xEB4B1CE03bb947Ce23ABd1403dF7C9B86004178d";
const POOL_LOGGER = "0x002A422533cccEeA9aBF9e56e2A25d72672891bC";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ABIS = {
  whitelistedFactories: "function whitelistedFactories(address factory) view returns (bool)",
  factory: "address:factory",
  token0: "address:token0",
  token1: "address:token1",
  swapFee: "uint24:swapFee",
  swap: "event Swap(address indexed pool, bool zeroForOne, uint256 amountIn, uint256 amountOut)",
};

const PROTOCOL_FEE_RATIO = 0.1;
const SWAP_FEE_DENOMINATOR = 1_000_000n;

const fetch = async ({ api, createBalances, getLogs }: FetchOptions) => {
  const logs = await getLogs({
    target: POOL_LOGGER,
    eventAbi: ABIS.swap,
    skipIndexer: true,
  });

  const activePools = Array.from(new Set(logs.map((log: any) => log.pool.toLowerCase())));
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const [factories, token0s, token1s, swapFees] = await Promise.all([
    api.multiCall({ abi: ABIS.factory, calls: activePools, permitFailure: true }),
    api.multiCall({ abi: ABIS.token0, calls: activePools, permitFailure: true }),
    api.multiCall({ abi: ABIS.token1, calls: activePools, permitFailure: true }),
    api.multiCall({ abi: ABIS.swapFee, calls: activePools, permitFailure: true }),
  ]);

  const whitelistedFactories = await api.multiCall({
    target: MASTER_DEPLOYER,
    abi: ABIS.whitelistedFactories,
    calls: factories.map((factory) => ({ params: [factory ?? ZERO_ADDRESS] })),
    permitFailure: true,
  });

  const poolInfo: Record<string, { token0: string; token1: string; swapFee: bigint }> = {};
  activePools.forEach((pool: string, i: number) => {
    if (!factories[i] || !token0s[i] || !token1s[i] || !swapFees[i] || !whitelistedFactories[i]) return;

    poolInfo[pool.toLowerCase()] = {
      token0: token0s[i],
      token1: token1s[i],
      swapFee: BigInt(swapFees[i]),
    };
  });

  logs.forEach((log: any) => {
    const pool = log.pool.toLowerCase();
    if (!poolInfo[pool]) return;

    const { token0, token1, swapFee } = poolInfo[pool];
    const tokenIn = log.zeroForOne ? token0 : token1;
    const tokenOut = log.zeroForOne ? token1 : token0;
    const amountOut = BigInt(log.amountOut);
    const feeAmount = (amountOut * swapFee) / (SWAP_FEE_DENOMINATOR - swapFee);

    dailyVolume.add(tokenIn, log.amountIn);
    dailyFees.add(tokenOut, feeAmount, METRIC.SWAP_FEES);
  });

  const dailyRevenue = dailyFees.clone(PROTOCOL_FEE_RATIO, METRIC.PROTOCOL_FEES);
  const dailySupplySideRevenue = dailyFees.clone(1 - PROTOCOL_FEE_RATIO, METRIC.LP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: "2022-08-18",
    },
  },
  methodology: {
    Volume: "Swap volume from Pangea Trident-style pools registered in MasterDeployer and deployed by whitelisted factories, counted from the input token side of PoolLogger swap events.",
    Fees: "Trading fees paid by users, computed from each pool's swapFee() in pips. Pangea deducts fees from output, so fees are derived from the net amountOut.",
    UserFees: "Trading fees paid by users.",
    Revenue: "Pangea pool contracts route 10% of swap fees to protocol revenue.",
    ProtocolRevenue: "10% of swap fees collected by the protocol.",
    SupplySideRevenue: "90% of swap fees distributed to liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Fees paid by users on Pangea Swap trades.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol revenue, equal to 10% of swap fees.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol revenue, equal to 10% of swap fees.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Supply-side revenue, equal to 90% of swap fees.",
    },
  },
};

export default adapter;
