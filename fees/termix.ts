import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from '../helpers/coreAssets.json';

// Escrow and campaign-vault contracts charge a 2% protocol fee
// (protocolFeeBps = 200) on each settlement and transfer it to the fee recipient.
const FEE_RECIPIENT = "0x1095deD95CB6e81C01204F7A94950dd559195E42";

const ESCROW_FEES = "Escrow Fees";
const CAMPAIGN_FEES = "Campaign Vault Fees";

const CAMPAIGN_VAULTS: Record<string, string[]> = {
  [CHAIN.BSC]: [
    "0x5BaE7834B32a4b357F65dd20248068993466D294", // campaign vault (USDC)
    "0x16261F2BCbE8Ee47065C5ecB4be32c1571289809", // campaign vault (USDT)
  ],
  [CHAIN.BASE]: [
    "0x97d14D248d956148a34E4fe636CDdBa8BB80E551", // campaign vault (USDC)
    "0x911d5c2a20dDA9bE9daE53fE3AD9183e5b583D7f", // campaign vault (USDT)
  ],
};

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

  const campaignFees = await addTokensReceived({
    options,
    tokens,
    targets: [FEE_RECIPIENT],
    fromAdddesses: CAMPAIGN_VAULTS[options.chain],
  });

  dailyFees.addBalances(campaignFees, CAMPAIGN_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "2% protocol fee charged on each settlement (jobs via escrow, campaigns via campaign vault), paid in USDC/USDT to the protocol fee recipient.",
  Revenue: "100% of protocol fees (2% of settlements) go to the protocol fee recipient.",
  ProtocolRevenue: "Same as revenue — the full 2% settlement fee.",
};

const breakdownMethodology = {
  Fees: {
    [ESCROW_FEES]: "2% protocol fee on jobs settled through the escrow contracts, paid in USDC or USDT.",
    [CAMPAIGN_FEES]: "2% protocol fee on campaign settlements through the campaign-vault contracts, paid in USDC or USDT.",
  },
  Revenue: {
    [ESCROW_FEES]: "100% of escrow protocol fees (2% of job settlement) go to the fee recipient.",
    [CAMPAIGN_FEES]: "100% of campaign-vault protocol fees (2% of campaign settlement) go to the fee recipient.",
  },
  ProtocolRevenue: {
    [ESCROW_FEES]: "Same as revenue — the full 2% job settlement fee.",
    [CAMPAIGN_FEES]: "Same as revenue — the full 2% campaign settlement fee.",
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
