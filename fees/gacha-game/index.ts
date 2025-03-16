import { getEventLogs } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchOptions } from "../../adapters/types";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const GACHA_SENDER_TOPIC =
  "0x0000000000000000000000003272596F776470D2D7C3f7dfF3dc50888b7D8967";
const GACHA_FEE_WALLET_TOPIC =
  "0x000000000000000000000000999920AC0adB76f96F63D6AaCEbd8B7890Ed09D2";
const FEE_TOKEN = "0x3439153EB7AF838Ad19d56E1571FBD09333C2809";

const fetch = (chain: Chain) => {
  return async (option: FetchOptions) => {
    const { getFromBlock, getToBlock, createBalances } = option;
    const [fromBlock, toBlock] = await Promise.all([
      getFromBlock(),
      getToBlock(),
    ]);
    const amounts = (
      await getEventLogs({
        target: FEE_TOKEN,
        fromBlock: fromBlock,
        toBlock: toBlock,
        topics: [TRANSFER_TOPIC, GACHA_SENDER_TOPIC, GACHA_FEE_WALLET_TOPIC],
        chain: chain,
      })
    ).map((amount) => {
      return BigInt(amount.data).toString();
    });

    let balance = createBalances();

    amounts.forEach((amount) => balance.add(FEE_TOKEN, amount));
    return {
      dailyFees: balance,
      dailyRevenue: balance,
    };
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch: fetch(CHAIN.ABSTRACT),
      start: "2025-02-11",
      meta: {
        methodology:
          "Fetches event logs and calculates daily fees and revenue.",
      },
    },
  },
};

export default adapter;
