import { FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const AKASH_FEE_ENDPOINT = "https://console-api.akash.network/v1/graph-data/"
let usdcFeeData: any = null;
let aktFeeData: any = null;

async function fetch(_: any, _1: any, options: FetchOptions) {
  if (!usdcFeeData) usdcFeeData = httpGet(AKASH_FEE_ENDPOINT + 'dailyUUsdcSpent');
  if (!aktFeeData) aktFeeData = httpGet(AKASH_FEE_ENDPOINT + 'dailyUAktSpent');
  usdcFeeData = await usdcFeeData;
  aktFeeData = await aktFeeData;

  const startOfDayIso = new Date(options.startOfDay * 1000).toISOString();

  const usdcRecord = usdcFeeData.snapshots.find((day: any) => day.date == startOfDayIso);
  const aktRecord = aktFeeData.snapshots.find((day: any) => day.date == startOfDayIso);

  if (!usdcRecord || !usdcRecord.value || !aktRecord || !aktRecord.value) throw new Error(`No data for ${startOfDayIso}`);

  const dailyFees = options.createBalances();

  const feeInAkt = aktRecord.value / 1e6;
  const feeInUsdc = usdcRecord.value / 1e6;

  dailyFees.addCGToken("akash-network", feeInAkt);
  dailyFees.addCGToken("usd-coin", feeInUsdc);

  return {
    dailyFees,
    dailyRevenue: 0,
  }
}

const methodology = {
  Fees: "Lease fees paid by users to use Akash Network services.",
};

export default {
  methodology,
  fetch,
  protocolType: ProtocolType.CHAIN,
  chains: [CHAIN.AKASH],
  start: "2021-03-08"
}