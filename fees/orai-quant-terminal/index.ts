import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const ORAI_LCD = "https://lcd.orai.io";

type QuantStatsQueryMsg = { get_fees: {} };

const EMPTY_QUERY_OBJECT = {} as const;

const createQuantStatsQueryMsg = (): QuantStatsQueryMsg => ({ get_fees: EMPTY_QUERY_OBJECT });

type FeesSource = {
  contract: string;
};

const FEES_SOURCES: FeesSource[] = [
  {
    contract: "orai1rzfk6fd6d5zhm77cshdtr0vsuyu0qe0dg36evysklx8n6q8h38psxywppw",
  },
];

function toBase64QueryMsg(msg: QuantStatsQueryMsg): string {
  return Buffer.from(JSON.stringify(msg)).toString("base64");
}

async function queryContract({
  contract,
}: {
  contract: string;
}) {
  const queryMsg = createQuantStatsQueryMsg();
  const query = encodeURIComponent(toBase64QueryMsg(queryMsg));
  const url = `${ORAI_LCD}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`;
  const res = await httpGet(url);
  return res.data;
}

function readFirstNumericValue(payload: unknown): number {
  if (typeof payload === "number") return Number.isFinite(payload) ? payload : 0;
  if (typeof payload === "string") {
    const parsed = Number(payload);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (!payload || typeof payload !== "object") return 0;

  const data = payload as Record<string, unknown>;
  const preferredKeys = [
    "fees_usd",
    "daily_fees_usd",
    "protocol_revenue_usd",
    "daily_protocol_revenue_usd",
    "fees",
    "daily_fees"
  ];
  for (const key of preferredKeys) {
    if (key in data) {
      const value = readFirstNumericValue(data[key]);
      if (value !== 0) return value;
    }
  }

  for (const value of Object.values(data)) {
    const extracted = readFirstNumericValue(value);
    if (extracted !== 0) return extracted;
  }
  return 0;
}

function readNumericByKeys(payload: unknown, keys: string[]): number {
  if (!payload || typeof payload !== "object") return 0;
  const data = payload as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in data)) continue;
    const value = readFirstNumericValue(data[key]);
    if (value !== 0) return value;
  }
  return 0;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const contractSnapshots = await Promise.all(
    FEES_SOURCES.map(({ contract }) =>
      queryContract({
        contract,
      })
    )
  );

  contractSnapshots.forEach((snapshot: unknown) => {
    const totalFeesUsd =
      readNumericByKeys(snapshot, ["fees_usd", "daily_fees_usd", "fees", "daily_fees"]) ||
      readFirstNumericValue(snapshot);

    const humanReadableFeesUsd = totalFeesUsd / 1e6;

    dailyFees.addUSDValue(humanReadableFeesUsd);
    dailyRevenue.addUSDValue(humanReadableFeesUsd);
    dailyProtocolRevenue.addUSDValue(humanReadableFeesUsd);
  });
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ORAI]: {
      fetch,
      start: "1970-01-01",
      runAtCurrTime: true,
    },
  },
};

export default adapter;
