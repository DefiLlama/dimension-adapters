import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.06% of each swap.",
  SupplySideRevenue: "LPs receive 0.24% of the fees.",
  HoldersRevenue: "There is no revenue for DragonSwap token holders.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const fetch = async () => {
  const { pools } = await httpGet(`https://dgswap.io/api/pools/?types=v2&sortBy=apy24H&sortDirection=desc&limit=99`)
  const dailyFees = pools.reduce((acc: any, pool: any) => acc + Number(pool.volumeUSD?.['24H'] ?? 0) * 0.003, 0)
  const dailyRevenue = dailyFees * 0.2
  const dailySupplySideRevenue = dailyFees - dailyRevenue
  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      runAtCurrTime: true,
      fetch,
    }
  },
};

export default adapter;
