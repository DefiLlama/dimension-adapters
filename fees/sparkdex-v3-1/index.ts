import { gql, request } from "graphql-request";
import type { ChainEndpoints, Fetch, FetchOptions, FetchV2 } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {METRIC} from "../../helpers/metrics";
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
const CONTRACT_SPARK_TOKEN = '0x657097cC15fdEc9e383dB8628B57eA4a763F2ba0';
// staked token is xSpark
const CONTRACT_XSPARK = '0xB5Dc569d06be81Eb222a00cEe810c42976981986';

const graphs = (graphUrls: ChainEndpoints) => {
  const fetch: Fetch = async (_t: any, _:any, options: FetchOptions) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay);

    const graphQuery = gql`
    query MyQuery {
      feeStats(where: {timestamp: ${todaysTimestamp}, period: daily}) {
        cumulativeFeeUsd
        feeUsd
        id
      }
    }
  `;

    const graphRes = await request(graphUrls[options.chain], graphQuery);
    const feeStats: IFeeStat[] = graphRes.feeStats;

    let dailyFeeUSD = BigInt(0);

    feeStats.forEach((fee) => {
      dailyFeeUSD += BigInt(fee.feeUsd);
    });

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(dailyFeeUSD / (10n ** 18n));
    const dailySupplySideRevenue = dailyFees.clone(0.875)
    const dailyProtocolRevenue = dailyFees.clone(0.025) // 2.5% treasury
    const dailyHoldersRevenue = dailyFees.clone(0.1) // 5% buyback and burn + 5% for stakers
    const dailyRevenue = options.createBalances();

// Protocol burns a percentage of SPRK tokens if they get unstaked before redemption period, we can track them using FinalizeRedeem event
    const redeemLogs = await options.getLogs({
      target: CONTRACT_XSPARK,
      eventAbi: 'event FinalizeRedeem(address indexed userAddress, uint256 xSPRKAmount, uint256 sprkAmount)',
    });
    redeemLogs.forEach((log: any) => {
      const burned = BigInt(log.xSPRKAmount) - BigInt(log.sprkAmount);
      if (burned > 0) {
        dailyHoldersRevenue.add(CONTRACT_SPARK_TOKEN, burned);
      }
    });

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
  return fetch;
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.FLARE]: {
      fetch: graphs(endpoints),
      start: '2024-07-02',
    },
  },
  methodology: {
    Fees: "Swap fees paid by platform users.",
    Revenue: "Swap Fees collected by SparkDEX Foundation or used for token buybacks or distributed to stakers + Early Staking redemption penalty burns",
    ProtocolRevenue: "Swap Fees share collected by SparkDEX Foundation.",
    SupplySideRevenue: "Swap Fees distributed to Liquidity Providers.",
    HoldersRevenue: "Revenue used for buy back SPRK tokens + Early Staking redemption penalty burns",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'All Swap fees paid by platform users.',
    },
    Revenue: {
      [METRIC.SWAP_FEES]: '12.5% of Swap Fees are considered as revenue',
      'Early Redemption Penalty': 'Early Staking redemption penalty burns.',
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: '5% of Swap Fees are used for token buybacks ',
      [METRIC.STAKING_REWARDS]: '5% of Swap Fees distributed to stakers.',
      'Early Redemption Penalty': 'Early Staking redemption penalty burns.',
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: '87.5% of Swap Fees distributed to Liquidity Providers',
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: '2.5% of Swap Fees share collected by SparkDEX Foundation.',
    },
  },
};

export default adapter;
