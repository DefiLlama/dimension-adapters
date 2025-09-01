import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (_: any) => {
  const data = await fetchURL("https://lend.api.sui-prod.bluefin.io/api/v1/fees/daily");
  const dailyFees = Number(data.fees || 0);
  const dailyRevenue = Number(data.revenue || 0);
  const dailySupplySideRevenue = Number(dailyFees - dailyRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: '0',
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const methodology = {
  Fees: "All fees paid/earned while using lending/borrowing and liquidation.",
  Revenue: "Fees collected by protocol native markets.",
  ProtocolRevenue: "Fees/liquidation collected by protocol.",
  SupplySideRevenue: "Fees going to lenders.",
  HoldersRevenue: "No holders revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology,
  chains: [CHAIN.SUI],
  start: '2025-06-17',
  runAtCurrTime: true,
};

export default adapter;
