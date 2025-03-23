import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, targets: [ 'CPixcsP8LEMeUoavaHG3bdkywR8s4mZXNN3mYUgbXFev', '8dEe5BM7irAnHtJ6SSWwCRf7njgnyczS3jPrvJJs88U5']})
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true
};

export default adapter;
