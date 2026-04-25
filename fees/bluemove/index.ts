import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { queryEventsByModule } from "../../helpers/sui";
import { METRIC } from "../../helpers/metrics";

const APTOS_VOLUME_ENDPOINT = "https://aptos-mainnet-api.bluemove.net/api/histogram";

const SUI_PACKAGE = "0xb24b6789e088b876afabca733bed2299fbc9e2d6369be4d1acfa17d8145454d9";
const SUI_FEE_RATE = 0.003;
const SUI_PROTOCOL_FEE_RATE = 0;
const SUI_SUPPLY_SIDE_FEE_RATE = SUI_FEE_RATE - SUI_PROTOCOL_FEE_RATE;

interface IVolumeall {
  num: string;
  date: string;
}

const fetchAptos = async (timestamp: number) => {
  // Aptos volume endpoint is dead, returning 0 
  // to not block the rest of the adapter
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  return {
    dailyFees: 0,
    timestamp: dayTimestamp,
  }
  const historicalVolume: IVolumeall[] = (await fetchURL(APTOS_VOLUME_ENDPOINT))?.data.list;
  
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === dayTimestamp)?.num
  const rateFees = 0.02;
  const dailyFees = Number(dailyVolume) * rateFees;

  return {
    dailyFees,
    timestamp: dayTimestamp,
  };
};

const fetchSui = async (_timestamp: number, _: any, options: FetchOptions) => {
  const events = await queryEventsByModule({
    package: SUI_PACKAGE,
    module: "swap",
    options,
  });

  const swapEvents = events.filter((e: any) => e.amount_x_in !== undefined);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const e of swapEvents) {
    const amountXIn = Number(e.amount_x_in);
    const amountYIn = Number(e.amount_y_in);

    if (amountXIn > 0) {
      const token = e.token_x_in.startsWith("0x") ? e.token_x_in : "0x" + e.token_x_in;
      dailyVolume.add(token, amountXIn);
      dailyFees.add(token, Math.floor(amountXIn * SUI_FEE_RATE), METRIC.SWAP_FEES);
      dailyRevenue.add(token, Math.floor(amountXIn * SUI_PROTOCOL_FEE_RATE), METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(token, Math.floor(amountXIn * SUI_SUPPLY_SIDE_FEE_RATE), METRIC.LP_FEES);
    } else if (amountYIn > 0) {
      const token = e.token_y_in.startsWith("0x") ? e.token_y_in : "0x" + e.token_y_in;
      dailyVolume.add(token, amountYIn);
      dailyFees.add(token, Math.floor(amountYIn * SUI_FEE_RATE), METRIC.SWAP_FEES);
      dailyRevenue.add(token, Math.floor(amountYIn * SUI_PROTOCOL_FEE_RATE), METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(token, Math.floor(amountYIn * SUI_SUPPLY_SIDE_FEE_RATE), METRIC.LP_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    timestamp: options.startOfDay,
  };
};

const methodology = {
  Fees: "All swap fees paid by traders (0.3% per trade).",
  Revenue: "Protocol doesn't keep any fees.",
  SupplySideRevenue: "All swap fees paid by traders (0.3% per trade).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on each trade.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol doesn't keep any fees.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "LP share of swap fees for providing liquidity.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: '2022-10-20',
      deadFrom: '2024-03-18',
    },
    [CHAIN.SUI]: {
      fetch: fetchSui,
      start: '2024-03-01',
    },
  },
};

export default adapter;
