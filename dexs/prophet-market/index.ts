import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPolymarketVolume } from "../../helpers/polymarket";
import ADDRESSES from '../../helpers/coreAssets.json'

// Prophet Market is an on-chain prediction market on Polygon where outcomes are settled
// through AI-powered resolution. Each trade settles through an `OrderFilled` event on the
// ProphetCTFExchange, where one leg is native USDC collateral (asset id 0) and the
// other is an ERC-1155 outcome token (a non-zero id).

const EXCHANGE_ADDRESS = "0x127aD3A6e55EbBDaecC0eaeb12615879611e1839"; // ProphetCTFExchange
const USDC = ADDRESSES.polygon.USDC_CIRCLE

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({
    options,
    exchanges: [EXCHANGE_ADDRESS],
    currency: USDC,
  });

  return {
    dailyVolume,
    dailyNotionalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume: "USDC volume traded through OrderFilled events on Prophet's CTF exchange. Only the collateral (USDC) side of each fill is counted and amounts are halved to correct for maker + taker double counting, matching the Polymarket methodology.",
    NotionalVolume: "Notional volume (1 USDC = 1 outcome token) traded through OrderFilled events on Prophet's CTF exchange.",
  },
  chains: [CHAIN.POLYGON],
  start: "2026-05-01", // block 86244025, ProphetCTFExchange deployment
  fetch,
};

export default adapter;
