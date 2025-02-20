import { Adapter, ChainBlocks, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";

const url = 'https://api.mainnet.wingriders.com/graphql';

const query = gql`
query Volume($input: VolumeInput!) {
  volume(input: $input)
}
`

interface IResponse {
    volume: number
}

async function fetchVolume(timestamp: number , _: ChainBlocks, { createBalances }: FetchOptions) {
    const dailyVolume = createBalances()
    const response: IResponse = await request(url, query, {
        input: {
            lastNHours: 24,
            baseCurrency: "ADA"
        }
    });
    dailyVolume.addGasToken(response.volume * 1e6);
    return {
        dailyVolume,
        timestamp
    }
}

export default {
    adapter: {
        [CHAIN.CARDANO]: {
            fetch: fetchVolume,
            runAtCurrTime: true,
                    }
    }
} as Adapter
