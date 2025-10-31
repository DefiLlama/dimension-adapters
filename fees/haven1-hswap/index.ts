import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const SUBGRAPH = "https://api.haven1.0xgraph.xyz/api/public/bc373e5f-de53-4599-8572-61e112a16f4a/subgraphs/uniswap-v3/main-v0.0.4/";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startOfDay = options.startOfDay;
  const res = await httpPost(SUBGRAPH, {
    query: `query($d:Int!){ poolDayDatas(where: { date: $d }, first: 1000){ feesUSD } }`,
    variables: { d: startOfDay },
  });

  const fees = (res.data.poolDayDatas || [])
    .map((d) => Number(d.feesUSD))
    .filter(Number.isFinite);
  const sum = fees.reduce((a, b) => a + b, 0);

  return {
    dailyFees: sum.toString(),
    dailyUserFees: sum.toString(),
    dailyRevenue: "0",
    dailyProtocolRevenue: "0",
    dailyHoldersRevenue: "0",
    dailySupplySideRevenue: sum.toString(),
  };
};

const methodology = {
  Fees: "Trading fees paid by users on Haven1 HSwap (Uniswap V3 fork)",
  UserFees: "Trading fees paid by users on Haven1 HSwap (Uniswap V3 fork)",
  Revenue: "Protocol takes no direct revenue from trading fees",
  ProtocolRevenue: "Protocol takes no direct revenue from trading fees",
  HoldersRevenue: "Holders have no revenue from trading fees",
  SupplySideRevenue: "All trading fees are distributed to liquidity providers"
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.HAVEN1],
  start: '2025-04-24',
  methodology,
};

export default adapter;
