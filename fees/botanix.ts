import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

function parseEthToWei(feeStr: string): bigint {
  const s = String(feeStr);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Botanix: malformed fee value "${s}"`);
  const [whole = "0", frac = ""] = s.split(".");
  return BigInt(whole + frac.padEnd(18, "0").slice(0, 18));
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BOTANIX]: {
      fetch: async (options: FetchOptions) => {
        const dateStr = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
        const res = await httpGet(
          `https://api.routescan.io/v2/network/mainnet/evm/3637/etherscan/api?module=stats&action=dailytxnfee&startdate=${dateStr}&enddate=${dateStr}`
        );
        if (!res?.result?.[0] || res.result[0].transactionFee_Eth === undefined)
          throw new Error(`Botanix: no fee data for ${dateStr} (status=${res?.status}, message=${res?.message})`);
        const dailyFees = options.createBalances();
        dailyFees.addGasToken(parseEthToWei(res.result[0].transactionFee_Eth));
        return { dailyFees };
      },
      start: "2025-07-01",
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
