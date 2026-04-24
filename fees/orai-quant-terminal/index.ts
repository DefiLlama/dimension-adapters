import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const ORAI_LCD = "https://lcd.orai.io";

const FEES_QUERY_MSG = { get_fees: {} } as const;

type FeesSource = {
  contract: string;
};

const FEES_SOURCES: FeesSource[] = [
  {
    contract: "orai1rzfk6fd6d5zhm77cshdtr0vsuyu0qe0dg36evysklx8n6q8h38psxywppw",
  },
];

function toBase64QueryMsg(msg: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(msg)).toString("base64");
}

async function queryContract({
  contract,
}: {
  contract: string;
}) {
  const query = encodeURIComponent(toBase64QueryMsg(FEES_QUERY_MSG));
  const url = `${ORAI_LCD}/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`;
  const res = await httpGet(url);
  return res.data;
}

function readFeesValue(payload: unknown): number {
  if (typeof payload === "number") return Number.isFinite(payload) ? payload : 0;
  if (typeof payload === "string") return Number(payload) || 0;
  if (!payload || typeof payload !== "object") return 0;
  const data = payload as Record<string, unknown>;

  for (const value of Object.values(data)) {
    const nested = readFeesValue(value);
    if (nested) return nested;
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
    const totalFeesUsd = readFeesValue(snapshot);
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
