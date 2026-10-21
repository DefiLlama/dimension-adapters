import { Adapter, FetchOptions, FetchResultIncentives } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// USDp liquidity incentives are paid by one multisig, funded by the DAO Treasury (PGP-29, PGP-41).
// It pays them in USDp to the addresses listed per chain: gauges, vote-incentive markets, Merkl and a liquidity provider.
const INCENTIVES_MULTISIG = "0xd3Be6a96c4039971Bced2e92b72FAabb226a0412";

const MERKL_DISTRIBUTOR = "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
const MERKL_FEE_RECIPIENT = "0xeaC6A75e19beB1283352d24c0311De865a867DAB";

type ChainConfig = { usdp: string; recipients: string[]; start: string };

const config: Record<string, ChainConfig> = {
  [CHAIN.SONIC]: {
    usdp: "0x08417cdb7F52a5021bB4eb6E0deAf3f295c3f182",
    recipients: [
      "0xCa5F92861649559FD87b936F5cD0D124c4B306dd", // Beets scUSD-USDp gauge
    ],
    start: "2025-09-24",
  },
  [CHAIN.BASE]: {
    usdp: "0x76A9A0062ec6712b99B4f63bD2b4270185759dd5",
    recipients: [
      "0x8c2c5A295450DDFf4CB360cA73FCCC12243D14D9", // Votemarket: vote incentives for the Sonic and Avalanche gauges
      "0x4DE4F3477fD62c5C0b0983fc77ae6F5301C6976E", // BribeBatchesSimple
    ],
    start: "2025-09-25",
  },
  [CHAIN.AVAX]: {
    usdp: "0x9eE1963f05553eF838604Dd39403be21ceF26AA4",
    recipients: [
      "0xB86DEe1c91A4573F80A3C0c67F3F30D8116fd850", // Balancer ChildChainGaugeInjectorV2
      MERKL_DISTRIBUTOR,
      MERKL_FEE_RECIPIENT,
    ],
    start: "2025-12-17",
  },
  [CHAIN.HYPERLIQUID]: {
    usdp: "0xBE65F0F410A72BeC163dC65d46c83699e957D588",
    recipients: [
      MERKL_DISTRIBUTOR,
      MERKL_FEE_RECIPIENT,
      "0x8fb55e36b43c0d6dAb2186542277f061ECdA94B5", // a USDp liquidity provider (Curve USDp/frxUSD gauge, Merkl rewards)
    ],
    start: "2026-02-25",
  },
};

const fetch = async (options: FetchOptions): Promise<FetchResultIncentives> => {
  const { usdp, recipients } = config[options.chain];
  const tokenIncentives = await addTokensReceived({
    options,
    tokens: [usdp],
    targets: recipients,
    fromAddressFilter: INCENTIVES_MULTISIG,
  });
  return { tokenIncentives };
};

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])),
  methodology: {
    Incentives: "USDp paid by the DAO's liquidity incentives multisig to gauges, vote-incentive markets, Merkl campaigns and a liquidity provider, counted on the day it is paid in.",
  },
};

export default adapter;
