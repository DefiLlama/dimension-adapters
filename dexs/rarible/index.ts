import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { getDuneTrades, decodeMatchOrders, decodeDirectPurchase, decodeDirectAcceptBid, MATCH_ORDERS_ID, DIRECT_PURCHASE_ID } from "./helper";

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
  }

  for (const row of rows) {
    const input: string = row.input;
    const selector = input.slice(0, 10);

    let decoded;
    if (selector === MATCH_ORDERS_ID) {
      decoded = decodeMatchOrders(input);
    } else if (selector === DIRECT_PURCHASE_ID) {
      decoded = decodeDirectPurchase(input);
    } else {
      // directAcceptBid
      decoded = decodeDirectAcceptBid(input);
    }
    const { paymentToken, amount } = decoded;
    if (paymentToken === ADDRESSES.null) {
      dailyVolume.addGasToken(amount);
    } else {
      dailyVolume.add(paymentToken, amount);
    }
  };

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
};

export default adapter;
