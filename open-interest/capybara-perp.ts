import request, { gql } from 'graphql-request';
import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const ENDPOINTS: { [key: string]: string } = {
  [CHAIN.KLAYTN]: 'https://perp.capybara.exchange/api/subgraph?chainId=8217',
};

const getOpenInterest = gql`
  query FetchMarketData { market(id: \"1\") {
      OpenInterestLong
      OpenInterestShort
    }
  }
`

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();

  const { market } = await request(ENDPOINTS[options.chain], getOpenInterest);
  longOpenInterestAtEnd.addCGToken("lair-staked-kaia", +market.OpenInterestLong / 1e18);
  shortOpenInterestAtEnd.addCGToken("lair-staked-kaia", +market.OpenInterestShort / 1e18);

  const openInterestAtEnd = longOpenInterestAtEnd.clone();
  openInterestAtEnd.add(shortOpenInterestAtEnd);

  return {
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
    openInterestAtEnd,
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.KLAYTN],
  fetch,
  start: '2024-09-29',
  runAtCurrTime: true,
};

export default adapter;
