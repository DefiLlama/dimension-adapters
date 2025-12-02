import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  try {
    const dateString = new Date(options.startOfDay * 1000).toISOString().slice(0, '2011-10-05'.length);
    const url = `https://explorer.dogechain.dog/api?module=stats&action=totalfees&date=${dateString}`;
    const fees = await httpGet(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (fees && fees.result !== undefined && fees.result !== null) {
      dailyFees.addCGToken('dogecoin', fees.result / 1e18);
    }
  } catch (e) {
    console.log('Error fetching Dogechain fees:', e);
  }
  
  return {
    timestamp: options.startOfDay,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.DOGECHAIN]: {
      fetch,
      start: '2022-08-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
  deadFrom: '2025-12-02', // API blocks programmatic access with 403 Forbidden
};

export default adapter;
