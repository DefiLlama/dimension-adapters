import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "./chains";

const API = "https://apis.turboflow.xyz/defillama/metrics";

type MetricsResponse = {
  errno: string;
  msg: string;
  data: {
    date: string;
    volume: {
      perpVolumeUsd: string;
      eventContractsVolumeUsd: string;
      footballVolumeUsd: string;
      predictionMarketVolumeUsd: string;
      totalVolumeUsd: string;
    };
    fees: {
      flatFeesUsd: string;
      profitShareFeesUsd: string;
      eventContractsFeesUsd: string;
      footballContractsFeesUsd: string;
      totalFeesUsd: string;
    };
  };
};

export type TurboFlowMetrics = {
  perpVolumeUsd: number;
  predictionMarketVolumeUsd: number;
  // Perp fees: flat trading fee + profit-share fee. Prediction-market fees:
  // event-contract + football-contract fees. The four sum to the API's totalFeesUsd,
  // so splitting them this way mirrors the perp/prediction volume split with no gaps.
  perpFeesUsd: number;
  predictionMarketFeesUsd: number;
};

export async function fetchTurboFlowMetrics(options: FetchOptions): Promise<TurboFlowMetrics> {
  const response: MetricsResponse = await fetchURL(`${API}?date=${options.dateString}`);
  if (response.errno !== "200") {
    throw new Error(`TurboFlow metrics API error for ${options.dateString}: ${response.msg}`);
  }

  const volume = response.data.volume;
  const fees = response.data.fees;

  return {
    perpVolumeUsd: parseRequiredNumber(volume.perpVolumeUsd, "volume.perpVolumeUsd"),
    predictionMarketVolumeUsd: parseRequiredNumber(
      volume.predictionMarketVolumeUsd,
      "volume.predictionMarketVolumeUsd",
    ),
    perpFeesUsd:
      parseRequiredNumber(fees.flatFeesUsd, "fees.flatFeesUsd") +
      parseRequiredNumber(fees.profitShareFeesUsd, "fees.profitShareFeesUsd"),
    predictionMarketFeesUsd:
      parseRequiredNumber(fees.eventContractsFeesUsd, "fees.eventContractsFeesUsd") +
      parseRequiredNumber(fees.footballContractsFeesUsd, "fees.footballContractsFeesUsd"),
  };
}

export function shouldReturnProtocolMetrics(options: FetchOptions) {
  // TurboFlow's endpoint returns protocol-level daily metrics. Emit them once to
  // avoid double-counting while keeping the adapter scoped to the BSC + Solana custody footprint.
  return !options.chain || options.chain === CHAIN.BSC;
}

function parseRequiredNumber(value: string | number | undefined | null, field: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`TurboFlow metrics API returned invalid ${field}`);
  }
  return n;
}
