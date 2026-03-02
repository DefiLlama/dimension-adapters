import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BOTANIX]: {
      fetch: async (options: FetchOptions) => {
        const dateStr = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
        const res = await httpGet(
          `https://api.routescan.io/v2/network/mainnet/evm/3637/etherscan/api?module=stats&action=dailytxnfee&startdate=${dateStr}&enddate=${dateStr}`
        );
        if (!res?.result?.[0]?.transactionFee_Eth) {
          throw new Error(`Botanix: no fee data for ${dateStr}`);
        }
        const feeNative = Number(res.result[0].transactionFee_Eth);
        const dailyFees = options.createBalances();
        dailyFees.addGasToken(BigInt(Math.round(feeNative * 1e18)));
        return { dailyFees };
      },
      start: "2025-07-01",
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
