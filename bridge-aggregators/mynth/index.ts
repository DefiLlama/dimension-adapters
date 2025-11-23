import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type Transfer = {
  amount: string;
  from: {
    blockchain: string;
    decimals: number;
    token: string;
  };
  to: {
    blockchain: string;
  };
};

type MynthApiResponse = {
  contents: {
    transfers: Transfer[];
  };
};

const prefetch = async (options: FetchOptions) => {
  const baseUrl = "https://www.mynth.ai/api/liquidity/transfers";
  const end = options.endTimestamp * 1000;
  const fetched: string[] = [];
  const limit = 1000;
  const start = options.startTimestamp * 1000;
  const transfers: Transfer[] = [];

  for (let page = 1; ; page++) {
    const url = `${baseUrl}?start=${start}&end=${end}&limit=${limit}&page=${page}`;
    const response: MynthApiResponse = await fetchURL(url);
    transfers.push(...response.contents.transfers);
    if (response.contents.transfers.length < limit) break;
  }

  for (const transfer of transfers) {
    if (transfer.from.blockchain === transfer.to.blockchain) continue;

    const chain = transfer.from.blockchain;
    const decimals = transfer.from.decimals;
    const token = transfer.from.token;
    const amount = new BigNumber(transfer.amount)
      .shiftedBy(decimals)
      .toFixed(0, BigNumber.ROUND_FLOOR);
    fetched.push(`${chain};${token};${amount}`);
  }

  return Object.fromEntries(fetched.map((v, i) => [i, v]));
};

type PrefetchResults = Awaited<ReturnType<typeof prefetch>>;

const fetch = async (options: FetchOptions) => {
  const fetched = options.preFetchedResults as PrefetchResults;
  const dailyBridgeVolume = options.createBalances();

  for (const value of Object.values(fetched)) {
    const [blockchain, token, amount] = value.split(";");
    if (blockchain !== options.chain) continue;
    dailyBridgeVolume.add(token, amount);
  }

  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [
    CHAIN.BASE,
    CHAIN.CARDANO,
    CHAIN.HYPERLIQUID,
    CHAIN.PLASMA,
    CHAIN.SOLANA,
    CHAIN.SUI,
    CHAIN.TRON,
  ],
  fetch,
  methodology: {
    BridgeVolume:
      "Sum of token amounts bridged via Mynth for the period, per origin chain. We count all cross-chain transfers where origin and receiving chains are different.",
  },
  prefetch,
  start: "2025-06-20",
};

export default adapter;
