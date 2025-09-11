import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const AKASH_FEE_ENDPOINT = "https://console-api.akash.network/v1/graph-data/"

async function fetch(_: any, _1: any, options: FetchOptions) {
    const usdcFeeData = await httpGet(AKASH_FEE_ENDPOINT + 'dailyUUsdcSpent');
    const aktFeeData = await httpGet(AKASH_FEE_ENDPOINT + 'dailyUAktSpent');

    const startOfDayIso = new Date(options.startOfDay * 1000).toISOString();

    const usdcRecord = usdcFeeData.snapshots.find((day: any) => day.date == startOfDayIso);
    const aktRecord = aktFeeData.snapshots.find((day: any) => day.date == startOfDayIso);

    if (!usdcRecord || !usdcRecord.value || !aktRecord || !aktRecord.value) throw new Error(`No data for ${startOfDayIso}`);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const feeInAkt = aktRecord.value / 1e6;
    const feeInUsdc = usdcRecord.value / 1e6;

    dailyFees.addCGToken("akash-network", feeInAkt);
    dailyRevenue.addCGToken("akash-network", feeInAkt * 0.1);

    dailyFees.addCGToken("usd-coin", feeInUsdc);
    dailyRevenue.addCGToken("usd-coin", feeInUsdc * 0.2);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: 0,
        dailyHoldersRevenue: dailyRevenue
    }
}

const methodology = {
    Fees: "Lease fees paid by users to use Akash Network services.",
    Revenue: "A 10% take rate on AKT and 20% on other tokens from the lease fees.",
    ProtocolRevenue: "The protocol does not retain any share of the fees.",
    HoldersRevenue: "All revenue is distributed among AKT stakers.",
};

export default {
    version: 1,
    methodology,
    fetch,
    chains: [CHAIN.AKASH],
    startDate: "2021-03-08"
}