import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const BUYBACK_WALLET = "0x8b4D9e217F7dd65a423ea465E2699eB08b82Ca7d";

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();

  await addTokensReceived({
    balances: dailyRevenue,
    options,
    targets: [BUYBACK_WALLET],
  });

  return {
    dailyFees: dailyRevenue,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-10-01",
  methodology: {
    Fees: "10% performance fee on vault yield earned during rebalances, used for SURF token buybacks.",
    Revenue: "All collected fees are used to buy back SURF tokens.",
    ProtocolRevenue: "Protocol retains no revenue; all fees go to SURF buybacks for token holders.",
    HoldersRevenue: "All revenue is used to buy back SURF tokens, benefiting SURF holders.",
  },
};

export default adapter;
