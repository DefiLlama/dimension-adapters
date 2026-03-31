import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const PYRAMID_CONFIG = {
  [CHAIN.ARBITRUM]: {
    target: "0xa4e6101e26BD7d2C418aDb3bbF3189375678eb99",
  },
  [CHAIN.BASE]: {
    target: "0xC909A19E3cE11841d46E9206f5FD9fe2Bc9B36b5",
  },
  [CHAIN.BSC]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  },
  [CHAIN.SONEIUM]: {
    target: "0x30410050CB1eBCF21741c9D3F817C386401f82fd",
  },
  [CHAIN.SONIC]: {
    target: "0xE99F2AEfff9CCff34832747479Bd84658495F50A",
  },
  [CHAIN.HYPERLIQUID]: {
    target: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
  },
  [CHAIN.PLUME]: {
    target: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
  },
  [CHAIN.ABSTRACT]: {
    target: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
  },
  [CHAIN.SOMNIA]: {
    target: "0xF668DDa15336129BC9977e36d60c14220cdc63Ec",
  },
  [CHAIN.MONAD]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  },
  [CHAIN.UNICHAIN]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  }
} as const;

const VERIFICATION_CONFIG = {
  [CHAIN.SONEIUM]: {
    target: "0xd61bEFb87833bAf43EE28a15022C19CDb674c204",
  },
  [CHAIN.SONIC]: {
    target: "0x30410050CB1eBCF21741c9D3F817C386401f82fd",
  },
  [CHAIN.BASE]: {
    target: "0xf2bFe2F797B60A3937f4d1bC78A75b9987Ea9493",
  },
  [CHAIN.MONAD]: {
    target: "0x3a6E887C0608f67FA015Bc115f1d76115b29d234",
  },
  [CHAIN.ARBITRUM]: {
    target: "0x582062d3D36D21b51d49F6c331fDc2e6A2929BCA",
  },
  [CHAIN.HYPERLIQUID]: {
    target: "0x6922A47e04c6c253790fa94EDc4B2fd9e90B64E3",
  },
  [CHAIN.PLUME]: {
    target: "0x6922A47e04c6c253790fa94EDc4B2fd9e90B64E3",
  },
  [CHAIN.ABSTRACT]: {
    target: "0x173F63ae500A471d86db16045cb05c13d88afc07",
  },
  [CHAIN.UNICHAIN]: {
    target: "0x1AE93e93A8B421725F114a27c82237BEF4ada624",
  },
  [CHAIN.BSC]: {
    target: "0xa4e6101e26BD7d2C418aDb3bbF3189375678eb99",
  },
  [CHAIN.POLYGON]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  },
  [CHAIN.ETHEREUM]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  },
  [CHAIN.MEGAETH]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  },
  [CHAIN.INK]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  },
  [CHAIN.SOMNIA]: {
    target: "0x4DF24Ab367C801187929FEb2841853DBa40208B0",
  },
  [CHAIN.KATANA]: {
    target: "0x3db744585f892dc77750b2f4376B4Fc1Dd66d510",
  },
} as const;

const PYRAMID_CLAIM_EVENT =
  "event PyramidClaim(string questId, uint256 indexed tokenId, address indexed claimer, uint256 price, uint256 rewards, uint256 issueNumber, string walletProvider, string embedOrigin)";

const STATUS_UPDATED_EVENT =
  "event StatusUpdated(address indexed user, uint8 oldStatus, uint8 newStatus, uint256 price, uint256 timestamp)";

const METRICS = {
  pyramidFees: "Pyramid Claim Fees",
  pyramidFeesToTreasury: "Pyramid Claim Fees To Treasury",
  verificationFees: "Verification Fees",
  verificationFeesToTreasury: "Verification Fees To Treasury",
};

async function getPyramidFees(options: FetchOptions) {
  const balances = options.createBalances();
  const config = PYRAMID_CONFIG[options.chain as keyof typeof PYRAMID_CONFIG];
  if (!config) return balances;

  const logs = await options.getLogs({
    target: config.target,
    eventAbi: PYRAMID_CLAIM_EVENT,
  });

  for (const log of logs) {
    const price = BigInt(log.price || 0);
    if (price > 0n) {
      balances.addGasToken(price.toString(), METRICS.pyramidFees);
    }
  }

  return balances;
}

async function getVerificationFees(options: FetchOptions) {
  const balances = options.createBalances();
  const config = VERIFICATION_CONFIG[options.chain as keyof typeof VERIFICATION_CONFIG];
  if (!config) return balances;

  const logs = await options.getLogs({
    target: config.target,
    eventAbi: STATUS_UPDATED_EVENT,
  });

  for (const log of logs) {
    const newStatus = Number(log.newStatus ?? -1);
    const price = BigInt(log.price || 0);

    if (price > 0n) {
      balances.addGasToken(price.toString(), METRICS.verificationFees);
    }
  }

  return balances;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const pyramidFees = await getPyramidFees(options);
  const verificationFees = await getVerificationFees(options);

  dailyFees.add(pyramidFees);
  dailyFees.add(verificationFees);

  dailyRevenue.add(pyramidFees, METRICS.pyramidFeesToTreasury);
  dailyRevenue.add(verificationFees, METRICS.verificationFeesToTreasury);

  dailyProtocolRevenue.add(pyramidFees, METRICS.pyramidFeesToTreasury);
  dailyProtocolRevenue.add(verificationFees, METRICS.verificationFeesToTreasury);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "All fees paid by users for Arkada pyramid claims and paid verifications.",
  Revenue: "100% of pyramid claim fees and verification fees are retained by Arkada.",
  ProtocolRevenue: "100% of pyramid claim fees and verification fees are allocated to Arkada treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.pyramidFees]: "Payments made by users when claiming Arkada pyramids.",
    [METRICS.verificationFees]: "Payments made by users for paid verification status updates.",
  },
  Revenue: {
    [METRICS.pyramidFeesToTreasury]: "All pyramid claim fees retained by Arkada.",
    [METRICS.verificationFeesToTreasury]: "All verification fees retained by Arkada.",
  },
  ProtocolRevenue: {
    [METRICS.pyramidFeesToTreasury]: "All pyramid claim fees allocated to Arkada treasury.",
    [METRICS.verificationFeesToTreasury]: "All verification fees allocated to Arkada treasury.",
  },
};

const chains = [CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.BSC, CHAIN.SONEIUM, CHAIN.SONIC, CHAIN.HYPERLIQUID, CHAIN.PLUME, CHAIN.ABSTRACT, CHAIN.SOMNIA, CHAIN.MONAD, CHAIN.UNICHAIN, CHAIN.CITREA, CHAIN.POLYGON, CHAIN.ETHEREUM, CHAIN.MEGAETH, CHAIN.INK, CHAIN.KATANA];

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains,
  start: "2025-03-19",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
