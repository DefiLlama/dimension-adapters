import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTokenSupply } from '../../helpers/solana';
import fetchURL from "../../utils/fetchURL";

const EUSX = '3ThdFZQKM6kRyVGLG48kaPg5TRMhYMKY1iCRa9xop1WC';
const PYTH_EUSX_REDEMPTION_PRICE_ID = 'f36e12e65d2969b242fb97d3ebaa32ec55d5794189b64d1a07dc4f41425c9378';
const PYTH_HERMES_PRICE_API = 'https://hermes.pyth.network/v2/updates/price';

const getRedemptionPrice = async (timestamp: number) => {
  const response = await fetchURL(`${PYTH_HERMES_PRICE_API}/${timestamp}?ids%5B%5D=${PYTH_EUSX_REDEMPTION_PRICE_ID}`);
  const pythPrice = response?.parsed?.[0]?.price;
  const price = Number(pythPrice?.price);
  const exponent = Number(pythPrice?.expo);

  if (!Number.isFinite(price) || !Number.isInteger(exponent))
    throw new Error(`Pyth Hermes returned invalid EUSX redemption price for ${timestamp}`);

  return price * 10 ** exponent;
};

const fetch: any = async (_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = options.createBalances();

  const [priceYesterday, priceToday] = await Promise.all([
    getRedemptionPrice(options.fromTimestamp),
    getRedemptionPrice(options.endTimestamp),
  ]);

  const totalSupply = await getTokenSupply(EUSX)
  const dailyYield = (priceToday - priceYesterday) * totalSupply;

  if (!Number.isFinite(dailyYield))
    throw new Error("Pyth API returned invalid EUSX redemption prices");

  dailyFees.addUSDValue(dailyYield);

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
