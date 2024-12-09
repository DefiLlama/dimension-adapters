import {SimpleAdapter} from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {GraphQLClient} from "graphql-request";
import {view} from "../helpers/aptops";
import {getPrices} from "../utils/prices";

const VERSION_GROUPING = BigInt(1000000)

// If I can get this timestampQuery to work... everything will work seamlessly
async function timestampToVersion(timestamp: number, start_version: bigint = BigInt(1962588495), end_version: bigint = BigInt(1962588495) + VERSION_GROUPING): Promise<string> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let closestTransactions = await findClosestTransaction(timestamp, start_version, end_version)
        if (closestTransactions.length < 1) {
            start_version += VERSION_GROUPING
            end_version += VERSION_GROUPING
        } else {
            return closestTransactions[0].version
        }
    }
}

const graphQLClient = new GraphQLClient("https://api.mainnet.aptoslabs.com/v1/graphql")
const timestampQuery = `query TimestampToVersion($timestamp: timestamp, $start_version: bigint, $end_version: bigint) {
block_metadata_transactions(
  where: {timestamp: {_gte: $timestamp }, version: {_gte: $start_version, _lte: $end_version}}
  limit: 1
  order_by: {version: asc}
) {
    timestamp
    version
  }
}`;

async function findClosestTransaction(timestamp: number, start_version: bigint, end_version: bigint): Promise<{
    version: string
}[]> {
    let date = new Date(timestamp * 1000).toISOString()

    const results = await graphQLClient.request(
        timestampQuery,
        {
            timestamp: date,
            start_version: start_version.toString(),
            end_version: end_version.toString(),
        }
    )

    return results.block_metadata_transactions as { version: string }[]
}


async function registryView(version?: bigint): Promise<{
    cumulative_chat_messages: { value: string },
    cumulative_integrator_fees: { value: string },
    cumulative_quote_volume: { value: string },
    cumulative_swaps: { value: string },
    fully_diluted_value: { value: string },
    last_bump_time: string,
    market_cap: { value: string },
    n_markets: string,
    nonce: { value: string },
    registry_address: string,
    total_quote_locked: { value: string },
    total_value_locked: { value: string }
}> {
    const [result] = await view<[{
        cumulative_chat_messages: { value: string },
        cumulative_integrator_fees: { value: string },
        cumulative_quote_volume: { value: string },
        cumulative_swaps: { value: string },
        fully_diluted_value: { value: string },
        last_bump_time: string,
        market_cap: { value: string },
        n_markets: string,
        nonce: { value: string },
        registry_address: string,
        total_quote_locked: { value: string },
        total_value_locked: { value: string }
    }]>(
        "0xface729284ae5729100b3a9ad7f7cc025ea09739cd6e7252aff0beb53619cafe::emojicoin_dot_fun::registry_view",
        [],
        [],
        version);
    return result
}

const ONE_DAY: number = (24 * 60 * 60 * 1000);

const fetch = async (timestamp: number) => {
    // Find the timestamp
    const date = new Date(timestamp * 1000)
    const closestToDate = await timestampToVersion(timestamp)
    const previousDayTimestamp = new Date(date.getTime() - ONE_DAY).getTime() / 1000
    const closestToPreviousDate = await timestampToVersion(previousDayTimestamp)

    const yesterdayRegistry = await registryView(BigInt(closestToPreviousDate))
    const todayRegistry = await registryView(BigInt(closestToDate))

    const prices = await getPrices(["coingecko:aptos"], timestamp)
    const apt_price = prices["coingecko:aptos"].price;

    function parseFees(fees: bigint) {
        return parseInt((BigInt(fees) / BigInt(10 ** 8)).toString(10)) * apt_price
    }

    const totalFees = parseFees(BigInt(todayRegistry.cumulative_integrator_fees.value));
    const dailyFees = parseFees(BigInt(todayRegistry.cumulative_integrator_fees.value) - BigInt(yesterdayRegistry.cumulative_integrator_fees.value));

    return {
        totalFees: `${totalFees}`,
        dailyFees: `${dailyFees}`,
        // TODO: revenue
        timestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.APTOS]: {
            fetch,
            start: '2023-04-03',
        },
    },
};

export default adapter;
