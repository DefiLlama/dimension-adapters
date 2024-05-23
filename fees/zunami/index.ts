import {CHAIN} from "../../helpers/chains";
import {Chain} from '@defillama/sdk/build/general';
import {ChainBlocks, DISABLED_ADAPTER_KEY, SimpleAdapter} from "../../adapters/types";
import {getBlock} from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import fetchURL from "../../utils/fetchURL";
import disabledAdapter from "../../helpers/disabledAdapter";

const dataEndpoint = (fromTimestamp: number, toTimestamp: number): string => {
    return "https://api.zunami.io/api/v2/zunami/yield?from=" + fromTimestamp + "&to=" + toTimestamp;
};

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const ZUNAMI_ADDRESS = "0x2ffCC661011beC72e1A9524E12060983E74D14ce";
const APS_ADDRESS = "0xCaB49182aAdCd843b037bBF885AD56A3162698Bd";
const FEE_DENOMINATOR = 1000;
const START_TIMESTAMP = 1646956800;

interface YieldData {
    omnipoolYield: number;
    apsYield: number;
    rigidYield: number;
    totalYield: number;
}

type TABI = {
    [k: string]: string;
}
const ABIs: TABI = {
    getManagementFee: "uint256:managementFee"
};

const getData = (chain: Chain) => {
    return async (timestamp: number, _: ChainBlocks) => {
        const from = timestamp - ONE_DAY_IN_SECONDS;
        const to = timestamp;
        const block = await getBlock(from, chain, {});
        const omnipoolManagementFee = Number((
            await sdk.api2.abi.call({
                target: ZUNAMI_ADDRESS,
                chain: chain,
                abi: ABIs.getManagementFee,
                block: block
            })
        )) / FEE_DENOMINATOR
        const apsManagementFee = Number((
            await sdk.api2.abi.call({
                target: APS_ADDRESS,
                chain: chain,
                abi: ABIs.getManagementFee,
                block: block
            })
        )) / FEE_DENOMINATOR

        const dailyData: YieldData = (await fetchURL(dataEndpoint(from, to)));
        const dailyRevenue = (dailyData.omnipoolYield * omnipoolManagementFee)
            + (dailyData.apsYield * apsManagementFee) + dailyData.rigidYield;
        const dailyHoldersRevenue = dailyData.omnipoolYield + dailyData.apsYield;

        const totalData: YieldData = (await fetchURL(dataEndpoint(START_TIMESTAMP, to)))
        const totalRevenue = (totalData.omnipoolYield * omnipoolManagementFee)
            + (totalData.apsYield * apsManagementFee) + totalData.rigidYield
        const totalDailyHoldersRevenue = totalData.omnipoolYield + totalData.apsYield;

        return {
            dailyFees: `${dailyData.totalYield}`,
            totalFees: `${totalData.totalYield}`,
            dailyRevenue: `${dailyRevenue}`,
            totalRevenue: `${totalRevenue}`,
            dailyHoldersRevenue: `${dailyHoldersRevenue}`,
            totalDailyHoldersRevenue: `${totalDailyHoldersRevenue}`,
            timestamp
        }
    }
}

const methodology = {
    Fees: "The protocol's revenue from Omnipools (performance fee) & Yield from Omnipools, Protocol's revenue from " +
        "APS (performance fee) & Yield from APS, Yield from zStables collateral located in the pool.",
    Revenue: "The protocol's revenue from Omnipools (performance fee), Protocol's revenue from APS (performance fee), " +
        "Yield from zStables collateral located in the pool",
    HoldersRevenue: "Yield from Omnipools, Yield from APS.",
}

const adapter: SimpleAdapter = {
    adapter: {
        [DISABLED_ADAPTER_KEY]: disabledAdapter,
        [CHAIN.ETHEREUM]: {
            fetch: getData(CHAIN.ETHEREUM),
            start: START_TIMESTAMP,
            runAtCurrTime: true,
            meta: {methodology}
        },
    }
};

export default adapter;
