// source for fees: https://www.paradex.trade/stats
import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const feesEndpoint = "https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/5913/card/5760?parameters=%5B%5D"

interface IFeesData {
  data: {
    rows: [string, number][];
  }
}

// https://app.paradex.trade/dime/overview
const ASSISTANCE_FUND = "0xe80c1286a424B09fB9FC1d82afedAf9d4CE8e5f6";
const DIME_TOKEN = "0xb32e10022ffbedfe10bc818a1c7e67d9d87e0fa7";
const PARADEX_BRIDGE = "0xe3cbe3a636ab6a754e9e41b12b09d09ce9e53db3";

const fetchParadex = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
  const feesData = await fetchURL(feesEndpoint) as IFeesData
  const timestampStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0] + "T00:00:00Z"
  const dailyFees = feesData.data.rows.find(row => row[0] === timestampStr)?.[1]
  if (!dailyFees) throw new Error('record missing!')

  return {
    dailyFees,
    dailyUserFees: dailyFees
    // As there's no reliable source for dailySupplySideRevenue data, in order to
    // avoid reporting incorrect data we do not return dailyRevenue
  };
};

const fetchEth = async (_: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
  // Buybacks occur continuously but are only withdrawn to L1 on a weekly basis
  // Tokens come straight from the bridge in a single transaction
  // https://etherscan.io/address/0xe80c1286a424B09fB9FC1d82afedAf9d4CE8e5f6#tokentxns
  const buybacks = await addTokensReceived({
    options,
    tokens: [DIME_TOKEN],
    targets: [ASSISTANCE_FUND],
    fromAddressFilter: PARADEX_BRIDGE,
  });

  return {
    dailyHoldersRevenue: buybacks
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch: fetchParadex,
      start: '2023-09-01',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEth,
      start: '2026-03-31',
    }
  },
  methodology: {
		Fees: "Tracks total fees paid by traders on Paradex.",
    HoldersRevenue: "$DIME purchased with net protocol revenue."
	},
  skipBreakdownValidation: true, // skipping breakdown validation as we dont have the revenue breakdown
};

export default adapter; 
