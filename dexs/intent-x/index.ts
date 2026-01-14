import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const chainConfig: Record<string, Record<string, string>> = {
  [CHAIN.MANTLE]: { chainId: '5000' },
  [CHAIN.BASE]: { chainId: '8453' },
  [CHAIN.ARBITRUM]: { chainId: '42161' },
  [CHAIN.BLAST]: { chainId: '81457' }
};

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const formatDate = () => {
    const todayInUtc = new Date(options.startOfDay * 1000).toUTCString();
    const parts = todayInUtc.split(' ');
    return `${parts[0].replace(',', '')} ${parts[2]} ${parts[1]} ${parts[3]} 00:00:00 GMT+0000 (Coordinated Universal Time)`
  };

  const { chainId } = chainConfig[options.chain];

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const openInterestAtEnd = options.createBalances();

  const response = await fetchURL("https://app.intentx.io/analytics");

  const analyticsData = response.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );

  const analyticsJson = JSON.parse(analyticsData[1]);
  const { volumeChart, revenueChart, openInterestChart } = analyticsJson.props.pageProps.platformChartsData;

  const today = formatDate();

  const todaysVolumeData = volumeChart[chainId].find((data: any) => data.time === today).value;
  dailyVolume.addUSDValue(todaysVolumeData);

  const todaysRevenueData = revenueChart[chainId].find((data: any) => data.time === today).value;
  dailyFees.addUSDValue(todaysRevenueData);

  const todaysOIData = openInterestChart[chainId].find((data: any) => data.time === options.dateString).value;
  openInterestAtEnd.addUSDValue(todaysOIData);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    openInterestAtEnd,
  };
};

const methodology = {
  Fees: "Perp trading fees paid by users",
  Revenue: "All the trading fees are revenue",
  ProtocolRevenue: "All the trading fees go to protocol",
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: chainConfig,
  fetch,
  start: "2023-11-01",
  methodology,
};

export default adapter;
