import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

// Escrow contracts charge a 2% protocol fee (protocolFeeBps = 200) on each
// settled job and transfer it to the fee recipient.
const FEE_RECIPIENT = "0x1095deD95CB6e81C01204F7A94950dd559195E42";

const CONFIG: Record<string, { escrows: string[]; tokens: string[] }> = {
  [CHAIN.BSC]: {
    escrows: [
      "0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C", // escrow (USDC)
      "0xCE02f987D8b8AF694E13C8a843Db9c77caBF544c", // escrow (USDT)
    ],
    tokens: [
      "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
      "0x55d398326f99059fF775485246999027B3197955", // USDT
    ],
  },
  [CHAIN.BASE]: {
    escrows: [
      "0xc3d963E0856A2c2d6F75C83C1355f680fd8F9f10", // escrow (USDC)
      "0xFf3f7038c4919A420B30D7B3533cb386D5898189", // escrow (USDT)
    ],
    tokens: [
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", // USDT
    ],
  },
};

const fetch = async (options: FetchOptions) => {
  const { escrows, tokens } = CONFIG[options.chain];
  const dailyFees = await addTokensReceived({
    options,
    tokens,
    targets: [FEE_RECIPIENT],
    fromAdddesses: escrows,
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "2% protocol fee charged on each settled job, paid in USDC/USDT from the escrow contracts to the protocol fee recipient.",
  Revenue: "100% of protocol fees go to the protocol fee recipient.",
  ProtocolRevenue: "Same as revenue — the full 2% job settlement fee.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    [CHAIN.BSC, { start: "2026-07-03" }],
    [CHAIN.BASE, { start: "2026-08-06" }],
  ],
  methodology,
};

export default adapter;
