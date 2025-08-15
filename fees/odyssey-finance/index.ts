import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const TREASURY = {
  [CHAIN.ETHEREUM]: "0xd44a3e93a256c445f17a12f35a0ffef975ec6817",
  [CHAIN.BASE]:     "0xd44a3e93a256c445f17a12f35a0ffef975ec6817",
  [CHAIN.OPTIMISM]: "0xd44a3e93a256c445f17a12f35a0ffef975ec6817",
};

const TOKENS = {
  [CHAIN.ETHEREUM]: [
    "0xFAe103DC9cf190eD75350761e95403b7b8aFa6c0", // rswETH
    "0xc14900dFB1Aa54e7674e1eCf9ce02b3b35157ba5", // vaFRAX
    "0xa8b607Aa09B6A2E306F93e74c282Fb13f6A80452", // vaUSDC
    "0x657d9ABA1DBb59e53f9F3eCAA878447dCfC96dCb", // ynETHx
    "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497", // sUSDe
    "0xd1C117319B3595fbc39b471AB1fd485629eb05F2", // vaETH
    "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", // wstETH
    "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD", // sUSDS
    "0x650CD45DEdb19c33160Acc522aD1a82D9701036a", // vaCBETH
    "0x4Dbe3f01aBe271D3E65432c74851625a8c30Aa7B", // vaSTETH
    "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", // weETH
    "0xdC035D45d973E3EC169d2276DDab16f1e407384F", // USDS
  ],
  [CHAIN.BASE]: [
    "0x7FcD174E80f264448ebeE8c88a7C4476AAF58Ea6", // wsuperOETHb
    "0x1e41238aCd3A9fF90b0DCB9ea96Cf45F104e09Ef", // vaUSDC
    "0x3899a6090c5C178dB8A1800DA39daD0D06EeEFBE", // vacbETH
    "0x46fb68Eb2b1Fc43654AbaE5691D39D18D933E4b4", // vawstETH
    "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", // wstETH
    "0x2416092f143378750bb29b79eD961ab195CcEea5", // ezETH
    "0x82562507429876486B60AF4F32390ef0947b3d13", // vaETH
  ],
  [CHAIN.OPTIMISM]: [
    "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb", // wstETH
    "0xCcF3d1AcF799bAe67F6e354d685295557cf64761", // vaETH
    "0x539505Dde2B9771dEBE0898a84441c5E7fDF6BC0", // vaUSDC
    "0x2416092f143378750bb29b79eD961ab195CcEea5", // ezETH
  ],
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: TOKENS[options.chain],
    targets: [TREASURY[options.chain]],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Includes all protocol fees from Odyssey.",
    Revenue: "All protocol revenue equals fees.",
    ProtocolRevenue: "All protocol revenue equals fees.",
  },
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.OPTIMISM],
  start: "2025-02-01",
};

export default adapter;