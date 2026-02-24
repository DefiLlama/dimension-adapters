import { gql, request } from 'graphql-request';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import ADDRESSES from '../../helpers/coreAssets.json';

const RECORDS = {
    [CHAIN.ETHEREUM]: {
        tokens: {
            '0x5553444300000000000000000000000000000000000000000000000000000000':
                ADDRESSES.ethereum.USDC, // USDC
            '0x5742544300000000000000000000000000000000000000000000000000000000':
                ADDRESSES.ethereum.WBTC, // WBTC
            '0x4554480000000000000000000000000000000000000000000000000000000000':
                ADDRESSES.ethereum.WETH, // WETH
            '0x61786c46494c0000000000000000000000000000000000000000000000000000':
                '0x6A7b717aE5Ed65F85BA25403D5063D368239828e', // axlFIL
            '0x4a50594300000000000000000000000000000000000000000000000000000000':
                '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29', // JPYC Stablecoin
        },
        subgraphEndpoint:
            'https://api.studio.thegraph.com/query/64582/sf-prd-mainnet/version/latest',
    },
    [CHAIN.ARBITRUM]: {
        tokens: {
            '0x5553444300000000000000000000000000000000000000000000000000000000':
                ADDRESSES.arbitrum.USDC_CIRCLE, // USDC
            '0x5742544300000000000000000000000000000000000000000000000000000000':
                ADDRESSES.arbitrum.WBTC, // WBTC
            '0x4554480000000000000000000000000000000000000000000000000000000000':
                ADDRESSES.arbitrum.WETH, // WETH
        },
        subgraphEndpoint:
            'https://api.studio.thegraph.com/query/64582/sf-prd-arbitrum-one/version/latest',
    },
    [CHAIN.FILECOIN]: {
        tokens: {
            '0x46494c0000000000000000000000000000000000000000000000000000000000':
                '0x60E1773636CF5E4A227d9AC24F20fEca034ee25A', // WFIL
            '0x6946494c00000000000000000000000000000000000000000000000000000000':
                '0x690908f7fa93afC040CFbD9fE1dDd2C2668Aa0e0', // iFIL
            '0x777046494c000000000000000000000000000000000000000000000000000000':
                '0x57E3BB9F790185Cfe70Cc2C15Ed5d6B84dCf4aDb', // wpFIL
            '0x5553444643000000000000000000000000000000000000000000000000000000':
                '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045', // USDFC
        },
        subgraphEndpoint:
            'https://api.goldsky.com/api/public/project_cm8i6ca9k24d601wy45zzbsrq/subgraphs/sf-filecoin-mainnet/latest/gn',
    },
};

const fetch = async (options: FetchOptions) => {
    // Get the UTC day start timestamp
    // GraphQL query to get the volume data for that day
    const chain = options.chain as CHAIN;
    const dateStr = new Date(options.startOfDay * 1000)
        .toISOString()
        .split('T')[0];

    const query = gql`
    {
      dailyVolumes(where: { day: "${dateStr}" }) {
        volume
        currency
      }
    }
  `;

    // Make the request to The Graph
    const response = await request(RECORDS[chain].subgraphEndpoint, query);
    const dailyVolumes = response.dailyVolumes;

    const dailyVolume = options.createBalances();

    dailyVolumes.forEach(v => {
        // Assuming volumeUSD needs conversion if not directly usable
        dailyVolume.add(RECORDS[chain].tokens[v.currency], v.volume);
    });

    return {
        dailyVolume,
    };
};

// 🔁 Wrap it in the DeFiLlama adapter structure
const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2023-12-15',
        },
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-01-12',
        },
        [CHAIN.FILECOIN]: {
            fetch,
            start: '2024-06-21',
        },
    },
};

export default adapter;
