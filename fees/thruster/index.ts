import { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
  Fees: "The USDB distributed to veTHRUST stakers.",
};

export default {
  adapter: {
    [CHAIN.BLAST]: {
      fetch: (async ({ getLogs, createBalances }) => {
        let dailyFees = BigInt(0);
        const logs = await getLogs({
          target: "0xaafa3db42ea9c114c36a2a033e04c8bc0813c65c",
          eventAbi: "event CheckpointToken(uint256 time, uint256 tokens)",
        });
        logs.map((e: any) => {
          dailyFees += e.tokens / BigInt(1e18); // assume USDB price is $1
        });
        return { dailyFees: dailyFees.toString() };
      }) as FetchV2,
      start: 9220025,
      meta: {
        methodology,
      },
    },
  },
  version: 2,
} as Adapter;
