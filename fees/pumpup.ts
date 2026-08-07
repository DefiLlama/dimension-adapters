import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";
import { getEnv } from "../helpers/env";

// Sui JSON-RPC (suix_getCoinMetadata) is deprecated; migrated to GraphQL Query.coinMetadata.
async function getCoinMetadata(coinType: string) {
  const { data } = await axios.post(getEnv("SUI_GRAPH_RPC"), {
    query: `query ($coinType: String!) { coinMetadata(coinType: $coinType) { decimals symbol } }`,
    variables: { coinType },
  }, { timeout: 60_000 });
  if (data.errors?.length || !data.data?.coinMetadata)
    throw new Error(`Failed to fetch coin metadata for ${coinType}: ${data.errors?.[0]?.message ?? "not found"}`);
  return data.data.coinMetadata;
}

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const feeData = await axios.get(
    `https://rewards.doubleupdata.store/defillama/house-pnl?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`
  );

  for (const tokenType of Object.keys(feeData.data)) {
    const feeInfo = feeData.data[tokenType];

    const coinMetadata = await getCoinMetadata(tokenType);
    const decimals = coinMetadata.decimals;
    dailyFees.addCGToken(
      feeInfo.token_cg_name,
      feeInfo.house_pnl / 10 ** decimals
    );
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchFees,
      start: "2024-06-02",
    },
  },
  allowNegativeValue: true, // House reimbursed fees
  version: 2,
  methodology: {
    Fees: "Trading fees paid by users.",
    Revenue: "All trading fees from users.",
  },
};
export default adapters;
