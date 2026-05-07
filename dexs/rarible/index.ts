import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import { PromisePool } from "@supercharge/promise-pool";
import { getDuneTrades, decodeMatchOrders, decodeDirectPurchase, decodeDirectAcceptBid, MATCH_ORDERS_ID, DIRECT_PURCHASE_ID } from "../../helpers/rarible";

const config: Record<string, { exchange: string; start: string }> = {
  [CHAIN.ETHEREUM]: {
    exchange: "0x9757F2d2b135150BBeb65308D4a91804107cd8D6",
    start: "2021-06-12",
  },
  [CHAIN.POLYGON]: {
    exchange: "0x12b3897a36fDB436ddE2788C06Eff0ffD997066e",
    start: "2022-02-21",
  },
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain } = options;
  const { exchange } = config[chain];
  const dailyVolume = createBalances();

  const rows = await getDuneTrades(options, exchange);

  if (!rows.length) {
    return { dailyVolume };
  };

  const { errors } = await PromisePool
    .withConcurrency(20)
    .for(rows)
    .process(async (row: any) => {
      const input: string = row.input;
      const selector = input.slice(0, 10);
      try {
        const { paymentToken, amount } = selector === MATCH_ORDERS_ID ? decodeMatchOrders(input)
          : selector === DIRECT_PURCHASE_ID ? decodeDirectPurchase(input)
          : decodeDirectAcceptBid(input);
        if (paymentToken === ethers.ZeroAddress) {
          dailyVolume.addGasToken(amount);
        } else {
          dailyVolume.add(paymentToken, amount);
        }
      } catch (e: any) { console.error("[dexs/rarible] decode error:", e?.message, "selector:", selector); }
    });

  if (errors.length) {
    errors.forEach(e => console.error("[dexs/rarible] error:", e.message));
  };

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
  isExpensiveAdapter: true,
};

export default adapter;
