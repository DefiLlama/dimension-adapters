import { Adapter, FetchResult, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPrices } from "../utils/prices";
import { adapterBitqueryFeesEthereumNetwork, ITx } from "../helpers/bitqueryFees";

const startTime = 1577836800;

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const form = new Date(startTime * 1000).toISOString().split('T')[0];
  const till = new Date(timestamp * 1000).toISOString().split('T')[0];
  const result: ITx[] = await adapterBitqueryFeesEthereumNetwork(form, till, "klaytn");
  const totalFees = result.filter((a: ITx) => new Date(a.date.date).getTime() <= new Date(till).getTime()).reduce((a: number, b: ITx)=> a + b.gasValue, 0);
  const dailyFees = result.find((a: ITx) => new Date(a.date.date).getTime() == new Date(till).getTime())?.gasValue
  const price_id = 'coingecko:klay-token'
  const price = (await getPrices([price_id], timestamp))[price_id].price;
  const dailyFeesUsd = (dailyFees || 0) * price
  const totalFeesUsd = totalFees * price;
  return {
    timestamp,
    totalFees: totalFeesUsd.toString(),
    dailyFees: dailyFeesUsd.toString()
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
        fetch: fetch,
        start: async ()  => 1577836800,
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
