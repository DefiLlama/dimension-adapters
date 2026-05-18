import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const YIELD_SHARING_ABI = {
  performanceFee: "uint256:performanceFee",
  balanceOf: "erc20:balanceOf",
  receiptToken: "address:receiptToken",
  YieldAccrued: "event YieldAccrued(uint256 indexed timestamp, int256 yield)",
};

const YIELD_SHARING_V2 = "0x1cb9ed33924741f500e739e38c3215a76cd1f579";
const YIELD_SHARING_V3 = "0x90e91f5bfd9a0a4d925bf30b512add8cd2bbae3b";
const V3_START_TIMESTAMP = 1776170387 //"2026-04-14";
const WAD = 10n ** 18n;
const ONE_HOUR_IN_SECONDS = 60 * 60;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const useNewYieldSharingContract = options.startTimestamp >= V3_START_TIMESTAMP;
  const YIELD_SHARING_CONTRACT = useNewYieldSharingContract ? YIELD_SHARING_V3 : YIELD_SHARING_V2;

  const [performanceFeeRaw, receiptToken] = await options.api.batchCall([
    { target: YIELD_SHARING_CONTRACT, abi: YIELD_SHARING_ABI.performanceFee },
    { target: YIELD_SHARING_CONTRACT, abi: YIELD_SHARING_ABI.receiptToken },
  ]);
  const receiptTokenAddress = String(receiptToken);

  const [safetyBufferAtStartRaw, safetyBufferAtEndRaw] = await Promise.all([
    options.fromApi.call({
      target: receiptTokenAddress,
      abi: YIELD_SHARING_ABI.balanceOf,
      params: [YIELD_SHARING_CONTRACT],
    }),
    options.toApi.call({
      target: receiptTokenAddress,
      abi: YIELD_SHARING_ABI.balanceOf,
      params: [YIELD_SHARING_CONTRACT],
    }),
  ]);

  const yieldAccruedLogs = await options.getLogs({
    target: YIELD_SHARING_CONTRACT,
    eventAbi: YIELD_SHARING_ABI.YieldAccrued,
    onlyArgs: true,
  });

  let grossYieldNetOfProtocolFee = 0n;
  let protocolFeesCollected = 0n;
  let positiveAccrued = 0n;
  let negativeAccrued = 0n;

  for (const log of yieldAccruedLogs) {
    const eventYield = BigInt(log.yield);

    if (eventYield <= 0n) {
      grossYieldNetOfProtocolFee += eventYield;
      negativeAccrued += -eventYield;
      continue;
    }

    const eventFee = (eventYield * BigInt(performanceFeeRaw)) / WAD;
    protocolFeesCollected += eventFee;
    grossYieldNetOfProtocolFee += eventYield - eventFee;
    positiveAccrued += eventYield;
  }

  const rawSafetyBufferNetChange = BigInt(safetyBufferAtEndRaw) - BigInt(safetyBufferAtStartRaw);
  let safetyBufferNetChange =
    rawSafetyBufferNetChange >= 0n
      ? (rawSafetyBufferNetChange > positiveAccrued ? positiveAccrued : rawSafetyBufferNetChange)
      : (-rawSafetyBufferNetChange > negativeAccrued ? -negativeAccrued : rawSafetyBufferNetChange);
  
  //migration from v2 to v3
  if(options.startTimestamp >= V3_START_TIMESTAMP && options.endTimestamp < V3_START_TIMESTAMP + ONE_HOUR_IN_SECONDS) {
    safetyBufferNetChange = 0n;
  }
  
  const netUserYield = grossYieldNetOfProtocolFee - safetyBufferNetChange;

  dailyFees.add(receiptTokenAddress, protocolFeesCollected, METRIC.PERFORMANCE_FEES);
  dailyFees.add(receiptTokenAddress, safetyBufferNetChange, "Safety Buffer For Losses");
  dailyFees.add(receiptTokenAddress, netUserYield, METRIC.STAKING_REWARDS);
  dailyRevenue.add(receiptTokenAddress, protocolFeesCollected, METRIC.PERFORMANCE_FEES);
  dailySupplySideRevenue.add(receiptTokenAddress, netUserYield, METRIC.STAKING_REWARDS);
  dailySupplySideRevenue.add(receiptTokenAddress, safetyBufferNetChange, "Safety Buffer For Losses");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Includes performance fees from profit events, safety-buffer movement, and then the final user yield or loss.",
  Revenue: "Protocol revenue is only the performance fees.",
  ProtocolRevenue: "Protocol revenue is only the performance fees.",
  SupplySideRevenue: "User yield or loss after protocol fees and safety-buffer movement.",
};


const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]:
      "User yield after protocol fees and safety-buffer change for the period.",
    [METRIC.PERFORMANCE_FEES]:
      "Protocol cut from positive YieldAccrued events.",
    ["Safety Buffer For Losses"]:
      "Change in the safety buffer reserve held by the contract.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]:
      "Final user yield or loss after fees and safety-buffer movement.",
    ["Safety Buffer For Losses"]:
      "Safety-buffer increase helps absorb losses; decrease means buffer is released back.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: "2025-06-07",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
