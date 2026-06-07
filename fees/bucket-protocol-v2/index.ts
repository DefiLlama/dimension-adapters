import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const apiURL = "https://backend.bucketprotocol.io/api/fee/dailystatus";

// The protocol retains 1% of collected fees as a reserve balance
// All other fees (99%) are distributed to BKT stakers via the Well mechanism
const PROTOCOL_RESERVE_RATE = 0.01;

const methodology = {
  Fees: "All fees paid by users: borrow, PSM, liquidation, redeem, flash loan, and interest",
  UserFees: "All fees paid by users: borrow, PSM, liquidation, redeem, flash loan, and interest",
  Revenue: "All fees collected; BSR yield is funded by BUCK minting (not fees) so there is no supply-side cost",
  HoldersRevenue: "99% of collected fees distributed to BKT stakers via the Well mechanism",
  ProtocolRevenue: "1% of collected fees retained as Well reserve, withdrawable by protocol admin",
};

const fetch = async ({ startOfDay, dateString }: FetchOptions) => {
  const url = `${apiURL}?timestamp_ms=${startOfDay * 1000}`;
  const stats = (await fetchURL(url)).data;

  if (!stats) throw new Error(`No data found for ${dateString}`);
  if (stats.dailyFee == null) throw new Error(`Missing fee field in API response for ${dateString}`);

  const dailyFees = Number(stats.dailyFee);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees * (1 - PROTOCOL_RESERVE_RATE),
    dailyProtocolRevenue: dailyFees * PROTOCOL_RESERVE_RATE,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  methodology,
  start: "2025-09-01",
};

export default adapter;
