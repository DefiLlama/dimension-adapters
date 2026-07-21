import BigNumber from "bignumber.js";
import {
  FetchOptions,
  FetchResult,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY = "0xE7206Ecac3A51afe7e6179182ad4130A26068dD1";
const MASTERCHEF = "0x734c9ef24AEeb9654Be9A19f6d3991b5D91c587B";
export const START = "2026-07-10";

// SwapHood V2 Pair.sol uses 10,000 as 100%.
const FEE_DENOMINATOR = new BigNumber(10_000);

// Project-confirmed policy: staked-pair fees are split 5% to the protocol and
// 95% to holders. The verified MasterChef/fee-collector deployment is at:
// https://robinhoodchain.blockscout.com/address/0x734c9ef24AEeb9654Be9A19f6d3991b5D91c587B?tab=contract
const PROTOCOL_FEE_PERCENT = new BigNumber(5);
const PERCENT_DENOMINATOR = new BigNumber(100);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const SWAP_EVENT =
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)";

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
};

type PairInfo = {
  token0: string;
  token1: string;
  rawFee: BigNumber;
  isStaked: boolean;
};

function toBN(
  value: NumericValue | null | undefined,
  context: string,
): BigNumber {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${context}`);
  }

  const result = BigNumber.isBigNumber(value)
    ? value
    : new BigNumber(value.toString());

  if (!result.isFinite()) {
    throw new Error(`Invalid ${context}: ${value.toString()}`);
  }

  return result;
}

function calculateFee(
  amountIn: BigNumber,
  rawFee: BigNumber,
): BigNumber {
  return amountIn
    .times(rawFee)
    .div(FEE_DENOMINATOR)
    .integerValue(BigNumber.ROUND_FLOOR);
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

const fetch = async (
  options: FetchOptions,
): Promise<FetchResult> => {
  const {
    api,
    createBalances,
    getLogs,
  } = options;

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
  }) as Array<string | null | undefined>;

  const pairs = pairResults.filter(
    (pair): pair is string =>
      typeof pair === "string" &&
      pair.toLowerCase() !== ZERO_ADDRESS,
  );

  const [token0s, token1s, rawFees, gauges] = await Promise.all([
    api.multiCall({
      abi: ABIS.token0,
      calls: pairs,
      permitFailure: true,
    }) as Promise<Array<string | null | undefined>>,
    api.multiCall({
      abi: ABIS.token1,
      calls: pairs,
      permitFailure: true,
    }) as Promise<Array<string | null | undefined>>,
    api.multiCall({
      abi: ABIS.getFee,
      calls: pairs,
      permitFailure: true,
    }) as Promise<Array<NumericValue | null | undefined>>,
    api.multiCall({
      target: MASTERCHEF,
      abi: ABIS.gauges,
      calls: pairs.map((pair) => ({ params: [pair] })),
      permitFailure: true,
    }) as Promise<Array<string | null | undefined>>,
  ]);

  const pairInfo: Record<string, PairInfo> = {};

  pairs.forEach((pair: string, index: number) => {
    const token0 = token0s[index];
    const token1 = token1s[index];
    const rawFee = rawFees[index];
    const gauge = gauges[index];

    if (
      !token0 ||
      !token1 ||
      rawFee === null ||
      rawFee === undefined ||
      !gauge
    ) return;

    const pairId = pair.toLowerCase();

    pairInfo[pairId] = {
      token0,
      token1,
      rawFee: toBN(rawFee, `${pairId} fee`),
      isStaked: gauge.toLowerCase() !== ZERO_ADDRESS,
    };
  });

  const validPairs = pairs.filter(
    (pair) => pairInfo[pair.toLowerCase()],
  );

  if (validPairs.length === 0) {
    return {
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
      dailySupplySideRevenue,
    };
  }

  function addFeeAllocation(
    token: string,
    fee: BigNumber,
    isStaked: boolean,
  ): void {
    if (fee.isZero()) return;

    const feeAmount = fee.toFixed(0);

    dailyFees.add(token, feeAmount, METRIC.SWAP_FEES);
    dailyUserFees.add(token, feeAmount, METRIC.SWAP_FEES);

    if (!isStaked) {
      dailySupplySideRevenue.add(
        token,
        feeAmount,
        METRIC.LP_REVENUE,
      );
      return;
    }

    const { protocolFee, holdersFee } = splitStakedFee(fee);

    if (!protocolFee.isZero()) {
      const protocolFeeAmount = protocolFee.toFixed(0);

      dailyProtocolRevenue.add(
        token,
        protocolFeeAmount,
        METRIC.PROTOCOL_REVENUE,
      );

      dailyRevenue.add(
        token,
        protocolFeeAmount,
        METRIC.PROTOCOL_REVENUE,
      );
    }

    if (!holdersFee.isZero()) {
      const holdersFeeAmount = holdersFee.toFixed(0);

      dailyHoldersRevenue.add(
        token,
        holdersFeeAmount,
        METRIC.HOLDERS_REVENUE,
      );

      dailyRevenue.add(
        token,
        holdersFeeAmount,
        METRIC.HOLDERS_REVENUE,
      );
    }
  }

  const swapLogsByPair = (await getLogs({
    targets: validPairs,
    eventAbi: SWAP_EVENT,
    flatten: false,
  })) as SwapLog[][];

  swapLogsByPair.forEach(
    (logs: SwapLog[], pairIndex: number) => {
      const pairAddress = validPairs[pairIndex];

      if (!pairAddress) return;

      const pairId = pairAddress.toLowerCase();
      const info = pairInfo[pairId];

      if (!info) return;

      for (const log of logs) {
        const fee0 = calculateFee(
          toBN(log.amount0In, `${pairId} amount0In`),
          info.rawFee,
        );

        const fee1 = calculateFee(
          toBN(log.amount1In, `${pairId} amount1In`),
          info.rawFee,
        );

        addFeeAllocation(info.token0, fee0, info.isStaked);
        addFeeAllocation(info.token1, fee1, info.isStaked);
      }
    },
  );

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Total SwapHood V2 trading fees paid by users. The adapter reads getFee() independently from every pair and divides it by the Pair contract's 10,000 fee denominator.",
  UserFees:
    "All trading fees paid directly by SwapHood V2 users. Fees are calculated from each swap's input amount using that pair's own on-chain fee.",
  Revenue:
    "For pairs registered in the SwapHood V2 MasterChef, 100% of swap fees is protocol revenue: 95% is distributed to holders and 5% is retained by the protocol. Fees from non-staked pairs go entirely to liquidity providers.",
  ProtocolRevenue:
    "5% of swap fees from pairs registered in the SwapHood V2 MasterChef is retained by the protocol.",
  HoldersRevenue:
    "95% of swap fees from pairs registered in the SwapHood V2 MasterChef is distributed to holders.",
  SupplySideRevenue:
    "100% of swap fees from pairs not registered in the SwapHood V2 MasterChef goes to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Trading fees calculated from the effective on-chain fee configured on each SwapHood V2 pair.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]:
      "Trading fees paid directly by SwapHood V2 users.",
  },
  Revenue: {
    [METRIC.PROTOCOL_REVENUE]:
      "5% of trading fees from staked SwapHood V2 pairs retained by the protocol.",
    [METRIC.HOLDERS_REVENUE]:
      "95% of trading fees from staked SwapHood V2 pairs distributed to holders.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_REVENUE]:
      "5% of trading fees from staked SwapHood V2 pairs retained by the protocol.",
  },
  HoldersRevenue: {
    [METRIC.HOLDERS_REVENUE]:
      "95% of trading fees from staked SwapHood V2 pairs distributed to holders.",
  },
  SupplySideRevenue: {
    [METRIC.LP_REVENUE]:
      "100% of trading fees from non-staked SwapHood V2 pairs distributed to liquidity providers.",
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
