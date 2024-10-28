import { time } from 'console';
import { CHAIN } from '../../helpers/chains'
import { postURL } from '../../utils/fetchURL'

const GRAPHQL_ENDPOINT = 'https://api5.storm.tg/graphql';

export default {
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: 1700000000,
            meta: {
                methodology: {
                    DailyVolume: 'Leverage trading volume',
                    DataSource: 'Data prepared by the project team by indexing blockchain data'
                },
            },
            fetch: async (timestamp: number) => {
                const response = (await postURL(GRAPHQL_ENDPOINT, {
                    query: `
                    query VolumeDaily  {
                        marketInfo {
                          exchangedTradeVolume
                        }
                      }
                      `
                }));

                return {
                    dailyVolume: response.data.marketInfo.exchangedTradeVolume / 1e9,
                    timestamp: new Date().getTime() / 1000
                }
            },
        },
    },
}
