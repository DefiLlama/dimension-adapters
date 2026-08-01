import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const getPools = async () => {
  return (await httpGet('https://api.ref.finance/pool/search?type=all&sort=tvl&limit=10000&labels=&offset=0&hide_low_pool=false&order_by=desc')).data.list;
}

// v2.ref-finance.near admin_fee_bps = 2000: the protocol takes 20% of every swap fee (sent to
// the Ref DAO treasury) and LPs keep 80%. The API's fee_volume_24h is already the LP share
// (net of the 20% cut), so gross fees = LP fees / (1 - PROTOCOL_FEE_SHARE).
const PROTOCOL_FEE_SHARE = 0.2;

const fetch = async (_options: FetchOptions) => {
  const pools = await getPools();

  let dailyVolume = 0;
  let lpFees = 0;
  for (const pool of pools) {
    const isWashTrading = pool.volume_24h > 15 * pool.tvl;
    if (isWashTrading) continue;
    dailyVolume += Number(pool.volume_24h);
    lpFees += Number(pool.fee_volume_24h);
  }

  const dailyFees = lpFees / (1 - PROTOCOL_FEE_SHARE);
  const dailyProtocolRevenue = dailyFees * PROTOCOL_FEE_SHARE;

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees * (1 - PROTOCOL_FEE_SHARE),
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.NEAR],
  runAtCurrTime: true,
  methodology: {
    Volume: "Sum of 24h swap volume across all Ref/Rhea pools on NEAR (classic, stable, rated and concentrated-liquidity), skipping any pool whose 24h volume exceeds 15x its liquidity as likely wash trading.",
    Fees: "Total swap fees paid by traders — each pool's fee rate applied to its swap volume.",
    Revenue: "The 20% share of swap fees the protocol keeps and sends to the Ref DAO treasury.",
    ProtocolRevenue: "The 20% treasury cut of swap fees.",
    SupplySideRevenue: "The 80% of swap fees earned by liquidity providers.",
  },
};

export default adapter;
