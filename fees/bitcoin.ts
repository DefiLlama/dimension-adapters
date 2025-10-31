import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// const feeAdapter = chainAdapter(CHAIN.BITCOIN, "btc", 1230958800);

async function fetchFunction(_a: any, _b: any, options: FetchOptions) {
  const response = await fetch("https://ycharts.com/charts/fund_data.json?aiSummaries=&calcs=&chartId=&chartType=interactive&correlations=&customGrowthAmount=&dataInLegend=value&dateSelection=range&displayDateRange=false&endDate=&format=real&legendOnChart=false&lineAnnotations=&nameInLegend=name_and_ticker&note=&partner=basic_2000&performanceDisclosure=false&quoteLegend=false&recessions=false&scaleType=linear&securities=id%3AI%3ABTTFPDND%2Cinclude%3Atrue%2C%2C&securityGroup=&securitylistName=&securitylistSecurityId=&source=false&splitType=single&startDate=&title=&units=false&useCustomColors=false&useEstimates=false&zoom=1&hideValueFlags=false&redesign=true&chartAnnotations=&axisExtremes=&sortColumn=&sortDirection=&le_o=quote_page_fund_data&maxPoints=678&chartCreator=false", {
    "headers": {
      "accept": "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "priority": "u=1, i",
      "sec-ch-ua": "\"Brave\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Linux\"",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "sec-gpc": "1",
      "x-requested-with": "XMLHttpRequest",
      "cookie": "cookieyes-consent=consentid:azc1WXdFckFuQ01wWTdNNmRCMFZBelJrT0ZtMEVzaUw,consent:yes,action:no,necessary:yes,functional:yes,analytics:yes,performance:yes,advertisement:yes,other:yes,lastRenewedDate:1704823885000; __stripe_mid=4352627b-d3f6-44a1-8247-f949c908ef54c8fb48; __stripe_sid=b1aa9827-42d9-4201-be06-be62b557bb3d1ee313; messagesUtk=bd1d031df0ee4d3089d7c39a7f5ee827; page_view_ctr=6",
      "Referer": "https://ycharts.com/indicators/bitcoin_total_transaction_fees_per_day"
    },
    "body": null,
    "method": "GET"
  });
  
  const { chart_data } = await response.json();
  const raw_data = chart_data[0][0].raw_data;
  
  const item = raw_data.find((i: Array<number>) => Number(i[0]) === options.startOfDay * 1000);
  if (!item) {
    throw Error(`can not get Bitcoin fees for date ${options.startOfDay}`);
  }

  return {
    dailyFees: Number(item[1]), // value in USD
  }
}

const adapter: Adapter = {
  version: 1,
  fetch: fetchFunction,
  chains: [CHAIN.BITCOIN],
  protocolType: ProtocolType.CHAIN
}

export default adapter;
