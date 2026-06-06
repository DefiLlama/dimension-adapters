import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const volumeEndpoint = "https://9senbezsz3.execute-api.us-east-1.amazonaws.com/Prod/get-global-volume";

async function fetch(options: FetchOptions) {
    const from = options.toTimestamp - ONE_DAY_IN_SECONDS;
    const to = options.toTimestamp;
    const response = await httpGet(volumeEndpoint, {
        headers: { 'X-Api-Key': 'lty8FkZLKR87IA5g7uFEY6uH8MIk8mJT4OehR8hF' },
        params: { start_timestamp: from, end_timestamp: to }
    });

    return {
        dailyVolume: response.volume_in_quote_units,}
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2023-02-27',
}

export default adapter;
