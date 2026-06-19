import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import { httpGet } from "../../utils/fetchURL"
import { Agent } from "https"

const agent = new Agent({ family: 4 });

const fetch = async (): Promise<FetchResultV2> => {
  const response = await httpGet(`https://api2.byreal.io/byreal/api/dex/v2/overview/global`, { httpsAgent: agent })
  const data = response.result.data

  // Every Byreal CLMM AmmConfig sets protocol_fee_rate = 200000 (20% of swap
  // fees) on-chain, with fund_fee_rate = 0; the remaining 80% goes to LPs.
  return {
    dailyVolume: data.volumeUsd24h,
    dailyFees: data.feeUsd24h,
    dailyUserFees: data.feeUsd24h,
    dailyRevenue: data.feeUsd24h * 0.2,
    dailyProtocolRevenue: data.feeUsd24h * 0.2,
    dailySupplySideRevenue: data.feeUsd24h * 0.8,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2025-06-27',
    },
  },
  methodology: {
    Volume: 'Total token swap volumes retrieved from Byreal API.',
    Fees: 'All fees from token swaps.',
    UserFees: 'Users pay fees on every token swap.',
    Revenue: 'Amount of 20% swap fees taken as protocol fee (AmmConfig protocol_fee_rate).',
    ProtocolRevenue: 'Amount of 20% swap fees taken as protocol fee (AmmConfig protocol_fee_rate).',
    SupplySideRevenue: 'Amount of 80% swap fees distributed to LPs.',
  }
};

export default adapter;
