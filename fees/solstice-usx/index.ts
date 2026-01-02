import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTokenSupply } from '../../helpers/solana';
import fetchURL from "../../utils/fetchURL";

const EUSX = '3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC';
const PYTH_EUSX_REDEMPTION_PRICE_API = 'https://insights.pyth.network/historical-prices?symbol=Crypto.EUSX%2FUSX.RR';

const fetch: any = async (_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();

  const response = await fetchURL(`${PYTH_EUSX_REDEMPTION_PRICE_API}&from=${options.fromTimestamp}&to=${options.endTimestamp+1}&resolution=1D&cluster=pythnet`);

  if (!response || response.length !== 2)
    throw new Error("Pyth API returned invalid reposnse");

  const priceYesterday = response[0].price;
  const priceToday = response[1].price;

  const totalSupply = await getTokenSupply(EUSX)
  dailyFees.addUSDValue((priceToday - priceYesterday) * totalSupply);

  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-05',
  allowNegativeValue: true, // Yield strategies aren't risk-free
  methodology: {
    Fees: 'Yield generated from Solstice various strategies',
    Revenue: 'No protocol revenue (yield fully passed to eUSX holders)',
    SupplySideRevenue: 'Total yield accrued through eUSX price appreciation, distributed to holders',
  }
};

export default adapters;
