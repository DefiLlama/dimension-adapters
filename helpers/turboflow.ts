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
      footballVolumeUsd?: string;
      predictionMarketVolumeUsd?: string;
      totalVolumeUsd: string;
    };
    fees: {
      flatFeesUsd: string;
      profitShareFeesUsd: string;
      eventContractsFeesUsd: string;
      footballContractsFeesUsd?: string;
      totalFeesUsd: string;
    };
    revenue: {
      protocolRevenueUsd: string;
      rebatesUsd: string;
      lpVaultShareUsd: string;
      tokenHolderRevenueUsd: string;
    };
  };
};

export type TurboFlowMetrics = {
  perpVolumeUsd: number;
  eventContractsVolumeUsd: number;
  footballVolumeUsd: number;
  predictionMarketVolumeUsd: number;
  flatFeesUsd: number;
  profitShareFeesUsd: number;
  eventContractsFeesUsd: number;
};

export async function fetchTurboFlowMetrics(options: FetchOptions): Promise<TurboFlowMetrics> {
  const response: MetricsResponse = await fetchURL(`${API}?date=${options.dateString}`);
  if (response.errno !== "200") {
    throw new Error(`TurboFlow metrics API error for ${options.dateString}: ${response.msg}`);
  }

  const volume = response.data.volume;
  const fees = response.data.fees;
  const eventContractsVolumeUsd = toNumber(volume.eventContractsVolumeUsd);
  const footballVolumeUsd = toNumber(volume.footballVolumeUsd);

  return {
    perpVolumeUsd: toNumber(volume.perpVolumeUsd),
    eventContractsVolumeUsd,
    footballVolumeUsd,
    predictionMarketVolumeUsd:
      toNumber(volume.predictionMarketVolumeUsd) || eventContractsVolumeUsd + footballVolumeUsd,
    flatFeesUsd: toNumber(fees.flatFeesUsd),
    profitShareFeesUsd: toNumber(fees.profitShareFeesUsd),
    eventContractsFeesUsd: toNumber(fees.eventContractsFeesUsd),
  };
}

export function shouldReturnProtocolMetrics(options: FetchOptions) {
  // TurboFlow's endpoint returns protocol-level daily metrics. Emit them once to
  // avoid double-counting while keeping the adapter scoped to the BSC + Solana custody footprint.
  return !options.chain || options.chain === CHAIN.BSC;
}

function toNumber(value: string | number | undefined | null) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
