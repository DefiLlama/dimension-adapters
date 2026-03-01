import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const ROUTERS = [
  '0xf514ec27666f2e9669837f4f9eca6405ba38ac64', // current prod router
  '0x025f45a3ec6e90e8e1db1492554c9b10539ef2fc', // previous v2 router
  '0x95e8f3227ecc2f35213b6fd6fece6b8854a77db5', // legacy router
]

const FEE_RECIPIENT = '0x53a7fcdbb5d9a8d6a9f2b83d6e70cd1efdaf76c6'
const PROTOCOL_FEE_BPS = 10 // 0.10%

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_RECIPIENT,
    fromAdddesses: ROUTERS,
  })

  const dailyVolume = dailyFees.clone(10000 / PROTOCOL_FEE_BPS)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: 0,
  }
}

const methodology = {
  Fees: "Onchain Transfer accounting: sum ERC20 transfers sent from InoSwap routers to feeRecipient.",
  Revenue: "Mirrors fee stream collected in feeRecipient wallet.",
  ProtocolRevenue: "Mirrors fee stream collected in feeRecipient wallet.",
  SupplySideRevenue: "Set to 0 until explicit partner/supply-side distribution events are emitted.",
  UserFees: "Protocol fees paid by users, inferred from feeRecipient inflows.",
  Volume: "Inferred from feeRecipient inflows using fixed protocol fee 0.10% (volume = fees / 0.001).",
}

const adapter: any = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CRONOS],
  start: "2026-02-01",
  methodology,
}

export default adapter;
