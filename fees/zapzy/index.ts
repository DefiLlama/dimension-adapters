import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

const fetch = async (_: any, _b: any, { createBalances, dateString, }: FetchOptions) => {
  const dailyFees = createBalances();

  const data = await fetchURL("https://frontend-api-v1.zapzy.io/api/stats/fees");
  const targetDateStr = dateString;

  const currentEntry = data.fees.find((entry: any) => entry.timestamp.slice(0, 10) === targetDateStr);
  if (!currentEntry)
    throw new Error('No data found for the current date');


  const totalFeesLamports = currentEntry.solFees * 1e9;

  dailyFees.add(ADDRESSES.solana.SOL, totalFeesLamports);

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(0.5),
    dailyProtocolRevenue: dailyFees.clone(0.5),
    dailySupplySideRevenue: dailyFees.clone(0.5),
    dailyHoldersRevenue: 0
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    // https://docs.zapzy.io/sections/zapzy/fees-and-rewards#before-bonding-1-25%25
    Fees: "Fees are collected from users and distributed to coin creators and the protocol.",
    Revenue: "50% of fees go to the protocol.",
    SupplySideRevenue: "50% of fees are distributed to coin creators.",
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-08-27',
    }
  }
};

export default adapter;