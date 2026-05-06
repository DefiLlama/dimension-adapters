import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const API_URL = "https://v3.potatoswap.finance/api/pool/list-all";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const response = await fetchURL(API_URL);
  const pools = response.data.pools;

  const timeNow = Math.floor(Date.now() / 1000)
  const isCloseToCurrentTime = Math.abs(timeNow - options.toTimestamp) < 3600 * 6 // 6 hour

  if (isCloseToCurrentTime) {

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    for (const { protocol_version, volume_24h_usd, fee_24h_usd } of pools) {
      if (protocol_version !== "v2") continue;

      dailyVolume.addUSDValue(Number(volume_24h_usd));
      dailyFees.addUSDValue(Number(fee_24h_usd));
    }

    const dailySupplySideRevenue = dailyFees.clone(0.17 / 0.25);
    const dailyHoldersRevenue = dailyFees.clone(0.08 / 0.25);

    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: dailyHoldersRevenue,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue,
    };
  }
  return getUniV2LogAdapter({ factory: '0x630db8e822805c82ca40a54dae02dd5ac31f7fcf', userFeesRatio: 1, revenueRatio: 8 / 25, protocolRevenueRatio: 0, holdersRevenueRatio: 8 / 25 })(options)

};

const methodology = {
  Fees: "PotatoSwap charges a 0.25% swap fee on v2 pools.",
  UserFees: "Users pay a 0.25% swap fee per trade.",
  SupplySideRevenue:
    "Liquidity providers receive 0.17% of swap volume.",
  HoldersRevenue:
    "0.08% of swap volume is distributed to vePOT holders.",
  ProtocolRevenue:
    "The protocol does not retain a direct fee share.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  start: '2024-04-16',
  methodology,
};

export default adapter;