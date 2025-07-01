import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import { httpGet } from "../../utils/fetchURL"
import {Agent} from "https"

const agent = new Agent({ family: 4 });

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const response = await httpGet(`https://api2.byreal.io/byreal/api/dex/v1/overview/global?timestamp=${options.startOfDay * 1000}`, { httpsAgent: agent })
  const data = response.result.data

  return {
    dailyVolume: data.volumeUsd24h,
    dailyFees: data.feeUsd24h,
    dailyUserFees: data.feeUsd24h,
    // dailyRevenue: data.feeUsd24h,          // ProtocolRevenue + HoldersRevenue
    // dailyProtocolRevenue: data.feeUsd24h, // Treasury
    // dailyHoldersRevenue: data.feeUsd24h,   // Buybacks
    // dailySupplySideRevenue: data.feeUsd24h, // LPs

    totalVolume: data.volumeAll,
    totalFees: data.feeAll,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2025-06-27',
      meta: {
        methodology: {
          Volume: 'Total token swap volumes retrieved from Byreal API.',
          Fees: 'All fees from token swaps.',
          UserFees: 'User pay fees on very token swaps.',
        }
      }
    },
  },
};

export default adapter;
