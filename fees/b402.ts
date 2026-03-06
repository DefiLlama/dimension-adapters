import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FEE_COLLECTOR = "0x2dBe91FF25ABd5419435656a7bccD269EC358Ea4";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const addressToTopic = (addr: string) =>
  "0x" + addr.slice(2).toLowerCase().padStart(64, "0");

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
  const dailyFees = createBalances();

  const logs = await getLogs({
    target: USDC,
    eventAbi:
      "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [null as any, null as any, addressToTopic(FEE_COLLECTOR)],
  });

  for (const log of logs) {
    dailyFees.add(USDC, log.value);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Tiered fees on private shielded transactions: $0.05 base + 0.05% (<$1k), 0.08% ($1k-$10k), 0.10% (>$10k). Collected as USDC transfers to fee collector at shield time.",
  UserFees: "All fees are paid by users performing private shielded transactions.",
  Revenue: "100% of fees are protocol revenue.",
  ProtocolRevenue: "B402 receives 100% of collected fees.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-02-20",
    },
  },
  methodology,
};

export default adapter;
