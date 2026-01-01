import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VAULT = "0xE0d3cC7cdDBbFeD0CEdFEB22c6D08e392CD9DA1A";

const fetch = async ({
  api,
  createBalances,
  getFromBlock,
  getToBlock,
}: FetchOptions) => {
  const dailyFees = createBalances();

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  // Only track ManagerClaim events to avoid double counting
  // ManagersClaim emits the same amounts in the same transactions
  const managerClaimTopic = '0x589269304a5775087fef7422dd5076938901ab1fa82e920b6de707864f198e60';

  const managerClaims = await api.getLogs({
    target: VAULT,
    topic: managerClaimTopic,
    fromBlock,
    toBlock,
  });

  for (const log of managerClaims) {
    const token = '0x' + log.data.slice(26, 66);
    const amount = '0x' + log.data.slice(66, 130);
    dailyFees.add(token.toLowerCase(), amount);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees, // Revenue equals fees for this protocol
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1673913600,
    },
  },
};

export default adapter;