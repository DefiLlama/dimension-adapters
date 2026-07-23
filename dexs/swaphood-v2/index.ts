import BigNumber from "bignumber.js";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";

const FACTORY = "0xE7206Ecac3A51afe7e6179182ad4130A26068dD1";
const MASTERCHEF = "0x734c9ef24AEeb9654Be9A19f6d3991b5D91c587B";
const START = "2026-07-10";

const FEE_DENOMINATOR = new BigNumber(10_000);
const PROTOCOL_FEE_PERCENT = new BigNumber(5);
const PERCENT_DENOMINATOR = new BigNumber(100);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const SWAP_EVENT = "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)";

const ABIS = {
  allPairsLength: "uint256:allPairsLength",
  allPairs: "function allPairs(uint256) view returns (address)",
  token0: "address:token0",
  token1: "address:token1",
  getFee: "uint256:getFee",
  gauges: "function gauges(address) view returns (address)",
};

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  PROTOCOL_REVENUE: "Swap Fees Retained By Protocol",
  HOLDERS_REVENUE: "Swap Fees Distributed To Holders",
  LP_REVENUE: "Swap Fees To Liquidity Providers",
};

type NumericValue = string | number | bigint | BigNumber;

type SwapLog = {
  amount0In: NumericValue;
  amount1In: NumericValue;
  amount0Out: NumericValue;
  amount1Out: NumericValue;
};

type PairInfo = {
  token0: string;
  token1: string;
  rawFee: BigNumber;
  isStaked: boolean;
};

