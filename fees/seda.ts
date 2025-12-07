import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const input = encodeURIComponent(
  JSON.stringify({
    "0": { startDate: "2025-07-01T00:30:00.000Z" },
    "1": { startDate: "2025-07-01T00:30:00.000Z" },
    "2": { startDate: "2025-07-01T00:30:00.000Z" },
  })
);

const reqUrl = `https://explorer-api.mainnet.seda.xyz/main/trpc/trends.drCount,trends.sedaBurned,trends.averageDrCost?batch=1&input=${input}`;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const data: any[] = await httpGet(reqUrl)

  if (!data || data.length !== 3)
    throw new Error("Seda explorer returned incomplete data");

  const today = options.startOfDay * 1000;
  const yesterday = options.startOfDay * 1000 - 86400000;

  const extractResult = (data: any, dataFrequency: string = 'oneDay') => {
    const dataToday = data.result.data.data.find((entry: [number, number]) => {
      return entry[0] === today
    }) ?? [0, 0];
    const dataYesterday = data.result.data.data.find((entry: [number, number | string]) => entry[0] === yesterday) ?? [0, 0];

    const result = dataFrequency === 'oneDay' ? (dataToday[1]) - (dataYesterday[1]) : +(dataToday[1] || dataYesterday[1]);
    return result;
  };

  const requestsCount = extractResult(data[0]), sedaBurned = extractResult(data[1]) / 1e18, averageRequestCost = extractResult(data[2], 'twoDays') / 1e18;

  if (requestsCount > 0 && sedaBurned > 0 && averageRequestCost) {
    dailyFees.addCGToken('seda-2', requestsCount * averageRequestCost);
    dailyRevenue.addCGToken('seda-2', sedaBurned);
  }

  return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue };
}

const methodology = {
  Fees: "fees paid by data requests in SEDA tokens",
  Revenue: "seda burned for each request",
  HoldersRevenue: "seda burned for each request"
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SEDA],
  start: '2025-07-17',
  protocolType: ProtocolType.CHAIN,
  methodology,
}

export default adapter;
