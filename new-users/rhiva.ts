import {
  type FetchOptions,
  ProtocolType,
  type SimpleAdapter,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

const RHIVA_ENDPOINT = "https://api.rhiva.fun/metrics";

type UserMetric = { users: number };

const fetch = async ({ toTimestamp, fromTimestamp }: FetchOptions) => {
  const filter = {
    filter: {
      endTime: new Date(toTimestamp * 1000).toISOString(),
      startTime: new Date(fromTimestamp * 1000).toISOString(),
    },
  };

  const userMetric = await postURL(`${RHIVA_ENDPOINT}/users`, filter, 3, {
    headers: { "Content-Type": "application/json" },
  });

  const { users } = userMetric as UserMetric;

  return {
    dailyNewUsers: users,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  version: 1,
  start: "2026-09-11",
  chains: [CHAIN.SOLANA],
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
