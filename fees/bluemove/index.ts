import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { queryEvents } from "../../helpers/sui";
import { METRIC } from "../../helpers/metrics";

const APTOS_VOLUME_ENDPOINT = "https://aptos-mainnet-api.bluemove.net/api/histogram";

const SUI_PACKAGE = "0xb24b6789e088b876afabca733bed2299fbc9e2d6369be4d1acfa17d8145454d9";
const SUI_FEE_RATE = 0.003; // 0.3%
const SUI_PROTOCOL_FEE_RATE = 0;
const SUI_SUPPLY_SIDE_FEE_RATE = SUI_FEE_RATE - SUI_PROTOCOL_FEE_RATE;

interface IVolumeall {
  num: string;
  date: string;
}

const fetchAptos = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
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
  const events = await queryEvents({
    eventModule: { package: SUI_PACKAGE, module: "swap" },
    options,
  });

  const swapEvents = events.filter((e: any) => e.amount_x_in !== undefined);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const e of swapEvents) {
    const amountXIn = BigInt(e.amount_x_in ?? 0);
    const amountYIn = BigInt(e.amount_y_in ?? 0);

    if (amountXIn > 0) {
      const token = e.token_x_in.startsWith("0x") ? e.token_x_in : "0x" + e.token_x_in;
      const fee = amountXIn * BigInt(Math.floor(SUI_FEE_RATE * 1000)) / 1000n;
      const supplyFee = amountXIn * BigInt(Math.floor(SUI_SUPPLY_SIDE_FEE_RATE * 1000)) / 1000n;
      dailyVolume.add(token, amountXIn);
      dailyFees.add(token, fee, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(token, supplyFee, METRIC.LP_FEES);
    } else if (amountYIn > 0) {
      const token = e.token_y_in.startsWith("0x") ? e.token_y_in : "0x" + e.token_y_in;
      const fee = amountYIn * BigInt(Math.floor(SUI_FEE_RATE * 1000)) / 1000n;
      const supplyFee = amountYIn * BigInt(Math.floor(SUI_SUPPLY_SIDE_FEE_RATE * 1000)) / 1000n;
      dailyVolume.add(token, amountYIn);
      dailyFees.add(token, fee, METRIC.SWAP_FEES);
      dailySupplySideRevenue.add(token, supplyFee, METRIC.LP_FEES);
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    timestamp: options.startOfDay,
  };
};

const methodology = {
  Fees: "All swap fees paid by traders (0.3% per trade).",
  SupplySideRevenue: "All swap fees paid by traders (0.3% per trade).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on each trade.",
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
      deadFrom: '2024-03-01',
    },
    [CHAIN.SUI]: {
      fetch: fetchSui,
      start: '2024-03-01',
    },
  },
};

export default adapter;
