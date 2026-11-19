import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { ethers } from "ethers";

const swapTopic = "0xa441699ef46589494a7167a03b4dc78a5adfb1dbf33323acd42fbdd30a27c5b0";
const swapEventTypes = ["address", "address", "uint256", "uint256"];

// Each router in docs.kipseli.capital points through swapImpl() to the contract that emits the swap event. The
// older implementations it replaced stay listed for history. wallet() on the Base, BNB Chain and Robinhood contracts
// returns the reserve wallet in DefiLlama-Adapters projects/kipseli; on Ethereum it returns Safe 0xbeeb9eee...
const config: Record<string, { implementations: string[]; start: string; ownRecipients?: string[] }> = {
  [CHAIN.ETHEREUM]: {
    implementations: ["0x054F0377e07d2F460151F935Dffc4D880017E63a"],
    start: "2026-05-12",
  },
  [CHAIN.BASE]: {
    implementations: [
      "0x1dc4a586009dfc09c30749f0dd8e34210cd49184",
      "0x16c31c7bada26242cf5d8f0485d1b2e708c804a1",
      "0xc2Be7B94d5498b1acEb914F3a1dec4Ce502d235F",
    ],
    start: "2026-02-03",
    // These contracts move inventory between Kipseli's Safe 0xbeeb9eee... (wallet() of the Ethereum implementation)
    // and its Base reserve, so both sides of the swap are Kipseli: a rebalance, not a trade.
    ownRecipients: [
      "0x8301b8c7a8f6ac40a471f61fe3d746e3a106c983",
      "0xe55adbd4a21616c4a5936b5c7e99bf43afaeb298",
    ],
  },
  [CHAIN.BSC]: {
    implementations: [
      "0x8a19578b3c19fbfa9fcf4cdda6d94a9bfc2e587c",
      "0xe1202875e2a6859f11ec405be031db217205f8a7",
      "0xca90e422340c8ec0195a94f0a8f1eab448f3bfe3",
    ],
    start: "2026-07-31",
  },
  [CHAIN.ROBINHOOD]: {
    implementations: ["0x0a3da72e01122d789e6652c56bf21dc61bcfc364"],
    start: "2026-07-15",
  },
};

// The output recipient is the sixth word of the event data.
const getRecipient = (data: string) => `0x${data.slice(2 + 5 * 64 + 24, 2 + 6 * 64)}`.toLowerCase();

async function fetch(options: FetchOptions) {
  const { getLogs, createBalances } = options;
  const dailyVolume = createBalances();
  const { implementations, ownRecipients = [] } = config[options.chain];
  const logs = (await Promise.all(implementations.map((target) => getLogs({ target, topics: [swapTopic], entireLog: true })))).flat();
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();

  logs.forEach((log: any) => {
    if (ownRecipients.includes(getRecipient(log.data))) return;
    const [token0, token1, amount0, amount1] = abiCoder.decode(swapEventTypes, log.data);

    addOneToken({
      chain: options.chain,
      balances: dailyVolume,
      token0: token0,
      amount0: amount0,
      token1: token1,
      amount1: amount1
    })
  });
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "Swaps on Kipseli's contracts on each chain, excluding Kipseli's own inventory rebalances between its Safe and its reserve on Base.",
  },
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])),
};

export default adapter;
