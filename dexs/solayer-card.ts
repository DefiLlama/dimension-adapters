import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceivedDune } from "../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = await getSolanaReceivedDune({
    options,
    target: '8eWNJYuALMkMPB24URhg8DYRtxccTUC22xLoTKwnNtUn',
    // mints: [
    //   coreAssets.solana.USDC,
    //   coreAssets.solana.USDT,
    // ],
  })

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  dependencies: [Dependencies.DUNE],
  start: '2025-03-01',
  chains: [CHAIN.SOLANA],
};

export default adapter;