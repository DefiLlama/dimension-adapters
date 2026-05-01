import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

const DANGO_GRAPH_URL = `https://api-mainnet.dango.zone/graphql`

async function fetch(options: FetchOptions) {
    const fromTimestampISO = new Date(options.fromTimestamp * 1000).toISOString();
    const toTimestampISO = new Date(options.toTimestamp * 1000).toISOString();

    const query = `{
        perpsFeesAndRevenue(
          from: "${fromTimestampISO}"
          to:   "${toTimestampISO}"
        ) {
          protocolFee
          vaultFee
          refereeRebate
          referrerPayout
          volumeUsd
        }
      }`

    const response = await httpPost(DANGO_GRAPH_URL, { query });

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyVolume.addUSDValue(Number(response.data.perpsFeesAndRevenue.volumeUsd));

    dailyFees.addUSDValue(Number(response.data.perpsFeesAndRevenue.protocolFee), METRIC.PROTOCOL_FEES);
    dailyRevenue.addUSDValue(Number(response.data.perpsFeesAndRevenue.protocolFee), METRIC.PROTOCOL_FEES);

    dailyFees.addUSDValue(Number(response.data.perpsFeesAndRevenue.vaultFee), "Vault fees");
    dailySupplySideRevenue.addUSDValue(Number(response.data.perpsFeesAndRevenue.vaultFee), "Vault fees");

    dailyFees.addUSDValue(Number(response.data.perpsFeesAndRevenue.refereeRebate), "Referee rebate");
    dailySupplySideRevenue.addUSDValue(Number(response.data.perpsFeesAndRevenue.refereeRebate), "Referee rebate");

    dailyFees.addUSDValue(Number(response.data.perpsFeesAndRevenue.referrerPayout), "Referrer payout");
    dailySupplySideRevenue.addUSDValue(Number(response.data.perpsFeesAndRevenue.referrerPayout), "Referrer payout");

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Volume: "Total notional volume of trades on the Dango protocol.",
    Fees: "Trading fees paid by users.",
    UserFees: "Trading fees paid by users.",
    Revenue: "Part of trading fees retained by the protocol.",
    ProtocolRevenue: "Part of trading fees retained by the protocol.",
    SupplySideRevenue: "Includes trading fees paid to vault liquidity providers, referee rebate, and referrer payout.",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.PROTOCOL_FEES]: "Part of trading fees retained by the protocol.",
        "Vault fees": "Trading fees paid to vault liquidity providers.",
        "Referee rebate": "Trading fees rebate to referees.",
        "Referrer payout": "Commission paid to referrers.",
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "Part of trading fees retained by the protocol.",
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "Part of trading fees retained by the protocol.",
    },
    SupplySideRevenue: {
        "Vault fees": "Trading fees paid to vault liquidity providers.",
        "Referee rebate": "Trading fees rebated to referees.",
        "Referrer payout": "Commission paid to referrers.",
    },
}

const adapter: SimpleAdapter = {
    fetch,
    version: 2,
    pullHourly: true,
    chains: [CHAIN.DANGO],
    start: '2026-04-30',
    methodology,
    breakdownMethodology,
}

export default adapter;