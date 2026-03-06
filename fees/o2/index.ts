import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type FeeResult = {
  base_asset_id?: string;
  base_fees?: string | number;
  quote_asset_id?: string;
  quote_fees?: string | number;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const url = `https://api.o2.app/defillama/v1/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const feeResults = await fetchURL(url);

  if (!Array.isArray(feeResults)) {
    throw new Error("Unexpected response from O2 fees API: expected an array");
  }

  feeResults.forEach((row: FeeResult) => {
    if (row.base_asset_id && row.base_fees && row.base_fees !== "0") {
      dailyFees.add(row.base_asset_id, row.base_fees);
    }
    if (row.quote_asset_id && row.quote_fees && row.quote_fees !== "0") {
      dailyFees.add(row.quote_asset_id, row.quote_fees);
    }
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All fees paid by users on the O2 Exchange",
  Revenue: "Fees are distributed to Fuel Labs",
  ProtocolRevenue: "Fees are distributed to Fuel Labs",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.FUEL],
  start: "2025-12-01",
  methodology,
};

export default adapter;
