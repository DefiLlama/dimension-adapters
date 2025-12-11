import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";

// Nado (Private Alpha)
// Production API on Ink Mainnet
const archiveInkUrl = "https://archive.prod.nado.xyz/v1";

type TURL = {
  [s: string]: string;
};

const url: TURL = {
  [CHAIN.INK]: archiveInkUrl,
};

interface IData {
  [s: string]: string;
}

interface Snapshot {
  open_interests: IData;
}

interface Response {
  snapshots: Snapshot[];
}

const query = async (
  max_time: number,
  fetchOptions: FetchOptions
): Promise<Response> => {
  const body = {
    market_snapshots: {
      interval: {
        count: 1,
        granularity: 86400,
        max_time: max_time,
      },
    },
  };

  const response = await httpPost(url[fetchOptions.chain], body);
  return response;
};

const sumAllProductOpenInterests = (open_interests: IData): number => {
  let sum = 0;
  for (const v of Object.values(open_interests)) {
    sum += parseInt(v);
  }
  return sum / 1e18;
};

const fetch = async (
  timestamp: number,
  _: any,
  fetchOptions: FetchOptions
) => {
  const response = await query(timestamp, fetchOptions);

  if (!response.snapshots || response.snapshots.length === 0) {
    return { openInterestAtEnd: undefined };
  }

  const snapshot = response.snapshots[0];
  const openInterestAtEnd = sumAllProductOpenInterests(snapshot.open_interests);

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.INK],
  start: '2025-11-15',
  runAtCurrTime: true,
};

export default adapter;
