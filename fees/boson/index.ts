import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ProtocolFeeCollectedEvent = "event ProtocolFeeCollected(uint256 indexed exchangeId, address indexed exchangeToken, uint256 amount, address indexed executedBy)";
const protocolFeeCollectedTopic = "0x9399ed37d26489264206ddf87ad81aaa13557b4e56b5443503a2b64a24ec42db";
const protocolDiamondAddress = "0x59A4C19b55193D5a2EAD0065c54af4d516E18Cb5";

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();

  const logs = await options.getLogs({
    target: protocolDiamondAddress,
    topics: [protocolFeeCollectedTopic],
    eventAbi: ProtocolFeeCollectedEvent,
  });

  const collectedByToken: Record<string, bigint> = {};
  for (const log of logs) {
    const token = log.exchangeToken;
    const amount = BigInt(log.amount);
    collectedByToken[token] = (collectedByToken[token] || 0n) + amount;
  }

  for (const [token, amount] of Object.entries(collectedByToken)) {
    dailyFees.add(token, amount);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.POLYGON]: { start: "2022-10-12" },
    [CHAIN.ETHEREUM]: { start: "2023-09-29" },
    [CHAIN.BASE]: { start: "2025-01-31" },
    [CHAIN.ARBITRUM]: { start: "2025-04-01" },
    [CHAIN.OPTIMISM]: { start: "2025-03-10" },
  },
  methodology: {
    Fees: "A fee is charged on every successful trade executed on the Boson Protocol.",
    Revenue: "fee charged goes to protocol.",
    ProtocolRevenue: "fee charged goes to protocol.",
  },
};

export default adapter;
