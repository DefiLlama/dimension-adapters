import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const YIELD_SHARING_ABI = {
  performanceFee: "uint256:performanceFee",
  safetyBufferSize: "uint256:safetyBufferSize",
  receiptToken: "address:receiptToken",
  YieldAccrued: "event YieldAccrued(uint256 indexed timestamp, int256 yield)",
};

const YIELD_SHARING_CONTRACT = '0x1cb9ed33924741f500e739e38c3215a76cd1f579'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const performanceFeeRaw = await options.api.call({
    target: YIELD_SHARING_CONTRACT,
    abi: YIELD_SHARING_ABI.performanceFee,
  });

  const yieldAccuredLogs = await options.getLogs({
    target: YIELD_SHARING_CONTRACT,
    eventAbi: YIELD_SHARING_ABI.YieldAccrued,
    onlyArgs: true,
  });

  const receiptToken = await options.api.call({
    target: YIELD_SHARING_CONTRACT,
    abi: YIELD_SHARING_ABI.receiptToken,
  });

  yieldAccuredLogs.forEach(log => {
    const currentYield = Number(log.yield);
    const performanceFee = (currentYield > 0) ? currentYield * performanceFeeRaw / 1e18 : 0;
    const yieldsPostFee = currentYield - performanceFee;

    dailyFees.add(receiptToken, performanceFee, METRIC.PERFORMANCE_FEES);
    dailyRevenue.add(receiptToken, performanceFee, METRIC.PERFORMANCE_FEES);

    dailyFees.add(receiptToken, yieldsPostFee, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(receiptToken, yieldsPostFee, METRIC.ASSETS_YIELDS);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Includes yields on assets and all other fees charged by InfiniFi, including performance fees on YieldAccrued . Performance fees are calculated using the on-chain performanceFee parameter and sent to the performanceFeeRecipient.",

  Revenue:
    "Protocol revenue consists of performance fees collected by the protocol and sent to the performanceFeeRecipient address.",

  ProtocolRevenue:
    "Same as Revenue. Performance fees collected by the protocol and sent to the performanceFeeRecipient address.",

  SupplySideRevenue:
    "Net yield distributed to users after peformance fees deduction. Includes yield distributed to siUSD holders (liquid) and iUSD lockers (illiquid)",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Net yield distributed to users after protocol-owned value is deducted. Includes yield distributed to siUSD holders (staking/liquid) and iUSD lockers (locking/illiquid).",
    [METRIC.PERFORMANCE_FEES]: "Performance fees charged by InfiniFi on generated yield. Calculated as a percentage of positive YieldAccrued events using the on-chain performanceFee parameter (max 20%).",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol and sent to the performanceFeeRecipient address.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Performance fees collected by the protocol and sent to the performanceFeeRecipient address.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yield distributed to siUSD holders (staking/liquid) and iUSD lockers (locking/illiquid).",
  },
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-06-07",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
