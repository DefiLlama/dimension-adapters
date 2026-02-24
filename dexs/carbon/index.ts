import { FetchOptions, FetchResult, SimpleAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
  const formatDate = () => {
    const todayInUtc = new Date(options.startOfDay * 1000).toUTCString();
    const parts = todayInUtc.split(' ');
    return `${parts[0].replace(',', '')} ${parts[2]} ${parts[1]} ${parts[3]} 00:00:00 GMT+0000 (Coordinated Universal Time)`
  }

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  const openInterestAtEnd = options.createBalances();

  const response = await fetchURL("https://app.carbon.inc/analytics");

  const analyticsData = response.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );

  const analyticsJson = JSON.parse(analyticsData[1]);
  const { tradeVolumeFEData, revenueFEData, intentXFEOIAnalytics } = analyticsJson.props.pageProps;

  const today = formatDate();

  Object.values(tradeVolumeFEData).forEach((value: any) => {
    const todaysVolumeData = value.find((data: any) => data.time === today).value;
    dailyVolume.addUSDValue(todaysVolumeData);
  });

  Object.values(revenueFEData).forEach((value: any) => {
    const todaysRevenueData = value.find((data: any) => data.time === today).value;
    dailyFees.addUSDValue(todaysRevenueData);
  });

  Object.values(intentXFEOIAnalytics).forEach((value: any) => {
    const todaysOIData = +value.find((data: any) => data.date === options.dateString).totalOI;
    openInterestAtEnd.addUSDValue(todaysOIData);
  });

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
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2023-11-01",
    },
  },
  methodology,
};

export default adapter;
