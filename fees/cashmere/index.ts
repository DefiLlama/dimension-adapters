import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CASHMERE_API_URL = "https://kapi.cashmere.exchange/defillama/fees";

const getUrl = (startTime: number, endTime: number): string => {
  return `${CASHMERE_API_URL}?from_timestamp=${startTime}&to_timestamp=${endTime}`;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const url = getUrl(options.startTimestamp, options.endTimestamp);
  const response = await fetchURL(url);

  return {
    dailyVolume: response.volumeUsd || 0,
    dailyFees: response.feesUsd || 0,
    dailyUserFees: response.feesUsd || 0,
    dailyRevenue: response.revenuesUsd || 0,
    dailyProtocolRevenue: response.protocolRevenueUsd || 0,
    dailyHoldersRevenue:  0,
    dailySupplySideRevenue:0,
  };
};

const methodology = {
  Volume: "Total cross-chain volume of the Cashmere",
  Fees: "Total amount of fees paid by users for cross-chain Cashmere relayers",
  UserFees: "Same as Fees - all fees are paid directly by end-users for Cashmere relayers",
  Revenue: "All relayer fees are retained as protocol revenue",
  ProtocolRevenue: "100% of fees go to protocol treasury",
  HoldersRevenue: "No token holders revenue distribution - Cashmere operates as a service protocol without governance tokens",
  SupplySideRevenue: "No liquidity providers - Cashmere operates bridge infrastructure, not AMM liquidity pools",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM], // Aggregate data across all chains, represented under Ethereum
  start: "2025-09-08",
  methodology,
};

export default adapter;
