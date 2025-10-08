import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from "axios";

async function call(
  method: string,
  params: any,
  { withMetadata = false } = {}
) {
  if (!Array.isArray(params)) params = [params];
  const {
    data: { result },
  } = await axios.post("https://fullnode.mainnet.sui.io/", {
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  return withMetadata ? result : result.data;
}

async function getCoinMetadata(coinType: string) {
  const result = await call("suix_getCoinMetadata", [coinType], {
    withMetadata: true,
  });
  return result;
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
