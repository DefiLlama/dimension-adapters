import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceivedDune } from "../../helpers/token";

const PARTNER_FEE_CLAIMER = 'BKPxAdgwPHXE3ZPZt5XsAovDgUaUufHgZnSAZ3eRWQNW';
const METEORA_POOL_AUTHORITY = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM';

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceivedDune({
    options,
    fromAddress: METEORA_POOL_AUTHORITY,
    target: PARTNER_FEE_CLAIMER,
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    ProtocolRevenue: "Partner trading fees (SOL) claimed by Anoncoin from Meteora bonding curve and DAMM V2 pools.",
  },
};

export default adapter;