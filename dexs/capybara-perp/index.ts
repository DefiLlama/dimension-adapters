import request, { gql } from 'graphql-request';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const ENDPOINTS: { [key: string]: string } = {
  [CHAIN.KLAYTN]: 'https://perp.capybara.exchange/api/subgraph?chainId=8217',
};

const getVolumeAndFee = gql`
  query QueryChartAccumulativeData($dayAgo: BigInt!) {
    marketHourDatas(startTime_gt: $dayAgo, orderBy: startTime, orderDirection: desc) {
      startTime
      totalFee
      tradeVolume
    }
  }
`;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const { startTimestamp, endTimestamp } = options;

  const { marketHourDatas } = await request(ENDPOINTS[options.chain],
    getVolumeAndFee, {
    dayAgo: String(startTimestamp),
  });

  const { fees, volume } = marketHourDatas.filter((data: any) => data.startTime >= startTimestamp && data.startTime < endTimestamp).reduce((acc: { fees: number, volume: number }, curr: any) => {
    acc.fees += +curr.totalFee / 1e18;
    acc.volume += +curr.tradeVolume / 1e18;
    return acc;
  }, { fees: 0, volume: 0 });

  dailyFees.addCGToken("lair-staked-kaia", fees);
  dailyVolume.addCGToken("lair-staked-kaia", volume);

  return {
    dailyVolume,
    dailyFees, // Fees gets divided among Protcol and supply side but exact ratio couldn't be found
  }
};

const methodology = {
  Fees: "Trading fees paid by users",
  Volume: "Notional volume of all trades in the protocol, includes leverage",
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.KLAYTN],
  fetch,
  start: '2024-09-29',
  methodology,
};

export default adapter;
