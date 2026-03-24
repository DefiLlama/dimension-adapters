import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

async function fetch(options: FetchOptions) {
  const dailyPremiumVolume = options.createBalances();

  const balancesUpdatedLogs = await options.getLogs({
    target: '0x4a20d341315b8eaD4E5eBEcC65D95080A47A7316',
    topic: '0x82ff707295ce8094ca457ec9a2833fa83035efca377c5652ea7ab3aea45a7a52',
    eventAbi: 'event BalancesUpdated(address[] clients, address[] tokens, int256[] amounts, uint64 indexed backendId)',
    entireLog: true,
    parseLog: true,
  });

  balancesUpdatedLogs.forEach(log => {
    const tokens = log.args.tokens as string[];
    const amounts = log.args.amounts as bigint[];

    for (let i = 0; i < tokens.length; i++) {
      const amount = amounts[i];
      const absAmount = amount < 0n ? -amount : amount;

      dailyPremiumVolume.add(tokens[i], absAmount);
    }
  });

  return { dailyPremiumVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-04-15',
};

export default adapter;
