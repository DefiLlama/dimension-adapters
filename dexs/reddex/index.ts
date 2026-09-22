import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const FEES = 0.003
// reddexv2Pair._mintFee uses denominator (rootK * 3) + rootKLast instead of the usual (rootK * 5), so feeTo takes 1/4 of the swap fee
const PROTOCOL_SHARE = 0.25

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.REDBELLY]: "https://rednode.elephantthink.com/subgraphs/name/redbelly/reddex",
  },
  feeConfig: {
    totalFees: FEES,
    userFees: FEES,
    revenue: FEES * PROTOCOL_SHARE,
    protocolFees: FEES * PROTOCOL_SHARE,
    supplySideRevenue: FEES * (1 - PROTOCOL_SHARE),
    holdersRevenue: 0,
  },
})

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.REDBELLY]: {
      fetch,
      start: '2025-01-12',
    },
  },
  methodology: {
    Fees: "User pays 0.3% fees on each swap.",
    UserFees: "User pays 0.3% fees on each swap.",
    Revenue: "Protocol takes 25% of the 0.3% swap fee (0.075% of volume), minted to feeTo on each liquidity event.",
    ProtocolRevenue: "Protocol takes 25% of the 0.3% swap fee (0.075% of volume).",
    SupplySideRevenue: "Liquidity providers keep 75% of the 0.3% swap fee (0.225% of volume).",
    HoldersRevenue: "Token holders receive no revenue.",
  },
}

export default adapter
