import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchOmnipairSwaps } from "../../helpers/omnipair";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const swaps = await fetchOmnipairSwaps(options);

  for (const swap of swaps) {
    // Omnipair swap volume is counted using the input token amount.
    const tokenKey = swap.tokenInMint;
    dailyVolume.add(tokenKey, swap.amountIn);
  }

  return {
    dailyVolume,
  };
};

const methodology = {
  Volume: "Swap input volume on Omnipair, calculated from amountIn on on-chain SwapEvent logs.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  start: "2026-02-01",
  fetch,
  methodology,
};

export default adapter;