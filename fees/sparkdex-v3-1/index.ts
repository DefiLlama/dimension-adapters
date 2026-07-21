import { gql, request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { BBB_START } from "../../helpers/sparkdex";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v3-2/latest/gn",
};

interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

const CONTRACT_SPARK_TOKEN = "0x657097cC15fdEc9e383dB8628B57eA4a763F2ba0";
// staked token is xSpark
const CONTRACT_XSPARK = "0xB5Dc569d06be81Eb222a00cEe810c42976981986";

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

  const graphQuery = gql`
    query MyQuery {
      feeStats(where: {timestamp: ${todaysTimestamp}, period: daily}) {
        cumulativeFeeUsd
        feeUsd
        id
      }
    }
  `;

  const graphRes = await request(endpoints[options.chain], graphQuery);
  const feeStats: IFeeStat[] = graphRes.feeStats;

  let dailyFeeUSD = BigInt(0);

  feeStats.forEach((fee) => {
    dailyFeeUSD += BigInt(fee.feeUsd);
  });

  const feesUsd = Number(dailyFeeUSD / 10n ** 18n);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesUsd, METRIC.SWAP_FEES);

  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  let dailySupplySideRevenue;

  if (todaysTimestamp >= BBB_START) {
    // 75% LP / 25% treasury BBB / 0% protocol
    dailySupplySideRevenue = dailyFees.clone(0.75, METRIC.LP_FEES);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.25, METRIC.TOKEN_BUY_BACK);
  } else {
    // Historical: 87.5% LP / 2.5% Foundation / 5% BBB / 5% staking
    dailySupplySideRevenue = dailyFees.clone(0.875, METRIC.LP_FEES);
    dailyProtocolRevenue.addUSDValue(feesUsd * 0.025, METRIC.SWAP_FEES);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.05, METRIC.TOKEN_BUY_BACK);
    dailyHoldersRevenue.addUSDValue(feesUsd * 0.05, METRIC.STAKING_REWARDS);
  }

  // Protocol burns a percentage of SPRK tokens if they get unstaked before redemption period
  const redeemLogs = await options.getLogs({
    target: CONTRACT_XSPARK,
    eventAbi:
      "event FinalizeRedeem(address indexed userAddress, uint256 xSPRKAmount, uint256 sprkAmount)",
  });
  redeemLogs.forEach((log: any) => {
    const burned = BigInt(log.xSPRKAmount) - BigInt(log.sprkAmount);
    if (burned > 0) {
      dailyHoldersRevenue.add(CONTRACT_SPARK_TOKEN, burned, "Early Redemption Penalty");
      dailyFees.add(CONTRACT_SPARK_TOKEN, burned, "Early Redemption Penalty");
    }
  });

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    timestamp: todaysTimestamp,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.FLARE],
  start: "2024-07-02",
  methodology: {
    Fees: "Swap fees paid by platform users + Early Staking redemption penalty burns.",
    Revenue:
      "Before 2026-05-18: 12.5% of swap fees. From 2026-05-18: 25% of swap fees. Plus Early Staking redemption penalty burns.",
    ProtocolRevenue: "Before 2026-05-18: 2.5% of swap fees. From 2026-05-18: 0%.",
    SupplySideRevenue: "Before 2026-05-18: 87.5% of swap fees. From 2026-05-18: 75% of swap fees.",
    HoldersRevenue:
      "Before 2026-05-18: 5% buyback-and-burn + 5% staking rewards. From 2026-05-18: 25% buyback-and-burn. Plus Early Staking redemption penalty burns.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "All swap fees paid by platform users.",
      "Early Redemption Penalty": "Early Staking redemption penalty burns.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "2.5% of swap fees (before 2026-05-18 only).",
      [METRIC.TOKEN_BUY_BACK]: "5% of swap fees before 2026-05-18, 25% from 2026-05-18.",
      [METRIC.STAKING_REWARDS]: "5% of swap fees (before 2026-05-18 only).",
      "Early Redemption Penalty": "Early Staking redemption penalty burns.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "5% of swap fees before 2026-05-18, 25% from 2026-05-18.",
      [METRIC.STAKING_REWARDS]: "5% of swap fees (before 2026-05-18 only).",
      "Early Redemption Penalty": "Early Staking redemption penalty burns.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "87.5% of swap fees before 2026-05-18, 75% from 2026-05-18.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "2.5% of swap fees (before 2026-05-18 only).",
    },
  },
};

export default adapter;
