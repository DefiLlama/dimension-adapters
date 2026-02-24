import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const OldTREASURY = "0x31995B7ea0D0ec85e9c72C903AF0F29acF3622F2".toLowerCase();
const TREASURY = "0x86039dc5084358863d3D69C0c24C40b0b6Cf9130".toLowerCase();
const USDT = '0x26E490d30e73c36800788DC6d6315946C4BbEa24'; // or the USDT address for your chain


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await addTokensReceived({
    options,
    tokens: [USDT],
    targets: [TREASURY, OldTREASURY],
    balances: dailyFees,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: '0',
  }
};

const methodology = {
  Fees: "Protocol collects fees from trading in USDT.",
  Revenue: "All fees collected are considered revenue.",
  ProtocolRevenue: "All fees collected are considered Protocol revenue.",
  HoldersRevenue: "No Holders revenue.",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ASSETCHAIN],
  start: '2025-05-12',
  methodology,
};

export default adapter;
