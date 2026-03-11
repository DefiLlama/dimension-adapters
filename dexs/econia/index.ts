import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IMarkets {
  market_id: number;
  quote_account_address: number;
  quote_module_name: number;
  quote_struct_name: number;
  tick_size: number;
};

const BASE_URL = "https://aptos-mainnet-econia.nodeinfra.com";


const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dayISO = new Date(dayTimestamp * 1000).toISOString();

  const markets: IMarkets[] = (await fetchURL(`${BASE_URL}/markets?quote_account_address=eq.0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa&quote_module_name=eq.asset&quote_struct_name=eq.USDC`));
  const volumesPerMarket = await Promise.all(
    markets.map(async m =>
      await fetchURL(`${BASE_URL}/rpc/volume_history?market_id=${m.market_id}&time=${dayISO}`)
        .then(res => (
          { daily: res[0].daily / 1000000, total: res[0].total / 1000000 }
        ))
    )
  );

  const volumes = volumesPerMarket.reduce((prev, curr) => {
    return { daily: prev.daily + curr.daily, total: prev.total + curr.total };
  }, {daily: 0, total: 0});

  const feesPerMarket = await Promise.all(
    markets.map(async m =>
      await fetchURL(`${BASE_URL}/rpc/fees?market_id=${m.market_id}&time=${dayISO}`)
        .then(res => (
          { daily: res[0].daily / 1000000, total: res[0].total / 1000000 }
        ))
    )
  );

  const fees = feesPerMarket.reduce((prev, curr) => {
    return { daily: prev.daily + curr.daily, total: prev.total + curr.total };
  }, { daily: 0, total: 0 });

  let res = {
    dailyVolume: `${volumes.daily}`,
    dailyFees: `${fees.daily}`,
  };

  return res;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2023-11-23',
    }
  },
};

export default adapter;
