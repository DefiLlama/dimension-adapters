import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: ['CPixcsP8LEMeUoavaHG3bdkywR8s4mZXNN3mYUgbXFev', '8dEe5BM7irAnHtJ6SSWwCRf7njgnyczS3jPrvJJs88U5'] })
  return { dailyFees, dailyRevenue: dailyFees, protocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All trading fees paid by users while using bot.",
    Revenue: "Trading fees are collected by protocol.",
    ProtocolRevenue: "Trading fees are collected by protocol.",
  }
};

export default adapter;
