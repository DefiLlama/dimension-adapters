import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import { postURL } from "../../utils/fetchURL"


// Fee structure based on Rate-X documentation
const TRADING_FEE_RATE = 0.01; // 1% trading fee
const PROTOCOL_FEE_SHARE = 0.5; // 50% of fees go to protocol
const LP_FEE_SHARE = 0.5; // 50% of fees go to LPs

const fetch = async ({dateString}: FetchOptions): Promise<FetchResultV2> => {
  const response = await postURL('https://api.rate-x.io', {
    serverName: "AdminSvr",
    method: "querySumVolumeSymbolDay",
    content: {
      trade_date: dateString
    }
  });

  const dailyVolume = Number(response.data.trade_u_volume);
  
  // Calculate fees based on volume and fee rate
  const dailyFees = dailyVolume * TRADING_FEE_RATE;
  const dailyProtocolRevenue = dailyFees * PROTOCOL_FEE_SHARE;
  const dailySupplySideRevenue = dailyFees * LP_FEE_SHARE;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Trading fees charged on leveraged yield token trades (1% of trading volume). Additional fees include PT management fees (5% of ST accrued yield), yield position fees (5% of yields generated), and expiry fees (2% annualized on unclaimed tokens after 14 days).",
    Revenue: "50% of trading fees collected as protocol revenue. Protocol also receives PT management fees, yield position fees, and expiry fees.",
    ProtocolRevenue: "50% of trading fees collected as protocol revenue. Protocol also receives PT management fees, yield position fees, and expiry fees.",
    SupplySideRevenue: "50% of trading fees are distributed to LPs.",
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-11-07',
    },
  }
};

export default adapter;