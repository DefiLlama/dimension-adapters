import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_RECIPIENT = {
  [CHAIN.ETHEREUM]: "0x45ff0e3bd649a1d4b78982c8eeae0839aaa7f84f",
  [CHAIN.BASE]: "0x32934ad7b1121defc631080b58599a0eaab89878",
  [CHAIN.OPTIMISM]: "0x32934ad7b1121defc631080b58599a0eaab89878",
};

const VA_TOKENS = {
  [CHAIN.ETHEREUM]: [
    "0x650CD45DEdb19c33160Acc522aD1a82D9701036a", // vacbETH
    "0xd1C117319B3595fbc39b471AB1fd485629eb05F2", // vaETH
    "0x4C73F025a1947ec770327B9956Fc61f535F72C22", // vamsUSD
    "0xc14900dFB1Aa54e7674e1eCf9ce02b3b35157ba5", // vaFRAX
    "0xca7c607C590ad16007CCBbba9D26f4df656a36C2", // vamsETH
    "0xa8b607Aa09B6A2E306F93e74c282Fb13f6a80452", // vaUSDC
    "0x0538C8bAc84E95A9dF8aC10Aad17DbE81b9E36ee", // vaDAI
    "0x4Dbe3f01aBe271D3E65432c74851625a8c30Aa7B", // vastETH
    "0x01e1d41C1159b745298724c5Fd3eAfF3da1C6efD", // vaWBTC
    "0xef4F4604106de23CDadfEAE08fcC34602cB475C1", // vaLINK
    "0xdd9f61a85fFE73E41eF889817972f0B0AaE6D6Dd", // varETH
  ],
  [CHAIN.BASE]: [
    "0x913Ece180df83A2B81A4976F83cA88543a0C51b8", // vamsETH
    "0x82562507429876486B60AF4F32390ef0947b3d13", // vaETH
    "0x1e41238aCd3A9fF90b0DCB9ea96Cf45F104e09Ef", // vaUSDC
    "0x3899a6090c5C178dB8A1800DA39daD0D06EeEFBE", // vacbETH
    "0x46fb68Eb2b1Fc43654AbaE5691D39D18D933E4b4", // vawstETH
  ],
  [CHAIN.OPTIMISM]: [
    "0xdd63ae655b388Cd782681b7821Be37fdB6d0E78d", // vawstETH
    "0x539505Dde2B9771dEBE0898a84441c5E7fDF6BC0", // vaUSDC
    "0xCcF3d1AcF799bAe67F6e354d685295557cf64761", // vaETH
    "0x19382707d5a47E74f60053b652Ab34b6e30Febad", // vaOP
  ],
};

const VSP_TOKEN = "0x1b40183EFB4Dd766f11bda7a7c3ad8982e998421";
const VSP_DISTRIBUTOR = "0xd31f42cf356e02689d1720b5ffaa6fc7229d255b";

const fetch = (chain: string) => async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({ options, tokens: VA_TOKENS[chain], targets: [FEE_RECIPIENT[chain]], });

  const dailyHoldersRevenue = chain === CHAIN.ETHEREUM
    ? await addTokensReceived({ options, tokens: [VSP_TOKEN], targets: [VSP_DISTRIBUTOR] })
    : options.createBalances();

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Tracks vaTokens minted to Vesper's Fee Recipient address.",
    Revenue: "vaTokens minted are protocol revenue.",
    HoldersRevenue: "Tracks VSP distributed to esVSP lockers.",
  },
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: '2023-08-09',
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2023-08-09',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-08-09',
    },
  },
};

export default adapter;
