import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

export type RouteScanFeeConfig = {
  chain: string;
  chainId: number;
  CGToken: string;
  start: string;
};

type RouteScanFeeRow = {
  UTCDate: string;
  transactionFee_Eth: string;
};

const BASE_URL = "https://api.routescan.io/v2/network/mainnet/evm";

async function fetchRouteScanFees(options: FetchOptions, config: RouteScanFeeConfig) {
  const dailyFees = options.createBalances();
  const { dateString } = options;
  const data = await fetchURL(`${BASE_URL}/${config.chainId}/etherscan/api?module=stats&action=dailytxnfee&startdate=${dateString}&enddate=${dateString}`);

  if (!Array.isArray(data?.result)) {
    throw new Error(`Invalid Routescan fee response for ${config.chain}`);
  }

  const feeToday = (data.result as RouteScanFeeRow[]).find((fee) => fee.UTCDate === dateString);
  if (!feeToday) {
    return { dailyFees };
  }

  const feeAmount = Number(feeToday.transactionFee_Eth);
  if (!Number.isFinite(feeAmount)) {
    throw new Error(`Invalid Routescan fee amount for ${config.chain} on ${dateString}`);
  }

  dailyFees.addCGToken(config.CGToken, feeAmount);
  return { dailyFees };
}

export function routescanFeeAdapter(config: RouteScanFeeConfig): Adapter {
  return {
    version: 1,
    adapter: {
      [config.chain]: {
        fetch: (options: FetchOptions) => fetchRouteScanFees(options, config),
        start: config.start,
      },
    },
    protocolType: ProtocolType.CHAIN,
    skipBreakdownValidation: true,
  };
}
