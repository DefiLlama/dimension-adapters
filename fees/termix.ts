import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from '../helpers/coreAssets.json';

// Escrow contracts charge a 2% protocol fee (protocolFeeBps = 200) on each
// settled job and transfer it to the fee recipient.
const FEE_RECIPIENT = "0x1095deD95CB6e81C01204F7A94950dd559195E42";

const ESCROW_FEES = "Escrow Fees";

const CONFIG: Record<string, { escrow: string; token: string }[]> = {
  [CHAIN.BSC]: [
    {
      escrow: "0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C",
      token: ADDRESSES.bsc.USDC,
    },
    {
      escrow: "0xCE02f987D8b8AF694E13C8a843Db9c77caBF544c",
      token: ADDRESSES.bsc.USDT,
    },
  ],
  [CHAIN.BASE]: [
    {
      escrow: "0xc3d963E0856A2c2d6F75C83C1355f680fd8F9f10",
      token: ADDRESSES.base.USDC,
    },
    {
      escrow: "0xFf3f7038c4919A420B30D7B3533cb386D5898189",
      token: ADDRESSES.base.USDT,
    },
  ],
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const tokens = CONFIG[options.chain].map(({ token }) => token);
  const escrows = CONFIG[options.chain].map(({ escrow }) => escrow);

  const received = await addTokensReceived({
    options,
    tokens,
    targets: [FEE_RECIPIENT],
    fromAdddesses: escrows,
  });

  dailyFees.addBalances(received, ESCROW_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "2% protocol fee charged on each settled job, paid in USDC/USDT from the escrow contracts to the protocol fee recipient.",
  Revenue: "100% of protocol fees (2% of job settlement) go to the protocol fee recipient.",
  ProtocolRevenue: "Same as revenue — the full 2% job settlement fee.",
};

const breakdownMethodology = {
  Fees: {
    [ESCROW_FEES]: "2% protocol fee on jobs settled through the escrow contracts, paid in USDC or USDT.",
  },
  Revenue: {
    [ESCROW_FEES]: "100% of escrow protocol fees (2% of job settlement) go to the fee recipient.",
  },
  ProtocolRevenue: {
    [ESCROW_FEES]: "Same as revenue — the full 2% job settlement fee.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    [CHAIN.BSC, { start: "2026-07-03" }],
    [CHAIN.BASE, { start: "2026-08-06" }],
  ],
  methodology,
  breakdownMethodology,
};

export default adapter;
