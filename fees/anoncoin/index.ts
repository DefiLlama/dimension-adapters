import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const PARTNER_FEE_CLAIMER = 'BKPxAdgwPHXE3ZPZt5XsAovDgUaUufHgZnSAZ3eRWQNW';

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: PARTNER_FEE_CLAIMER,
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: { fetch },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    ProtocolRevenue: "Partner trading fees (SOL) claimed by Anoncoin from Meteora bonding curve and DAMM V2 pools.",
  },
};

export default adapter;
