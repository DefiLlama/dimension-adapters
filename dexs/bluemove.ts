import fetchURL from "../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { queryEvents } from "../helpers/sui";

const historicalVolumeEndpoint = "https://aptos-mainnet-api.bluemove.net/api/histogram";

const SUI_PACKAGE = "0xb24b6789e088b876afabca733bed2299fbc9e2d6369be4d1acfa17d8145454d9";

interface IVolumeall {
  num: string;
  date: string;
}

const fetchAptos = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.list;

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === dayTimestamp)?.num
  return {
    dailyVolume: dailyVolume,
  };
};

const fetchSui = async (_timestamp: number, _: any, options: FetchOptions) => {
  const events = await queryEvents({
    eventModule: { package: SUI_PACKAGE, module: "swap" },
    options,
  });

  const swapEvents = events.filter((e: any) => e.amount_x_in !== undefined);

  const dailyVolume = options.createBalances();

  for (const e of swapEvents) {
    const amountXIn = BigInt(e.amount_x_in ?? 0);
    const amountYIn = BigInt(e.amount_y_in ?? 0);

    if (amountXIn > 0) {
      const token = e.token_x_in.startsWith("0x") ? e.token_x_in : "0x" + e.token_x_in;
      dailyVolume.add(token, amountXIn);
    } else if (amountYIn > 0) {
      const token = e.token_y_in.startsWith("0x") ? e.token_y_in : "0x" + e.token_y_in;
      dailyVolume.add(token, amountYIn);
    }
  }

  return {
    dailyVolume,
    timestamp: options.startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: '2022-10-20',
      deadFrom: '2024-03-01',
    },
    [CHAIN.SUI]: {
      fetch: fetchSui,
      start: '2024-03-01',
    },
  },
  version: 1
};

export default adapter;