function toBN(value: NumericValue | null | undefined, context: string): BigNumber {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${context}`);
  }

  const result = BigNumber.isBigNumber(value) ? value : new BigNumber(value.toString());

  if (!result.isFinite()) {
    throw new Error(`Invalid ${context}: ${value.toString()}`);
  }

  return result;
}

function splitStakedFee(totalFee: BigNumber): {
  protocolFee: BigNumber;
  holdersFee: BigNumber;
} {
  const protocolFee = totalFee
    .times(PROTOCOL_FEE_PERCENT)
    .div(PERCENT_DENOMINATOR)
    .integerValue(BigNumber.ROUND_FLOOR);

  return {
    protocolFee,
    holdersFee: totalFee.minus(protocolFee),
  };
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getLogs, chain } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const pairCountResult = await api.call({
    target: FACTORY,
    abi: ABIS.allPairsLength,
  });

  const pairCount = Number(pairCountResult);

  if (!Number.isFinite(pairCount) || pairCount < 0) {
    throw new Error(
      `Invalid SwapHood V2 pair count: ${pairCountResult}`,
    );
  }

  if (pairCount === 0) {
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
    };
  }

  const pairResults = await api.multiCall({
    target: FACTORY,
    abi: ABIS.allPairs,
    calls: Array.from(
      { length: pairCount },
      (_, index) => ({ params: [index] }),
    ),
    permitFailure: true,
  });

  const pairs = pairResults.filter(
    (pair): pair is string =>
      typeof pair === "string" &&
      pair.toLowerCase() !== ZERO_ADDRESS,
  );

  const token0s = await api.multiCall({
    abi: ABIS.token0,
    calls: pairs,
    permitFailure: true,
  });

  const token1s = await api.multiCall({
    abi: ABIS.token1,
    calls: pairs,
    permitFailure: true,
  });

  const rawFees = await api.multiCall({
    abi: ABIS.getFee,
    calls: pairs,
    permitFailure: true,
  });

  const gauges = await api.multiCall({
    target: MASTERCHEF,
    abi: ABIS.gauges,
    calls: pairs.map((pair) => ({ params: [pair] })),
    permitFailure: true,
  });

  const pairInfo: Record<string, PairInfo> = {};
  const pairObject: Record<string, string[]> = {};

  pairs.forEach((pair: string, index: number) => {
    const token0 = token0s[index];
    const token1 = token1s[index];
    const rawFee = rawFees[index];
    const gauge = gauges[index];

    if (!token0 || !token1 || rawFee === null || rawFee === undefined || !gauge) return;

    const pairId = pair.toLowerCase();

    pairInfo[pairId] = {
      token0,
      token1,
      rawFee: toBN(rawFee, `${pairId} fee`),
      isStaked: gauge.toLowerCase() !== ZERO_ADDRESS,
    };
    pairObject[pair] = [token0, token1];
  });

  const filteredPairs = await filterPools({
    api,
    pairs: pairObject,
    createBalances,
  });

  const validPairs = Object.keys(filteredPairs);

  if (validPairs.length === 0) {
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
    };
  }

  function allocateFees(token: string, fee: BigNumber, isStaked: boolean): void {
    if (fee.isZero()) return;

    const feeAmount = fee.toFixed(0);

    dailyUserFees.add(token, feeAmount, METRIC.SWAP_FEES);

    if (!isStaked) {
      dailySupplySideRevenue.add(token, feeAmount, METRIC.LP_REVENUE);
      return;
    }

    const { protocolFee, holdersFee } = splitStakedFee(fee);

    if (!protocolFee.isZero()) {
      const protocolFeeAmount = protocolFee.toFixed(0);

      dailyProtocolRevenue.add(token, protocolFeeAmount, METRIC.PROTOCOL_REVENUE);

      dailyRevenue.add(token, protocolFeeAmount, METRIC.PROTOCOL_REVENUE);
    }

    if (!holdersFee.isZero()) {
      const holdersFeeAmount = holdersFee.toFixed(0);

      dailyHoldersRevenue.add(token, holdersFeeAmount, METRIC.HOLDERS_REVENUE);

      dailyRevenue.add(token, holdersFeeAmount, METRIC.HOLDERS_REVENUE);
    }
  }

  const swapLogsByPair = await getLogs({
    targets: validPairs,
    eventAbi: SWAP_EVENT,
    flatten: false,
  });

  swapLogsByPair.forEach((logs: SwapLog[], pairIndex: number) => {
    const pairAddress = validPairs[pairIndex];

    if (!pairAddress) return;

    const pairId = pairAddress.toLowerCase();
    const info = pairInfo[pairId];

    if (!info) return;

    const feeMultiplier = info.rawFee.dividedBy(FEE_DENOMINATOR).toNumber();

    for (const log of logs) {
      addOneToken({ chain, balances: dailyVolume, token0: info.token0, token1: info.token1, amount0: log.amount0In, amount1: log.amount1In, });

      const fee = addOneToken({ chain, balances: dailyFees, token0: info.token0, token1: info.token1, amount0: Number(log.amount0In) * feeMultiplier, amount1: Number(log.amount1In) * feeMultiplier, label: METRIC.SWAP_FEES });

      if (!fee?.amount) continue;

      allocateFees(fee.token, new BigNumber(fee.amount).integerValue(BigNumber.ROUND_FLOOR), info.isStaked);
    }
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Swap volume from SwapHood V2 pairs on Robinhood Chain. Pairs are TVL-filtered before their Swap logs are queried.",
  Fees: "Total SwapHood V2 trading fees paid by users. The adapter reads getFee() independently from every pair and divides it by the Pair contract's 10,000 fee denominator.",
  UserFees: "All trading fees paid directly by SwapHood V2 users. Fees are calculated from each swap's input amount using that pair's own on-chain fee.",
  Revenue: "For pairs registered in the SwapHood V2 MasterChef, 100% of swap fees is protocol revenue: 95% is distributed to holders and 5% is retained by the protocol. Fees from non-staked pairs go entirely to liquidity providers.",
  ProtocolRevenue: "5% of swap fees from pairs registered in the SwapHood V2 MasterChef is retained by the protocol.",
  HoldersRevenue: "95% of swap fees from pairs registered in the SwapHood V2 MasterChef is distributed to holders.",
  SupplySideRevenue: "100% of swap fees from pairs not registered in the SwapHood V2 MasterChef goes to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees calculated from the effective on-chain fee configured on each SwapHood V2 pair.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Trading fees paid directly by SwapHood V2 users.",
  },
  Revenue: {
    [METRIC.PROTOCOL_REVENUE]: "5% of trading fees from staked SwapHood V2 pairs retained by the protocol.",
    [METRIC.HOLDERS_REVENUE]: "95% of trading fees from staked SwapHood V2 pairs distributed to holders.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_REVENUE]: "5% of trading fees from staked SwapHood V2 pairs retained by the protocol.",
  },
  HoldersRevenue: {
    [METRIC.HOLDERS_REVENUE]: "95% of trading fees from staked SwapHood V2 pairs distributed to holders.",
  },
  SupplySideRevenue: {
    [METRIC.LP_REVENUE]: "100% of trading fees from non-staked SwapHood V2 pairs distributed to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
