import { BreakdownAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.06% of each swap.",
  SupplySideRevenue: "LPs receive 0.24% of the fees.",
  HoldersRevenue: "There is no revenue for DragonSwap token holders.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}


const adapter: BreakdownAdapter = {
  methodology,
  version: 2,
  breakdown: {
    v2: {
      [CHAIN.KLAYTN]: {
        runAtCurrTime: true,
        fetch: fetch('v2'),
      }
    },
    v3: {
      [CHAIN.KLAYTN]: {
        runAtCurrTime: true,
        fetch: fetch('v3'),
      }
    },
  },
};

export default adapter;

function fetch(version: string) {
  return async () => {
    const { pools } = await httpGet(`https://dgswap.io/api/pools/?types=${version}&sortBy=apy24H&sortDirection=desc&limit=99`)
    let dailyFees = pools.reduce((acc: any, pool: any) => acc + Number(pool.feeUSD?.['24H'] ?? 0), 0)
    let dailyRevenue = pools.reduce((acc: any, pool: any) => acc + Number(pool.protocolFeeUSD?.['24H'] ?? 0), 0)
    if (version === 'v2') {
      dailyFees = pools.reduce((acc: any, pool: any) => acc + Number(pool.volumeUSD?.['24H'] ?? 0) * 0.003, 0)
      dailyRevenue = dailyFees * 0.2
    }
    const dailySupplySideRevenue = dailyFees - dailyRevenue
    return { dailyFees, dailyRevenue, dailySupplySideRevenue }

  }
}
