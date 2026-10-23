import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { BridgeChainConfig, bridgeExport } from "../helpers/bridges";
import {
  agglayerBridge, alcorBridge, allbridgeClassicBridge, anubisBridge, aoriBridge, assetChainBridge, cctpBridge, circleGatewayBridge, interportBridge, InterportContracts, celerBridge, connextBridge, coreBitcoinBridge,
  crossCurveBridge, crowdSwapBridge, eclipseBridge, fuseBridge, gnosisBridgeEthereum, gnosisBridgeGnosis,
  helixboxBridge, hopL1Bridge, hopL2Bridge, oftEvents, polygonPosBridge, rainbowBridge,
  rhinoBridge, rootstockTokenBridge, shimmerBridge, stargateBridge, starkgateBridge, symbiosisBridge, synapseBridge, thresholdTbtcBridge,
  universalXBridge, wanBridge, xswapBridge, xyBridge, zkBridge,
} from "../helpers/bridges/config";
import { createFactoryExports } from "./registry";

// the zero address prices as the chain's native gas token
const NATIVE = ADDRESSES.null;

// Interport contracts, same address on every chain they are deployed on
const IP = {
  ae: "0xf9Ce5d10977a75B73F06dF0C37ba6a160736Df6c", // ActionExecutor
  ccipToken: "0x58A6bb60978f8a973585286FdFA8F8dFc1cA2706",
  ccipV2: "0x0772c76c3e4b081e85747f248ed76cc3813d46c4",
  ccipBacked: "0x65c56363eE74947a2FE7E749123F3011C66833d6",
  ccipNative: "0x5E819b8eC7aFe10794661E743B5f073EC31BDA2F",
  cctpV2: "0x674cb5133A2dEaA4aBE86ed56CB7555960966320",
  nonEvm: "0x1E4563bc57Bb1a0b4530aAC4a3455c280e3fc3CE",
};

// Anubis Bridge token ids, from https://app.anubisbridge.com/apiv1/bridge/networks (bridges-server adapter, checked 2026-10-02)
const ANUBIS = {
  DAI: "0xa5e92f3efb6826155f1f728e162af9d7cda33a574a1153b58f03ea01cc37e568",
  USDT: "0x8b1a1d9c2b109e527c9134b25b1a1833b16b6594f92daa9f6d9b7a6024bce9d0",
  USDC: "0xd6aca1be9729c13d677335161321649cccae6a591554772516700f986f942eaa",
  ETH: "0xaaaebeba3810b1e6b70781f14b2d72c1cb89c0b2b320c43bb67ff79f562f5ff4",
  BNB: "0x3ed03c38e59dc60c7b69c2a4bf68f9214acd953252b5a90e8f5f59583e9bc3ae",
  POL: "0x5611acaae5e6f2d151766dae4f93d18a904ae6f9265184ffea692c2e6e52b7fe",
  A: "0x03783fac2efed8fbc9ad443e592ee30e61d65f471140c10ca155e937b435b760",
  sLGNS: "0x72e1c92f962db1ba6ca6185fa3a97457fba2b01901c4edbdbff73619bdae6af9",
  LGNS: "0x1cf326ba9e3dae38fc8d94ea8036a1e5e01be296392125cb64c5aece157c3e74",
};
const ANUBIS_DOMAIN = 6714; // the other chains use their EVM chain id as domain

/**
 * Registry of bridges that are pure configuration: deposit/withdrawal events read with getLogs and/or
 * ERC20 transfers in and out of escrow wallets. Event definitions live in `helpers/bridges/config.ts`;
 * this file holds addresses, chains and start dates only. One-sided bridges list only the chain they
 * emit on; the destination leg is attributed server-side from the bridge's declared destination chain.
 */
// chain keys map to BridgeChainConfig; `doublecounted` marks bridges whose transfers another tracked listing also counts
// OP-stack canonical bridges (optimism, base, mode, mint, manta) live in factory/opStackBridges.ts
const configs: Record<string, { [chain: string]: BridgeChainConfig | boolean }> = {
  "cbridge": {
    [CHAIN.ETHEREUM]: celerBridge({ pool: ["0x5427FEFA711Eff984124bFBB1AB6fbf5E3DA1820"], vaultV1: ["0xB37D31b2A74029B5951a2778F959282E2D518595"], vaultV2: ["0x7510792A3B1969F9307F3845CE88e39578f2bAE1"], peggedV1: ["0x16365b45EB269B5B5dACB34B4a15399Ec79b95eB"], peggedV2: ["0x52E4f244f380f8fA51816c8a10A63105dd4De084"] }, "2021-11-21"), // cBridge 2.0 launch; younger chains below use the first day the old bridges DB has activity for them, Flow uses the Flow EVM mainnet launch
    [CHAIN.POLYGON]: celerBridge({ pool: ["0x88DCDC47D2f83a99CF0000FDF667A468bB958a78"], vaultV1: ["0xc1a2D967DfAa6A10f3461bc21864C23C1DD51EeA"], vaultV2: ["0x4C882ec256823eE773B25b414d36F92ef58a7c0C"], peggedV1: ["0x4d58FDC7d0Ee9b674F49a0ADE11F26C3c9426F7A"], peggedV2: ["0xb51541df05DE07be38dcfc4a80c05389A54502BB"] }),
    [CHAIN.FANTOM]: celerBridge({ pool: ["0x374B8a9f3eC5eB2D97ECA84Ea27aCa45aa1C57EF"], vaultV1: ["0x7D91603E79EA89149BAf73C9038c51669D8F03E9"], peggedV1: ["0x38D1e20B0039bFBEEf4096be00175227F8939E51"], peggedV2: ["0x30F7Aa65d04d289cE319e88193A33A8eB1857fb9"] }),
    [CHAIN.AVAX]: celerBridge({ pool: ["0xef3c714c9425a8F3697A9C969Dc1af30ba82e5d4"], vaultV1: ["0x5427FEFA711Eff984124bFBB1AB6fbf5E3DA1820"], vaultV2: ["0xb51541df05DE07be38dcfc4a80c05389A54502BB"], peggedV1: ["0x88DCDC47D2f83a99CF0000FDF667A468bB958a78"], peggedV2: ["0xb774C6f82d1d5dBD36894762330809e512feD195"] }),
    [CHAIN.BSC]: celerBridge({ pool: ["0xdd90E5E87A2081Dcf0391920868eBc2FFB81a1aF"], vaultV1: ["0x78bc5Ee9F11d133A08b331C2e18fE81BE0Ed02DC"], vaultV2: ["0x11a0c9270D88C99e221360BCA50c2f6Fda44A980"], peggedV1: ["0xd443FE6bf23A4C9B78312391A30ff881a097580E"], peggedV2: ["0x26c76F7FeF00e02a5DD4B5Cc8a0f717eB61e1E4b"] }),
    [CHAIN.ARBITRUM]: celerBridge({ pool: ["0x1619DE6B6B20eD217a58d00f37B9d47C7663feca"], vaultV1: ["0xFe31bFc4f7C9b69246a6dc0087D91a91Cb040f76"], vaultV2: ["0xEA4B1b0aa3C110c55f650d28159Ce4AD43a4a58b"], peggedV1: ["0xbdd2739AE69A054895Be33A22b2D2ed71a1DE778"] }),
    [CHAIN.OPTIMISM]: celerBridge({ pool: ["0x9D39Fc627A6d9d9F8C831c16995b209548cc3401"], vaultV1: ["0xbCfeF6Bb4597e724D720735d32A9249E0640aA11"], peggedV1: ["0x61f85fF2a2f4289Be4bb9B72Fc7010B3142B5f41"] }),
    [CHAIN.XDAI]: celerBridge({ pool: ["0x3795C36e7D12A8c252A20C5a7B455f7c57b60283"], peggedV1: ["0xd4c058380D268d85bC7c758072f561e8f2dB5975"] }),
    [CHAIN.AURORA]: celerBridge({ pool: ["0x841ce48F9446C8E281D3F1444cB859b4A6D0738C"], vaultV2: ["0xbCfeF6Bb4597e724D720735d32A9249E0640aA11"], peggedV1: ["0x4384d5a9D7354C65cE3aee411337bd40493Ad1bC"], peggedV2: ["0xbdd2739AE69A054895Be33A22b2D2ed71a1DE778"] }),
    [CHAIN.CELO]: celerBridge({ pool: ["0xBB7684Cc5408F4DD0921E5c2Cadd547b8f1AD573"], peggedV1: ["0xDA1DD66924B0470501aC7736372d4171cDd1162E"] }),
    [CHAIN.KLAYTN]: celerBridge({ pool: ["0x4c882ec256823ee773b25b414d36f92ef58a7c0c"], peggedV2: ["0xb3833Ecd19D4Ff964fA7bc3f8aC070ad5e360E56"] }),
    [CHAIN.ERA]: celerBridge({ pool: ["0x54069e96C4247b37C2fbd9559CA99f08CD1CD66c"] }, "2024-02-05"),
    [CHAIN.POLYGON_ZKEVM]: celerBridge({ pool: ["0xD46F8E428A06789B5884df54E029e738277388D1"] }, "2024-02-05"),
    [CHAIN.LINEA]: celerBridge({ pool: ["0x9B36f165baB9ebe611d491180418d8De4b8f3a1f"] }, "2023-12-15"),
    [CHAIN.SCROLL]: celerBridge({ pool: ["0x9B36f165baB9ebe611d491180418d8De4b8f3a1f"] }, "2023-12-15"),
    [CHAIN.BASE]: celerBridge({ pool: ["0x7d43AABC515C356145049227CeE54B608342c0ad"] }, "2023-12-26"),
    [CHAIN.MANTA]: celerBridge({ pool: ["0x9B36f165baB9ebe611d491180418d8De4b8f3a1f"] }, "2024-02-01"),
    [CHAIN.MOONBEAM]: celerBridge({ pool: ["0x841ce48F9446C8E281D3F1444cB859b4A6D0738C"] }, "2024-02-21"),
    [CHAIN.FLOW]: celerBridge({ peggedV2: ["0xBB7684Cc5408F4DD0921E5c2Cadd547b8f1AD573"] }, "2024-09-04"),
  },
  // Start dates below are the first day the old bridges server recorded activity for the chain.
  // Chains it tracked with zero lifetime volume are left out.
  "circle": {
    [CHAIN.ETHEREUM]: cctpBridge({ v1: "0xBd3fa81B58Ba92a82136038B25aDec7066af3155", v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2024-01-21"),
    [CHAIN.OPTIMISM]: cctpBridge({ v1: "0x2B4069517957735bE00ceE0fadAE88a26365528f", v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2024-01-21"),
    [CHAIN.POLYGON]: cctpBridge({ v1: "0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE", v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2024-01-21"),
    [CHAIN.BASE]: cctpBridge({ v1: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962", v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2024-01-21"),
    [CHAIN.ARBITRUM]: cctpBridge({ v1: "0x19330d10D9Cc8751218eaf51E8885D058642E08A", v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2024-01-21"),
    [CHAIN.AVAX]: cctpBridge({ v1: "0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982", v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2024-01-21"),
    [CHAIN.MONAD]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.UNICHAIN]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.LINEA]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.SONIC]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.WC]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.XDC]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.HYPERLIQUID]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.INK]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2025-12-02"),
    [CHAIN.ARC]: cctpBridge({ v2: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" }, "2026-09-20"),
    // [CHAIN.SEI]: no recorded volume
    // codex: no CHAIN key / RPC yet, no recorded volume
  },
  // Circle Gateway; the number is each chain's Circle domain id
  "circle-gateway": {
    [CHAIN.ETHEREUM]: circleGatewayBridge(0, "2026-07-02"),
    [CHAIN.AVAX]: circleGatewayBridge(1, "2026-07-02"),
    [CHAIN.OPTIMISM]: circleGatewayBridge(2, "2026-07-02"),
    [CHAIN.ARBITRUM]: circleGatewayBridge(3, "2026-07-02"),
    [CHAIN.BASE]: circleGatewayBridge(6, "2026-07-02"),
    [CHAIN.POLYGON]: circleGatewayBridge(7, "2026-07-02"),
    [CHAIN.UNICHAIN]: circleGatewayBridge(10, "2026-07-02"),
    [CHAIN.SONIC]: circleGatewayBridge(13, "2026-07-02"),
    [CHAIN.WC]: circleGatewayBridge(14, "2026-07-02"),
    [CHAIN.HYPERLIQUID]: circleGatewayBridge(19, "2026-07-02"),
    [CHAIN.ARC]: circleGatewayBridge(26, "2026-09-20"),
  },
  // every route has Anubis as one end
  "anubis-bridge": {
    [CHAIN.ANUBI]: anubisBridge({
      [ANUBIS.DAI]: ADDRESSES.anubi.DAI,
      [ANUBIS.USDT]: ADDRESSES.anubi.USDT,
      [ANUBIS.USDC]: "0x7DD9c7cBC32dF500Fa3C06fD60Cd62C4E97B2eEF",
      [ANUBIS.ETH]: "0xCA326ae4fE47d07e7D20421170DADAcD92eD694C",
      [ANUBIS.BNB]: "0x699D13487Ed6b78953da2750887B58Ef738f9636",
      [ANUBIS.POL]: "0x72cf15f74657Bb00dd1D8Dd475248dEe644F689A",
      [ANUBIS.A]: "0xA921267c56B3a57696d6Fd7949c9FaD0A8E0c177",
      [ANUBIS.sLGNS]: "0x1381e2028454fE59AD81FDe5860D87ba4CD9d0f7",
    }, [1, 56, 137], {
      // LGNS on Anubis (0x5EC79c27323943B420F91D501ac9F627B84A36D9) is unpriced; priced as Polygon LGNS, 9 decimals on both
      [CHAIN.POLYGON]: { [ANUBIS.LGNS]: "0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01" },
    }, "2026-10-13"),
    [CHAIN.ETHEREUM]: anubisBridge({
      [ANUBIS.DAI]: ADDRESSES.ethereum.DAI,
      [ANUBIS.USDT]: ADDRESSES.ethereum.USDT,
      [ANUBIS.USDC]: ADDRESSES.ethereum.USDC,
      [ANUBIS.ETH]: NATIVE,
    }, [ANUBIS_DOMAIN], {}, "2026-10-13"),
    [CHAIN.POLYGON]: anubisBridge({
      [ANUBIS.DAI]: ADDRESSES.polygon.DAI,
      [ANUBIS.USDT]: ADDRESSES.polygon.USDT,
      [ANUBIS.USDC]: ADDRESSES.polygon.USDC_CIRCLE,
      [ANUBIS.POL]: NATIVE,
      [ANUBIS.A]: "0x6631eE651DA438Db2BE611B5A44dFE2Ca04590C5",
      [ANUBIS.sLGNS]: "0x99a57E6C8558BC6689f894e068733ADf83C19725",
      [ANUBIS.LGNS]: "0xeB51D9A39AD5EEF215dC0Bf39a8821ff804A0F01",
    }, [ANUBIS_DOMAIN], {}, "2026-10-13"),
    [CHAIN.BSC]: anubisBridge({
      [ANUBIS.DAI]: ADDRESSES.bsc.DAI,
      [ANUBIS.USDT]: ADDRESSES.bsc.USDT,
      [ANUBIS.USDC]: ADDRESSES.bsc.USDC,
      [ANUBIS.BNB]: NATIVE,
    }, [ANUBIS_DOMAIN], {}, "2026-10-13"),
  },
  // Interport; contract sets per chain from bridges-server's interport-finance/constants.ts
  "interport": Object.fromEntries(([
    [CHAIN.ETHEREUM, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2, ccipBacked: IP.ccipBacked, ccipNative: { bridge: IP.ccipNative, weth: ADDRESSES.ethereum.WETH }, cctpV2: IP.cctpV2, nonEvm: IP.nonEvm }],
    [CHAIN.ARBITRUM, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2, ccipBacked: IP.ccipBacked, ccipNative: { bridge: IP.ccipNative, weth: ADDRESSES.arbitrum.WETH }, nonEvm: IP.nonEvm }],
    [CHAIN.BSC, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2 }],
    [CHAIN.BASE, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2, ccipNative: { bridge: IP.ccipNative, weth: ADDRESSES.optimism.WETH_1 }, cctpV2: IP.cctpV2, nonEvm: IP.nonEvm }],
    [CHAIN.OPTIMISM, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2, ccipNative: { bridge: IP.ccipNative, weth: ADDRESSES.optimism.WETH_1 }, cctpV2: IP.cctpV2, nonEvm: IP.nonEvm }],
    [CHAIN.AVAX, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2, ccipBacked: IP.ccipBacked, cctpV2: IP.cctpV2, nonEvm: IP.nonEvm }],
    [CHAIN.POLYGON, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipBacked: IP.ccipBacked, nonEvm: IP.nonEvm }],
    [CHAIN.LINEA, "2023-12-13", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2, cctpV2: IP.cctpV2 }],
    [CHAIN.SCROLL, "2023-12-13", { actionExecutor: IP.ae, ccipV2: IP.ccipV2 }],
    [CHAIN.ERA, "2023-12-13", { ccipToken: "0xfe155590D15EE42911FaE4C64faC6c2280fEC13F" }],
    [CHAIN.SONIC, "2025-04-14", { actionExecutor: IP.ae, ccipToken: IP.ccipToken, ccipV2: IP.ccipV2, cctpV2: IP.cctpV2 }],
    [CHAIN.SONEIUM, "2025-04-15", { actionExecutor: IP.ae, ccipToken: IP.ccipToken }],
    [CHAIN.BERACHAIN, "2025-04-16", { actionExecutor: IP.ae, ccipToken: IP.ccipToken }],
    [CHAIN.BOB, "2025-04-19", { ccipToken: IP.ccipToken }],
    [CHAIN.HEMI, "2025-06-15", { actionExecutor: IP.ae }],
    [CHAIN.RONIN, "2025-08-16", { ccipToken: IP.ccipToken }],
    // polygon_zkevm: RPC frozen; eon, fantom: inactive since 2024, no contract in the current config; chains under $10k lifetime left out
  ] as [string, string, InterportContracts][]).map(([chain, start, contracts]) => [chain, interportBridge(contracts, start)])),
  "synapse": {
    [CHAIN.ETHEREUM]: synapseBridge({ bridge: "0x2796317b0fF8538F253012862c06787Adfb8cEb6", rfq: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E" }, "2022-10-25"),
    [CHAIN.ARBITRUM]: synapseBridge({ bridge: "0x6F4e8eBa4D337f874Ab57478AcC2Cb5BACdc19c9", rfq: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E" }, "2022-10-25"),
    [CHAIN.BSC]: synapseBridge({ bridge: "0xd123f70AE324d34A9E76b67a27bf77593bA8749f", rfq: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E" }, "2022-10-25"),
    [CHAIN.OPTIMISM]: synapseBridge({ bridge: "0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b", rfq: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E" }, "2022-10-25"),
    [CHAIN.BASE]: synapseBridge({ bridge: "0xf07d1C752fAb503E47FEF309bf14fbDD3E867089", rfq: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E" }, "2023-09-03"),
    [CHAIN.BLAST]: synapseBridge({ bridge: "0x55769baf6ec39b3bf4aae948eb890ea33307ef3c", rfq: "0x34F52752975222d5994C206cE08C1d5B329f24dD" }, "2024-05-13"),
    [CHAIN.AVAX]: synapseBridge({ bridge: "0xC05e61d0E7a63D27546389B7aD62FdFf5A91aACE" }, "2022-10-25"),
    [CHAIN.POLYGON]: synapseBridge({ bridge: "0x8F5BBB2BB8c2Ee94639E55d5F41de9b4839C1280" }, "2022-10-25"),
    [CHAIN.FANTOM]: synapseBridge({ bridge: "0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b" }, "2022-10-25"),
    [CHAIN.AURORA]: synapseBridge({ bridge: "0xaeD5b25BE1c3163c907a471082640450F928DDFE" }, "2022-11-04"),
    [CHAIN.METIS]: synapseBridge({ bridge: "0x06Fea8513FF03a0d3f61324da709D4cf06F42A5c" }, "2023-10-13"),
    [CHAIN.MOONBEAM]: synapseBridge({ bridge: "0x84A420459cd31C3c34583F67E0f0fB191067D32f" }, "2023-06-25"),
    [CHAIN.MOONRIVER]: synapseBridge({ bridge: "0xaeD5b25BE1c3163c907a471082640450F928DDFE" }, "2023-06-25"),
    [CHAIN.SCROLL]: synapseBridge({ bridge: "0x5523D3c98809DdDB82C686E152F5C58B1B0fB59E" }, "2024-06-22"),
    [CHAIN.LINEA]: synapseBridge({ bridge: "0x34F52752975222d5994C206cE08C1d5B329f24dD" }, "2024-08-06"),
  },
  "symbiosis": {
    [CHAIN.ETHEREUM]: symbiosisBridge({ portal: "0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8", synthesis: "0xD7c3DF25683871d18BC838E4F619126442Dd38B3" }, "2023-06-14"),
    [CHAIN.BSC]: symbiosisBridge({ portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4", synthesis: "0x6B1bbd301782FF636601fC594Cd7Bfe74871bfaA" }, "2023-06-14"),
    [CHAIN.AVAX]: symbiosisBridge({ portal: "0xE75C7E85FE6ADd07077467064aD15847E6ba9877" }, "2023-06-14"),
    [CHAIN.POLYGON]: symbiosisBridge({ portal: "0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8" }, "2023-06-14"),
    [CHAIN.BOBA]: symbiosisBridge({ portal: "0xb8f275fBf7A959F4BCE59999A2EF122A099e81A8" }, "2023-08-19"),
    [CHAIN.ERA]: symbiosisBridge({ portal: "0x4f5456d4d0764473DfCA1ffBB8524C151c4F19b9", synthesis: "0x07bffC25011901CB01a00127518A154b47eB6e80" }, "2023-08-12"),
    [CHAIN.ARBITRUM]: symbiosisBridge({ portal: "0x01A3c8E513B758EBB011F7AFaf6C37616c9C24d9", synthesis: "0x326adbE46D7E6C1B3927e9309B96DF478bda6D16" }, "2023-06-14"),
    [CHAIN.OPTIMISM]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2023-07-14"),
    [CHAIN.POLYGON_ZKEVM]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2023-08-12"),
    [CHAIN.LINEA]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2023-08-24"),
    [CHAIN.MANTLE]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2023-08-24"),
    [CHAIN.BASE]: symbiosisBridge({ portal: "0xEE981B2459331AD268cc63CE6167b446AF4161f8", synthesis: "0x9F6424FE88fBe7785Fa34F0E369F192bF38E7A6e" }, "2023-08-24"),
    [CHAIN.SCROLL]: symbiosisBridge({ portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" }, "2023-11-22"),
    [CHAIN.MANTA]: symbiosisBridge({ portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" }, "2023-11-22"),
    [CHAIN.METIS]: symbiosisBridge({ portal: "0xd8db4fb1fEf63045A443202d506Bcf30ef404160" }, "2024-03-26"),
    [CHAIN.MODE]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2024-03-26"),
    [CHAIN.ROOTSTOCK]: symbiosisBridge({ portal: "0x5aa5f7f84ed0e5db0a4a85c3947ea16b53352fd4", synthesis: "0xf8504d2ca2f0bbad9d36927e3d32e278abadada0" }, "2024-03-26"),
    [CHAIN.MERLIN]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2024-05-20"),
    [CHAIN.ZKLINK]: symbiosisBridge({ portal: "0x8Dc71561414CDcA6DcA7C1dED1ABd04AF474D189" }, "2024-05-20"),
    [CHAIN.TAIKO]: symbiosisBridge({ portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" }, "2024-07-23"),
    [CHAIN.CRONOS]: symbiosisBridge({ portal: "0xE75C7E85FE6ADd07077467064aD15847E6ba9877" }, "2024-12-11"),
    [CHAIN.FRAXTAL]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2024-12-11"),
    [CHAIN.GRAVITY]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2024-12-11"),
    [CHAIN.BSQUARED]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2024-12-19"),
    [CHAIN.CRONOS_ZKEVM]: symbiosisBridge({ portal: "0x2E818E50b913457015E1277B43E469b63AC5D3d7" }, "2025-02-19"),
    [CHAIN.SONIC]: symbiosisBridge({ portal: "0xE75C7E85FE6ADd07077467064aD15847E6ba9877" }, "2025-02-19"),
    [CHAIN.ABSTRACT]: symbiosisBridge({ portal: "0x8Dc71561414CDcA6DcA7C1dED1ABd04AF474D189" }, "2025-02-19"),
    [CHAIN.XDAI]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2025-02-19"),
    [CHAIN.BERACHAIN]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2025-02-19"),
    [CHAIN.UNICHAIN]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2025-08-17"),
    [CHAIN.SONEIUM]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2025-08-17"),
    [CHAIN.OP_BNB]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2025-08-17"),
    [CHAIN.KATANA]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2025-09-23"),
    [CHAIN.MONAD]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2026-03-07"),
    [CHAIN.PLASMA]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2026-03-08"),
    [CHAIN.APECHAIN]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2026-03-09"),
    [CHAIN.HYPERLIQUID]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2026-03-10"),
    [CHAIN.QUAI]: symbiosisBridge({ portal: "0x003d9F9666853fD4A10351FF5364c602470A7cF6", synthesis: "0x004E53ED63b674B1e64Bed32eF037e1f94fc1996" }, "2026-08-02"),
    [CHAIN.TEMPO]: symbiosisBridge({ portal: "0x5Aa5f7f84eD0E5db0a4a85C3947eA16B53352FD4" }, "2026-08-06"),
    [CHAIN.ROBINHOOD]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2026-09-13"),
    [CHAIN.STABLE]: symbiosisBridge({ portal: "0x292fC50e4eB66C3f6514b9E402dBc25961824D62" }, "2026-09-16"),
    // tron events report hex token addresses, tron prices are keyed by base58
    [CHAIN.TRON]: symbiosisBridge({ portal: "0xd83b5752b42856a08087748de6095af0be52d299" }, "2026-03-05", {
      "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c": ADDRESSES.tron.USDT, // USDT
    }),
    // symbiosis chain (synthesis 0x45CFd6FB7999328F189aaD2739Fba4Be6C45E5bf): no CHAIN key / RPC, no recorded volume
    // telos, morph: under $1k lifetime volume; sei, goat, citrea: no recorded volume
  },
  "crosscurve": {
    [CHAIN.POLYGON]: crossCurveBridge("2023-09-14"),
    [CHAIN.AVAX]: crossCurveBridge("2023-09-14"),
    [CHAIN.OPTIMISM]: crossCurveBridge("2023-09-15"),
    [CHAIN.ARBITRUM]: crossCurveBridge("2023-09-16"),
    [CHAIN.BSC]: crossCurveBridge("2023-09-17"),
    [CHAIN.ETHEREUM]: crossCurveBridge("2023-10-17"),
    [CHAIN.BASE]: crossCurveBridge("2024-07-01"),
    [CHAIN.XDAI]: crossCurveBridge("2024-07-01"),
    [CHAIN.FANTOM]: crossCurveBridge("2024-09-10"),
    [CHAIN.BLAST]: crossCurveBridge("2024-10-02"),
    [CHAIN.LINEA]: crossCurveBridge("2024-10-02"),
    [CHAIN.TAIKO]: crossCurveBridge("2024-10-02"),
    [CHAIN.MANTLE]: crossCurveBridge("2024-10-03"),
    [CHAIN.KAVA]: crossCurveBridge("2024-11-26"),
    [CHAIN.FRAXTAL]: crossCurveBridge("2024-12-06"),
    [CHAIN.METIS]: crossCurveBridge("2024-12-12"),
    [CHAIN.MODE]: crossCurveBridge("2024-12-12"),
    [CHAIN.MANTA]: crossCurveBridge("2025-03-27"),
    [CHAIN.SONIC]: crossCurveBridge("2025-03-27"),
    [CHAIN.CELO]: crossCurveBridge("2025-04-18"),
  },
  "rhino-fi": {
    [CHAIN.ETHEREUM]: rhinoBridge("0xbca3039a18c0d2f2f84ba8a028c67290bc045afa", "2025-01-26"),
    [CHAIN.ARBITRUM]: rhinoBridge("0x10417734001162Ea139e8b044DFe28DbB8B28ad0", "2023-09-18"),
    [CHAIN.BSC]: rhinoBridge("0xb80a582fa430645a043bb4f6135321ee01005fef", "2023-09-18"),
    [CHAIN.POLYGON]: rhinoBridge("0xBA4EEE20F434bC3908A0B18DA496348657133A7E", "2023-09-18"),
    [CHAIN.OPTIMISM]: rhinoBridge("0x0bca65bf4b4c8803d2f0b49353ed57caaf3d66dc", "2023-09-18"),
    [CHAIN.BASE]: rhinoBridge("0x2f59e9086ec8130e21bd052065a9e6b2497bb102", "2023-09-18"),
    [CHAIN.ERA]: rhinoBridge("0x1fa66e2b38d0cc496ec51f81c3e05e6a6708986f", "2023-09-18"),
    [CHAIN.POLYGON_ZKEVM]: rhinoBridge("0x65a4b8a0927c7fd899aed24356bf83810f7b9a3f", "2023-09-18"),
    [CHAIN.LINEA]: rhinoBridge("0xcf68a2721394dcf5dcf66f6265c1819720f24528", "2023-09-18"),
    [CHAIN.SCROLL]: rhinoBridge("0x87627c7e586441eef9ee3c28b66662e897513f33", "2023-10-19"),
    [CHAIN.MANTA]: rhinoBridge("0x2b4553122d960ca98075028d68735cc6b15deeb5", "2024-06-20"),
    [CHAIN.AVAX]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2024-06-20"),
    [CHAIN.MANTLE]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2024-06-20"),
    [CHAIN.MODE]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2024-06-20"),
    [CHAIN.BLAST]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2024-06-20"),
    [CHAIN.XLAYER]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2024-06-20"),
    [CHAIN.TAIKO]: rhinoBridge("0x1df2de291f909baa50c1456c87c71edf9fb199d5", "2024-07-20"),
    [CHAIN.OP_BNB]: rhinoBridge("0x2b4553122d960ca98075028d68735cc6b15deeb5", "2024-11-02"),
    [CHAIN.ZIRCUIT]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2025-01-15"),
    [CHAIN.SONIC]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2025-02-10"),
    [CHAIN.INK]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2025-02-11"),
    [CHAIN.ARC]: rhinoBridge("0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1", "2026-09-20"),
    // apechain (0x5e023c31e1d3dcd08a1b3e8c96f6ef8aa8fcacd1), cronos_zkevm (0xdd6a084b563731be8ed039df29fa73bebdaaea2c): no recorded volume
    // starknet, paradex, ton, tron, solana: non-EVM, need their own source
  },
  "connext": {
    [CHAIN.ETHEREUM]: connextBridge("0x8898B472C54c31894e3B9bb83cEA802a5d0e63C6", "2024-03-28"),
    [CHAIN.OPTIMISM]: connextBridge("0x8f7492DE823025b4CfaAB1D34c58963F2af5DEDA", "2024-03-28"),
    [CHAIN.POLYGON]: connextBridge("0x11984dc4465481512eb5b777E44061C158CF2259", "2024-03-28"),
    [CHAIN.ARBITRUM]: connextBridge("0xEE9deC2712cCE65174B561151701Bf54b99C24C8", "2024-03-28"),
    [CHAIN.BSC]: connextBridge("0xCd401c10afa37d641d2F594852DA94C700e4F2CE", "2024-03-28"),
    [CHAIN.XDAI]: connextBridge("0x5bB83e95f63217CDa6aE3D181BA580Ef377D2109", "2024-03-28"),
    [CHAIN.LINEA]: connextBridge("0xa05eF29e9aC8C75c530c2795Fa6A800e188dE0a9", "2024-03-28"),
    [CHAIN.BASE]: connextBridge("0xB8448C6f7f7887D36DcA487370778e419e9ebE3F", "2024-03-28"),
    [CHAIN.METIS]: connextBridge("0x6B142227A277CE62808E0Df93202483547Ec0188", "2024-03-28"),
    [CHAIN.MODE]: connextBridge("0x7380511493DD4c2f1dD75E9CCe5bD52C787D4B51", "2024-03-28"),
  },
  "crowdswap": {
    [CHAIN.ARBITRUM]: crowdSwapBridge("2024-09-12"),
    [CHAIN.BSC]: crowdSwapBridge("2024-09-12"),
    [CHAIN.OPTIMISM]: crowdSwapBridge("2024-09-12"),
    [CHAIN.POLYGON]: crowdSwapBridge("2024-09-12"),
    [CHAIN.ETHEREUM]: crowdSwapBridge("2024-09-13"),
    [CHAIN.BASE]: crowdSwapBridge("2025-01-22"),
  },
  "fuse-bridge": {
    [CHAIN.ETHEREUM]: fuseBridge({ native: "0x95f51f18212c6bCFfB819fDB2035E5757954B7B9" }, "2024-03-08"),
    [CHAIN.BSC]: fuseBridge({ native: "0x081dF5af5d022D4A4a4520D4D0D336B8432fDBBb" }, "2024-03-08"),
    [CHAIN.POLYGON]: fuseBridge({ wrapped: "0xe453d6649643F1F460C371dC3D1da98F7922fe51", native: "0x8f5D6332eD11338D2dA4fAAC6675e9A6757BeC8b" }, "2024-03-08"),
    [CHAIN.ARBITRUM]: fuseBridge({ wrapped: "0xe453d6649643F1F460C371dC3D1da98F7922fe51", native: "0x081dF5af5d022D4A4a4520D4D0D336B8432fDBBb" }, "2024-03-08"),
    [CHAIN.OPTIMISM]: fuseBridge({ wrapped: "0xEEd9154F63f6F0044E6b00dDdEFD895b5B4ED580", native: "0x081dF5af5d022D4A4a4520D4D0D336B8432fDBBb" }, "2024-03-08"),
  },
  // only the ShimmerEVM side is tracked; the other chains' leg is attributed server-side (destinationChain: shimmer_evm)
  // disabled: no working RPC for shimmer_evm (block lookups 500, no provider configured); history comes from the old bridges DB
  // "shimmerbridge": {
  //   [CHAIN.SHIMMER_EVM]: shimmerBridge("0x9C6D5a71FdD306329287a835e9B8EDb7F0F17898", "2024-01-19"),
  // },
  // one-sided (destinationChain: polygon)
  "polygon-pos-bridge": {
    [CHAIN.ETHEREUM]: polygonPosBridge("2022-10-17"),
  },
  // one-sided on Ethereum (destinationChain: polygon_zkevm); the unified bridge is tracked as agglayer from 2025-09-18
  "polygon-zkevm-bridge": {
    [CHAIN.ETHEREUM]: agglayerBridge("2023-03-25", "2025-09-18"),
  },
  "agglayer": {
    [CHAIN.ETHEREUM]: agglayerBridge("2025-09-18"),
    [CHAIN.POLYGON_ZKEVM]: agglayerBridge("2025-09-18"),
    [CHAIN.KATANA]: agglayerBridge("2025-09-23"),
    // xlayer, ternoa: no recorded volume
  },
  // one-sided (destinationChain: eclipse)
  "eclipse-bridge": {
    [CHAIN.ETHEREUM]: eclipseBridge("2025-02-13"),
  },
  // one-sided (destinationChain: bitcoin)
  "threshold-network": {
    [CHAIN.ETHEREUM]: thresholdTbtcBridge("2024-12-06"),
  },
  // one-sided (destinationChain: bitcoin)
  "core-bitcoin-bridge": {
    [CHAIN.AVAX]: coreBitcoinBridge("2024-06-30"),
  },
  // Citrea token bridges (USDC.e, USDT.e, WBTC.e); Ethereum side are OFT adapters locking the canonical token
  "citrea-token-bridges": {
    doublecounted: true, // OFT transfers, also counted by bridges/layerzero.ts
    [CHAIN.ETHEREUM]: {
      start: "2026-05-16",
      events: [
        ...oftEvents("0xdaa289CC487Cf95Ba99Db62f791c7E2d2a4b868E", ADDRESSES.ethereum.USDC), // USDC
        ...oftEvents("0x6925ccD29e3993c82a574CED4372d8737C6dbba6", ADDRESSES.ethereum.USDT), // USDT
        ...oftEvents("0x2c01390E10e44C968B73A7BcFF7E4b4F50ba76Ed", ADDRESSES.ethereum.WBTC), // WBTC
      ],
    },
    [CHAIN.CITREA]: {
      start: "2026-05-16",
      events: [
        ...oftEvents("0x41710804caB0974638E1504DB723D7bddec22e30", ADDRESSES.citrea.USDC_E), // USDC.e
        ...oftEvents("0xF8b5983BFa11dc763184c96065D508AE1502C030", ADDRESSES.citrea.USDT_E), // USDT.e
        ...oftEvents(ADDRESSES.citrea.WBTC_E, ADDRESSES.citrea.WBTC_E), // WBTC.e, the OFT is the token
      ],
    },
  },
  // Only the Asset Chain side: the old adapter's contracts on the other chains were token addresses and never matched
  "asset-chain-bridge": {
    [CHAIN.ASSETCHAIN]: assetChainBridge([
      { bridge: "0xA6c8B33edD4894E42d0C5585fEC52aAC6FF9147d", token: "0x2B7C1342Cc64add10B2a79C8f9767d2667DE64B2" },
      { bridge: "0x08d4a11Fb4fFE7022deBbBbcBb7444005B09a2FC", token: "0xDBDc8c7B96286899aB624F6a59dd0250DD4Ce9bC" },
      { bridge: "0x196434734f09DFE6D479b5a248a45cfbe516382a", token: "0x26E490d30e73c36800788DC6d6315946C4BbEa24" },
      { bridge: "0x8D03A4E2dBfbf13043Bde6278658EFfCE6FE6b02", token: "0xEc6943BB984AED25eC96986898721a7f8aB6212E" },
    ], "2025-05-07"),
  },
  "gnosis-bridge": {
    [CHAIN.ETHEREUM]: gnosisBridgeEthereum("2022-11-01"),
    [CHAIN.XDAI]: gnosisBridgeGnosis("2022-11-01"),
  },
  "allbridge-classic": {
    [CHAIN.ETHEREUM]: allbridgeClassicBridge("2022-11-23"),
    [CHAIN.BSC]: allbridgeClassicBridge("2022-11-23"),
    [CHAIN.AVAX]: allbridgeClassicBridge("2022-12-15"),
    [CHAIN.POLYGON]: allbridgeClassicBridge("2022-12-15"),
    [CHAIN.FANTOM]: allbridgeClassicBridge("2022-12-16"),
  },
  "xswap": {
    [CHAIN.ETHEREUM]: xswapBridge("2024-04-22"),
    [CHAIN.POLYGON]: xswapBridge("2024-04-22"),
    [CHAIN.AVAX]: xswapBridge("2024-04-22"),
    [CHAIN.ARBITRUM]: xswapBridge("2024-04-22"),
    [CHAIN.OPTIMISM]: xswapBridge("2024-04-22"),
    [CHAIN.BASE]: xswapBridge("2024-04-22"),
  },
  "aori": {
    [CHAIN.ETHEREUM]: aoriBridge("0x0736bdc975af0675b9a045384efed91360d25479", "2026-04-01"),
    [CHAIN.BASE]: aoriBridge("0xc6868edf1d2a7a8b759856cb8afa333210dfeda6", "2026-04-01"),
    [CHAIN.ARBITRUM]: aoriBridge("0xc6868edf1d2a7a8b759856cb8afa333210dfeda6", "2026-04-01"),
    [CHAIN.OPTIMISM]: aoriBridge("0xc6868edf1d2a7a8b759856cb8afa333210dfeda6", "2026-04-01"),
    [CHAIN.BSC]: aoriBridge("0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8", "2026-04-01"),
    [CHAIN.MONAD]: aoriBridge("0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8", "2026-04-01"),
    [CHAIN.STABLE]: aoriBridge("0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8", "2026-04-01"),
    [CHAIN.MEGAETH]: aoriBridge("0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8", "2026-04-02"),
    [CHAIN.PLASMA]: aoriBridge("0xffe691a6ddb5d2645321e0a920c2e7bdd00dd3d8", "2026-04-04"),
  },
  "helixbox": {
    [CHAIN.ARBITRUM]: helixboxBridge("0xbA5D580B18b6436411562981e02c8A9aA1776D10", "2024-06-24"),
    [CHAIN.OPTIMISM]: helixboxBridge("0xbA5D580B18b6436411562981e02c8A9aA1776D10", "2024-07-05"),
    [CHAIN.BSC]: helixboxBridge("0xbA5D580B18b6436411562981e02c8A9aA1776D10", "2024-08-20"),
    [CHAIN.POLYGON]: helixboxBridge("0xbA5D580B18b6436411562981e02c8A9aA1776D10", "2024-08-21"),
    // [CHAIN.DARWINIA]: helixboxBridge("0xbA5D580B18b6436411562981e02c8A9aA1776D10", "2024-09-25"), // block lookups for darwinia return 500, re-enable once the chain has a working block source
    [CHAIN.BASE]: helixboxBridge("0xbA5D580B18b6436411562981e02c8A9aA1776D10", "2024-10-04"),
    // linea, scroll, mantle, xdai, moonbeam, avax, blast, morph: under $10k lifetime volume
  },
  "universalx": {
    [CHAIN.ETHEREUM]: universalXBridge("0x3762A79B34DfB6774CFd45dBf5FD9A2780873783", "2025-01-11"),
    [CHAIN.ARBITRUM]: universalXBridge("0x5f77b1Fe53ba406B0ac3EF10c007A7b16e9F04F6", "2025-01-11"),
    [CHAIN.OPTIMISM]: universalXBridge("0x5535df3a1f2b2Ce2Eb3b6673638833420bc79CAd", "2025-01-11"),
    [CHAIN.BASE]: universalXBridge("0x73791161B3D3A6FEdF2b17Fb79810b277C5ce517", "2025-01-11"),
    [CHAIN.BSC]: universalXBridge("0x9cEA88Ee39b6cc09C478942Bbf83bfa77d87B5f3", "2025-01-11"),
    [CHAIN.POLYGON]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-01-11"),
    [CHAIN.AVAX]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-01-11"),
    [CHAIN.LINEA]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-01-11"),
    [CHAIN.BLAST]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-01-11"),
    [CHAIN.MANTA]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-01-11"),
    [CHAIN.MODE]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-01-11"),
    [CHAIN.MERLIN]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-01-12"),
    [CHAIN.SONIC]: universalXBridge("0xDE5af64Abc426d63C3BcF13D8f672948227A745a", "2025-03-06"),
    [CHAIN.BERACHAIN]: universalXBridge("0x868AEE71897d294B88eB109293949172Fd6CbFCe", "2025-03-06"),
    // conflux: under $10k lifetime volume; solana: non-EVM
  },
  // Escrow-wallet bridges: ERC20 transfers into the wallets are deposits, out of them withdrawals.
  // one-sided (destinationChain: avalanche); the bridge wallet is an EOA, native ETH is not captured
  "avalanche-bridge": {
    [CHAIN.ETHEREUM]: { start: "2022-10-17", transfers: { wallets: ["0x8EB8a3b98659Cce290402893d0123abb75E3ab28"] } },
  },
  // one-sided (destinationChain: hyperliquid), Bridge2 on Arbitrum
  "hyperliquid-bridge": {
    [CHAIN.ARBITRUM]: { start: "2024-12-03", transfers: { wallets: ["0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7"] } },
  },
  // one-sided (destinationChain: lighter)
  "lighter-bridge": {
    [CHAIN.ETHEREUM]: { start: "2025-03-26", transfers: { wallets: ["0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7"] } },
  },
  // one-sided (destinationChain: movement); one escrow per asset (MOVE, USDC, USDT, WETH, WBTC)
  "movement": {
    [CHAIN.ETHEREUM]: {
      start: "2025-04-23",
      transfers: { wallets: ["0xf1df43a3053cd18e477233b59a25fc483c2cbe0f", "0xc209a627a7B0a19F16A963D9f7281667A2d9eFf2", "0x5e87D7e75B272fb7150B4d1a05afb6Bd71474950", "0x06E01cB086fea9C644a2C105A9F20cfC21A526e8", "0xa55688C280E725704CFe8Ea30eD33fE5B91cE6a4"] },
    },
  },
  "pnetwork": {
    [CHAIN.ETHEREUM]: {
      start: "2023-10-30",
      transfers: {
        wallets: ["0xe396757ec7e6ac7c8e5abe7285dde47b98f22db8", "0x112334f50cb6efcff4e35ae51a022dbe41a48135"],
        // low-confidence prices on tokens moved by the billion on 2024-03-31:
        // R-TENSOR 0xd829… (996M tokens, $48.5M) and AiLAYER 0xf41a… (12B tokens, $6M)
        filter: (row: any) => !["0xd829fc7d8de417a5a684d934d5dc981d86395d8a", "0xf41a94f7e87ef728b3f6ba434376b5f7f543c4d3"].includes(String(row.token).toLowerCase()),
      },
    },
    [CHAIN.BSC]: { start: "2023-11-01", transfers: { wallets: ["0x76c96b2b3cf96ee305c759a7cd985eaa67634dfc"] } },
  },
  // Meson pool contract, same address on every chain
  "meson": Object.fromEntries(([
    [CHAIN.ETHEREUM, "2023-07-07"], [CHAIN.POLYGON, "2023-07-07"], [CHAIN.FANTOM, "2023-07-07"], [CHAIN.AVAX, "2023-07-07"],
    [CHAIN.ARBITRUM, "2023-07-07"], [CHAIN.OPTIMISM, "2023-07-07"], [CHAIN.BSC, "2023-07-07"], [CHAIN.AURORA, "2023-09-03"],
    [CHAIN.KAVA, "2023-09-22"], [CHAIN.MOONBEAM, "2024-01-19"], [CHAIN.CRONOS, "2024-01-19"], [CHAIN.POLYGON_ZKEVM, "2024-01-19"],
    [CHAIN.LINEA, "2024-01-19"], [CHAIN.BASE, "2024-01-19"], [CHAIN.METIS, "2024-01-19"], [CHAIN.MANTA, "2024-01-19"],
    [CHAIN.MANTLE, "2024-01-19"], [CHAIN.SCROLL, "2024-01-19"], [CHAIN.CELO, "2024-01-20"], [CHAIN.MERLIN, "2024-05-06"],
    [CHAIN.ZKFAIR, "2024-05-07"], [CHAIN.BSQUARED, "2024-05-10"],
    // era, moonriver, xdai, btr: no meaningful recorded volume
  ] as const).map(([chain, start]) => [chain, {
    start,
    // zkfair RPC is frozen and the chain's last Meson activity was 2026-02-05
    deadFrom: chain === CHAIN.ZKFAIR ? "2026-02-06" : undefined,
    transfers: { wallets: ["0x25aB3Efd52e6470681CE037cD546Dc60726948D3"] },
  }])),
  "usdt0": {
    doublecounted: true, // OFT transfers, also counted by bridges/layerzero.ts
    [CHAIN.ETHEREUM]: { start: "2025-06-04", events: oftEvents("0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee", ADDRESSES.ethereum.USDT) },
    [CHAIN.ARBITRUM]: { start: "2025-06-04", events: oftEvents("0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92", ADDRESSES.arbitrum.USDT) },
    [CHAIN.BERACHAIN]: { start: "2025-06-04", events: oftEvents("0x3Dc96399109df5ceb2C226664A086140bD0379cB", ADDRESSES.xlayer.USDT0) },
    // disabled: no RPC configured for corn
    // [CHAIN.CORN]: { start: "2025-06-04", events: oftEvents("0x3f82943338a8a76c35BFA0c1828aA27fd43a34E4", ADDRESSES.corn.USDT0) },
    [CHAIN.FLARE]: { start: "2025-06-04", events: oftEvents("0x567287d2A9829215a37e3B88843d32f9221E7588", ADDRESSES.flare.USDT0) },
    [CHAIN.HYPERLIQUID]: { start: "2025-06-04", events: oftEvents("0x904861a24F30EC96ea7CFC3bE9EA4B476d237e98", ADDRESSES.corn.USDT0) },
    [CHAIN.INK]: { start: "2025-06-04", events: oftEvents("0x1cB6De532588fCA4a21B7209DE7C456AF8434A65", ADDRESSES.ink.USDT0) },
    [CHAIN.OPTIMISM]: { start: "2025-06-04", events: oftEvents("0xF03b4d9AC1D5d1E7c4cEf54C2A313b9fe051A0aD", "0x01bFF41798a0BcF287b996046Ca68b395DbC1071") },
    [CHAIN.UNICHAIN]: { start: "2025-06-04", events: oftEvents("0xc07bE8994D035631c36fb4a89C918CeFB2f03EC3", "0x9151434b16b9763660705744891fA906F660EcC5") },
    [CHAIN.POLYGON]: { start: "2025-08-28", events: oftEvents("0x6BA10300f0DC58B7a1e4c0e41f5daBb7D7829e13", ADDRESSES.polygon.USDT) },
    [CHAIN.PLASMA]: { start: "2025-09-30", events: oftEvents("0x02ca37966753bDdDf11216B73B16C1dE756A7CF9", ADDRESSES.corn.USDT0) },
    [CHAIN.CONFLUX]: { start: "2025-11-21", events: oftEvents("0xC57efa1c7113D98BdA6F9f249471704Ece5dd84A", "0xaf37E8B6C9ED7f6318979f56Fc287d76c30847ff") },
    [CHAIN.MANTLE]: { start: "2025-11-27", events: oftEvents("0xcb768e263FB1C62214E7cab4AA8d036D76dc59CC", ADDRESSES.xlayer.USDT0) },
    [CHAIN.MONAD]: { start: "2025-11-27", events: oftEvents("0x9151434b16b9763660705744891fA906F660EcC5", ADDRESSES.flare.USDT0) },
    [CHAIN.STABLE]: { start: "2025-12-10", events: oftEvents("0xedaba024be4d87974d5aB11C6Dd586963CcCB027", ADDRESSES.xlayer.USDT0) },
    [CHAIN.MEGAETH]: { start: "2026-01-20", events: oftEvents("0x9151434b16b9763660705744891fA906F660EcC5", ADDRESSES.corn.USDT0) },
    [CHAIN.MORPH]: { start: "2026-02-23", events: oftEvents("0xcb768e263FB1C62214E7cab4AA8d036D76dc59CC", ADDRESSES.flare.USDT0) },
    [CHAIN.HEDERA]: { start: "2026-03-17", events: oftEvents("0xe3119e23fC2371d1E6b01775ba312035425A53d6", "0x00000000000000000000000000000000009Ce723") },
    [CHAIN.TEMPO]: { start: "2026-04-08", events: oftEvents("0xaf37E8B6C9ED7f6318979f56Fc287d76c30847ff", ADDRESSES.tempo.USDT0) },
    [CHAIN.ROOTSTOCK]: { start: "2026-06-23", events: oftEvents("0x1a594d5d5d1c426281C1064B07f23F57B2716B61", ADDRESSES.xlayer.USDT0) },
    // Tron USDT lockbox; tron events report the hex token address, tron prices are keyed by base58
    [CHAIN.TRON]: {
      events: oftEvents("0x3a08f76772e200653bb55c2a92998daca62e0e97", "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c")
        .map((event) => ({ ...event, mapTokens: { "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c": ADDRESSES.tron.USDT } })), // USDT
    },
  },
  "stargate": {
    doublecounted: true, // OFT transfers, also counted by bridges/layerzero.ts
    [CHAIN.ETHEREUM]: stargateBridge({
      v2: [
        ["0xcDafB1b2dB43f366E48e6F614b8DCCBFeeFEEcD3", "0x9E32b13ce7f2E80A01932B42553652E053D6ed8e"], // METIS
        ["0xc026395860Db2d07ee33e05fE50ed7bD583189C7", ADDRESSES.ethereum.USDC], // USDC
        ["0x933597a323Eb81cAe705C5bC29985172fd5A3973", ADDRESSES.ethereum.USDT], // USDT
        ["0x268Ca24DAefF1FaC2ed883c598200CcbB79E931D", ADDRESSES.ethereum.METH], // mETH
        ["0x77b2043768d28E9C9aB44E1aBfC95944bcE57931", ADDRESSES.ethereum.WETH], // WETH
      ],
      v1: [
        ["0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56", ADDRESSES.ethereum.USDC], // USDC
        ["0x38EA452219524Bb87e18dE1C24D3bB59510BD783", ADDRESSES.ethereum.USDT], // USDT
        ["0x430Ebff5E3E80A6C58E7e6ADA1d90F5c28aA116d", ADDRESSES.ethereum.USDT], // m.USDT
        ["0x101816545F6bd2b1076434B54383a1E633390A2E", NATIVE], // SGETH
        ["0x692953e758c3669290cb1677180c64183cEe374e", "0x0c10bf8fcb7bf5412187a595ab97a3609160b5c6"], // USDD
        ["0xd8772edBF88bBa2667ed011542343b0eDDaCDa47", "0x9e32b13ce7f2e80a01932b42553652e053d6ed8e"], // METIS
      ],
      stg: "0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6",
    }, "2022-11-01"),
    [CHAIN.POLYGON]: stargateBridge({
      v2: [["0x9Aa02D4Fae7F58b8E8f34c66E756cC734DAc7fe4", ADDRESSES.polygon.USDC_CIRCLE], ["0xd47b03ee6d86Cf251ee7860FB2ACf9f91B9fD4d7", ADDRESSES.polygon.USDT]],
      v1: [["0x1205f31718499dBf1fCa446663B532Ef87481fe1", ADDRESSES.polygon.USDC], ["0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c", ADDRESSES.polygon.USDT]],
      stg: ADDRESSES.fuse.WETH_3,
    }, "2022-11-01"),
    [CHAIN.AVAX]: stargateBridge({
      v2: [["0x5634c4a5FEd09819E3c46D86A965Dd9447d86e47", ADDRESSES.avax.USDC], ["0x12dC9256Acc9895B076f6638D628382881e62CeE", ADDRESSES.avax.USDt]],
      v1: [["0x1205f31718499dBf1fCa446663B532Ef87481fe1", ADDRESSES.avax.USDC], ["0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c", ADDRESSES.avax.USDt]],
      stg: ADDRESSES.fuse.WETH_3,
    }, "2022-11-01"),
    [CHAIN.FANTOM]: stargateBridge({ v1: [["0x12edeA9cd262006cC3C4E77c90d2CD2DD4b1eb97", "0x04068da6c83afcfa0e13ba15a6696662335d5b75"]], stg: ADDRESSES.fuse.WETH_3 }, "2022-11-01"),
    [CHAIN.BSC]: stargateBridge({
      v2: [["0x138EB30f73BC423c6455C53df6D89CB01d9eBc63", ADDRESSES.bsc.USDT], ["0x962Bd449E630b0d928f308Ce63f1A21F02576057", ADDRESSES.bsc.USDC]],
      v1: [["0x4e145a589e4c03cBe3d28520e4BF3089834289Df", "0xd17479997f34dd9156deef8f95a52d81d265be9c"], ["0xD4CEc732b3B135eC52a3c0bc8Ce4b8cFb9dacE46", "0xe552fb52a4f19e44ef5a967632dbc320b0820639"]], // USDD, METIS
      stg: "0xB0D502E938ed5f4df2E681fE6E419ff29631d62b",
    }, "2022-11-01"),
    [CHAIN.ARBITRUM]: stargateBridge({
      v2: [["0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0", ADDRESSES.arbitrum.USDT], ["0xe8CDF27AcD73a434D661C84887215F7598e7d0d3", ADDRESSES.arbitrum.USDC_CIRCLE], ["0xA45B5130f36CDcA45667738e2a258AB09f4A5f7F", ADDRESSES.arbitrum.WETH]],
      v1: [["0x892785f33CdeE22A30AEF750F285E18c18040c3e", ADDRESSES.arbitrum.USDC], ["0xB6CfcF89a7B22988bfC96632aC2A9D6daB60d641", ADDRESSES.arbitrum.USDT], ["0x915A55e36A01285A14f05dE6e81ED9cE89772f8e", NATIVE]],
      stg: "0x6694340fc020c5E6B96567843da2df01b2CE1eb6",
    }, "2022-11-01"),
    [CHAIN.OPTIMISM]: stargateBridge({
      v2: [["0xcE8CcA271Ebc0533920C83d39F417ED6A0abB7D0", ADDRESSES.optimism.USDC_CIRCLE], ["0x19cFCE47eD54a88614648DC3f19A5980097007dD", ADDRESSES.optimism.USDT], ["0xe8CDF27AcD73a434D661C84887215F7598e7d0d3", ADDRESSES.optimism.WETH_1]],
      v1: [["0xDecC0c09c3B5f6e92EF4184125D5648a66E35298", ADDRESSES.optimism.USDC], ["0xd22363e3762cA7339569F3d33EADe20127D5F98C", NATIVE]],
      stg: "0x296F55F8Fb28E498B858d0BcDA06D955B2Cb3f97",
    }, "2022-11-01"),
    [CHAIN.KAVA]: stargateBridge({ v2: [["0x41A5b0470D96656Fb3e8f68A218b39AdBca3420b", ADDRESSES.kava.USDt]], stg: "0x83c30eb8bc9ad7C56532895840039E62659896ea" }, "2023-11-21"),
    [CHAIN.BASE]: stargateBridge({ v2: [["0x27a16dc786820B16E5c9028b75B99F6f604b5d26", ADDRESSES.base.USDC], ["0xdc181Bd607330aeeBEF6ea62e03e5e1Fb4B6F7C7", ADDRESSES.optimism.WETH_1]], stg: "0xE3B53AF74a4BF62Ae5511055290838050bf764Df" }, "2024-06-10"),
    [CHAIN.LINEA]: stargateBridge({ v2: [["0x81F6138153d473E8c5EcebD3DC8Cd4903506B075", ADDRESSES.linea.WETH]], stg: ADDRESSES.lightlink_phoenix.USDT }, "2024-06-10"),
    [CHAIN.METIS]: stargateBridge({ v2: [["0x36ed193dc7160D3858EC250e69D12B03Ca087D08", ADDRESSES.metis.WETH], ["0xD9050e7043102a0391F81462a3916326F86331F0", ADDRESSES.metis.Metis], ["0x4dCBFC0249e8d5032F89D6461218a9D2eFff5125", ADDRESSES.metis.m_USDT]] }, "2024-06-10"),
    [CHAIN.MANTLE]: stargateBridge({
      v2: [["0x4c1d3Fc3fC3c177c3b633427c2F769276c547463", ADDRESSES.mantle.WETH], ["0xAc290Ad4e0c891FDc295ca4F0a6214cf6dC6acDC", ADDRESSES.mantle.USDC], ["0xB715B85682B731dB9D5063187C450095c91C57FC", ADDRESSES.mantle.USDT], ["0xF7628d84a2BbD9bb9c8E686AC95BB5d55169F3F1", ADDRESSES.mantle.mETH]],
      stg: "0x8731d54E9D02c286767d56ac03e8037C07e01e98",
    }, "2024-06-10"),
    [CHAIN.SCROLL]: stargateBridge({ v2: [["0x3Fc69CC4A842838bCDC9499178740226062b14E4", ADDRESSES.scroll.USDC], ["0xC2b638Cb5042c1B3c5d5C969361fB50569840583", ADDRESSES.scroll.WETH]] }, "2024-06-27"),
    [CHAIN.AURORA]: stargateBridge({ v2: [["0x81F6138153d473E8c5EcebD3DC8Cd4903506B075", "0x368EBb46ACa6b8D0787C96B2b20bD3CC3F2c45F7"]] }, "2024-07-18"),
    [CHAIN.KLAYTN]: stargateBridge({ v2: [["0x01A7c805cc47AbDB254CD8AaD29dE5e447F59224", "0xE2053BCf56D2030d2470Fb454574237cF9ee3D4B"], ["0x8619bA1B324e099CB2227060c4BC5bDEe14456c6", "0x9025095263d1E548dc890A7589A4C78038aC40ab"], ["0xBB4957E44401a31ED81Cab33539d9e8993FA13Ce", "0x55Acee547DF909CF844e32DD66eE55a6F81dC71b"]] }, "2024-10-25"),
    [CHAIN.ABSTRACT]: stargateBridge({ v2: [["0x91a5Fe991ccB876d22847967CEd24dCd7A426e0E", ADDRESSES.abstract.USDC], ["0x943C484278b8bE05D119DfC73CfAa4c9D8f11A76", ADDRESSES.abstract.USDT], ["0x221F0E1280Ec657503ca55c708105F1e1529527D", NATIVE]] }, "2025-05-22"),
    // disabled: no RPC configured for degen
    // [CHAIN.DEGEN]: stargateBridge({ v2: [["0xAF54BE5B6eEc24d6BFACf1cce4eaF680A8239398", ADDRESSES.flow.stgUSDC], ["0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6", "0x674843C06FF83502ddb4D37c2E09C01cdA38cbc8"], ["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.fuse.WETH_3]] }, "2025-05-22"),
    [CHAIN.FLARE]: stargateBridge({ v2: [["0x77C71633C34C3784ede189d74223122422492a0f", ADDRESSES.flare.USDC_e], ["0x1C10CC06DC6D35970d1D53B2A23c76ef370d4135", "0x0B38e83B86d491735fEaa0a791F65c2B99535396"], ["0x8e8539e4CcD69123c623a106773F2b0cbbc58746", "0x1502FA4be69d526124D453619276FacCab275d3D"]] }, "2025-05-22"),
    [CHAIN.FLOW]: stargateBridge({ v2: [["0xAF54BE5B6eEc24d6BFACf1cce4eaF680A8239398", ADDRESSES.flow.stgUSDC], ["0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6", "0x674843C06FF83502ddb4D37c2E09C01cdA38cbc8"], ["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.fuse.WETH_3]] }, "2025-05-22"),
    [CHAIN.FUSE]: stargateBridge({ v2: [["0xAF54BE5B6eEc24d6BFACf1cce4eaF680A8239398", ADDRESSES.fuse.USDC_3], ["0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6", ADDRESSES.fuse.USDT_3], ["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.fuse.WETH_3]] }, "2025-05-22"),
    [CHAIN.GRAVITY]: stargateBridge({ v2: [["0xC1B8045A6ef2934Cf0f78B0dbD489969Fa9Be7E4", ADDRESSES.flare.USDC_e], ["0x0B38e83B86d491735fEaa0a791F65c2B99535396", "0x816E810f9F787d669FB71932DeabF6c83781Cd48"], ["0x17d65bF79E77B6Ab21d8a0afed3bC8657d8Ee0B2", "0xf6f832466Cd6C21967E0D954109403f36Bc8ceaA"]] }, "2025-05-22"),
    [CHAIN.HEMI]: stargateBridge({ v2: [["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.hemi.USDC_e], ["0xAF54BE5B6eEc24d6BFACf1cce4eaF680A8239398", ADDRESSES.hemi.USDT], [ADDRESSES.fuse.WETH_3, NATIVE]] }, "2025-05-22"),
    [CHAIN.INK]: stargateBridge({ v2: [[ADDRESSES.fuse.WETH_3, ADDRESSES.flow.stgUSDC]] }, "2025-05-22"),
    [CHAIN.MANTA]: stargateBridge({ v2: [["0x9895D81bB462A195b4922ED7De0e3ACD007c32CB", NATIVE]] }, "2025-05-22"),
    [CHAIN.SONEIUM]: stargateBridge({ v2: [["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.soneium.USDC], [ADDRESSES.fuse.WETH_3, NATIVE]] }, "2025-05-22"),
    [CHAIN.SONIC]: stargateBridge({ v2: [["0xA272fFe20cFfe769CdFc4b63088DCD2C82a2D8F9", ADDRESSES.sonic.USDC_e]] }, "2025-05-22"),
    [CHAIN.TAIKO]: stargateBridge({ v2: [["0x77C71633C34C3784ede189d74223122422492a0f", ADDRESSES.taiko.USDC_e], ["0x1C10CC06DC6D35970d1D53B2A23c76ef370d4135", "0x9c2dc7377717603eB92b2655c5f2E7997a4945BD"]] }, "2025-05-22"),
    [CHAIN.UNICHAIN]: stargateBridge({ v2: [["0xe9aBA835f813ca05E50A6C0ce65D0D74390F7dE7", NATIVE]] }, "2025-05-22"),
    [CHAIN.PEAQ]: stargateBridge({ v2: [["0x5c1a97C144A97E9b370F833a06c70Ca8F2f30DE5", "0xbbA60da06c2c5424f03f7434542280FCAd453d10"], ["0x07cd5A2702394E512aaaE54f7a250ea0576E5E8C", "0xf4D9235269a96aaDaFc9aDAe454a0618eBE37949"], ["0xe7Ec689f432f29383f217e36e680B5C855051f25", "0x6694340fc020c5E6B96567843da2df01b2CE1eb6"]] }, "2025-06-05"),
    [CHAIN.TELOS]: stargateBridge({ v2: [["0x2086f755A6d9254045C257ea3d382ef854849B0f", ADDRESSES.flow.stgUSDC], [ADDRESSES.goat.WETH, "0x674843C06FF83502ddb4D37c2E09C01cdA38cbc8"], ["0xA272fFe20cFfe769CdFc4b63088DCD2C82a2D8F9", "0xBAb93B7ad7fE8692A878B95a8e689423437cc500"]] }, "2025-06-05"),
    [CHAIN.XDC]: stargateBridge({ v2: [["0x8E2E38711080bF8AAb9C74f434d2bae70e67ae44", "0xCc0587aeBDa397146cc828b445dB130a94486e74"], ["0xA4272ad93AC5d2FF048DD6419c88Eb4C1002Ec6b", ADDRESSES.nibiru.WETH], ["0xB0d27478A40223e427697Da523c6A3DAF29AaFfB", "0xa7348290de5cf01772479c48D50dec791c3fC212"]] }, "2025-06-05"),
    [CHAIN.NIBIRU]: stargateBridge({ v2: [["0x12a272A581feE5577A5dFa371afEB4b2F3a8C2F8", ADDRESSES.nibiru.USDC], ["0xC16977205c53Cd854136031BD2128F75D6ff63C9", ADDRESSES.nibiru.USDT], ["0x108f4c02C9fcDF862e5f5131054c50f13703f916", ADDRESSES.nibiru.WETH]] }, "2025-09-24"),
    [CHAIN.TEMPO]: stargateBridge({ v2: [["0x8c76e2F6C5ceDA9AA7772e7efF30280226c44392", ADDRESSES.tempo.USDC_E], ["0x7753Dc8d4bd48Db599Da21E08b1Ab1D6FDFfdC71", ADDRESSES.tempo.EURC_E]] }, "2026-05-01"),
    [CHAIN.APECHAIN]: stargateBridge({ v2: [["0x2086f755A6d9254045C257ea3d382ef854849B0f", ADDRESSES.flow.stgUSDC], ["0xEb8d955d8Ae221E5b502851ddd78E6C4498dB4f6", "0x674843C06FF83502ddb4D37c2E09C01cdA38cbc8"], ["0x28E0f0eed8d6A6a96033feEe8b2D7F32EB5CCc48", "0xf4D9235269a96aaDaFc9aDAe454a0618eBE37949"]] }, "2026-07-26"),
    [CHAIN.BERACHAIN]: stargateBridge({ v2: [["0xAF54BE5B6eEc24d6BFACf1cce4eaF680A8239398", ADDRESSES.berachain.USDC], ["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.fuse.WETH_3]] }, "2026-07-26"),
    [CHAIN.CORE]: stargateBridge({ v2: [[ADDRESSES.fuse.WETH_3, ADDRESSES.core.USDC], ["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.core.USDT]] }),
    [CHAIN.CRONOS]: stargateBridge({ v2: [["0x57687Bd10D3c2889BB112B36d0AFbfAa0686f7fa", "0xf951eC28187D9E5Ca673Da8FE6757E6f0Be5F77C"], ["0x816f6e3CB269712Eb199f146Db7c3Fb590ae6af2", "0xf44acfdC916898449E39062934C2b496799B6abe"]] }),
    [CHAIN.CRONOS_ZKEVM]: stargateBridge({ v2: [["0x74491Aa7187c34Fce7D54ff4Fe640b57C9146713", "0xaa5b845F8C9c047779bEDf64829601d8B264076c"], ["0xA214ce0aC3b4a9225f74bCf9A9AFBA78255942B7", ADDRESSES.cronos_zkevm.ETH]] }),
    [CHAIN.XDAI]: stargateBridge({ v2: [["0xB1EeAD6959cb5bB9B20417d6689922523B2B86C3", "0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0"], ["0xe9aBA835f813ca05E50A6C0ce65D0D74390F7dE7", ADDRESSES.xdai.WETH]] }),
    [CHAIN.GOAT]: stargateBridge({ v2: [["0x88853D410299BCBfE5fCC9Eef93c03115E908279", ADDRESSES.goat.WETH], ["0xbbA60da06c2c5424f03f7434542280FCAd453d10", ADDRESSES.goat.USDC], [ADDRESSES.berachain.USDC, ADDRESSES.goat.USDT]] }),
    [CHAIN.IOTAEVM]: stargateBridge({ v2: [["0x8e8539e4CcD69123c623a106773F2b0cbbc58746", ADDRESSES.flare.USDC_e], ["0x77C71633C34C3784ede189d74223122422492a0f", "0xC1B8045A6ef2934Cf0f78B0dbD489969Fa9Be7E4"], ["0x9c2dc7377717603eB92b2655c5f2E7997a4945BD", "0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8"]] }),
    [CHAIN.VANA]: stargateBridge({ v2: [["0x45A01E4e04F14f7A4a6702c74187c5F6222033cd", ADDRESSES.flow.stgUSDC], ["0xF2c0e57f48276112a596e141817D93bE472Ed6c5", "0x88853D410299BCBfE5fCC9Eef93c03115E908279"], ["0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6", ADDRESSES.fuse.WETH_3]] }),
    [CHAIN.PLASMA]: stargateBridge({ v2: [["0x0cEb237E109eE22374a567c6b09F373C73FA4cBb", "0x9895D81bB462A195b4922ED7De0e3ACD007c32CB"]] }),
    [CHAIN.PLUME]: stargateBridge({ v2: [["0x9909fa99b7F7ee7F1c0CBf133f411D43083631E6", ADDRESSES.plume_mainnet.USDC_e], ["0x2D870D17e640eD6c057afBAA0DF56B8DEa5Cf2F6", ADDRESSES.plume_mainnet.USDT], ["0x4683CE822272CD66CEa73F5F1f9f5cBcaEF4F066", ADDRESSES.plume_mainnet.WETH]] }),
    // disabled: no RPC configured for rari
    // [CHAIN.RARI]: stargateBridge({ v2: [["0x875bee36739e7Ce6b60E056451c556a88c59b086", ADDRESSES.flare.USDC_e], ["0x17d65bF79E77B6Ab21d8a0afed3bC8657d8Ee0B2", "0x362FAE9A75B27BBc550aAc28a7c1F96C8D483120"]] }),
    [CHAIN.ROOTSTOCK]: stargateBridge({ v2: [["0xAF54BE5B6eEc24d6BFACf1cce4eaF680A8239398", "0x74c9f2b00581F1B11AA7ff05aa9F608B7389De67"], ["0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6", "0xAf368c91793CB22739386DFCbBb2F1A9e4bCBeBf"], ["0x45f1A95A4D3f3836523F5c83673c797f4d4d263B", ADDRESSES.fuse.WETH_3]] }),
    [CHAIN.STORY]: stargateBridge({ v2: [["0x2086f755A6d9254045C257ea3d382ef854849B0f", ADDRESSES.flow.stgUSDC], [ADDRESSES.goat.WETH, "0x674843C06FF83502ddb4D37c2E09C01cdA38cbc8"], ["0xA272fFe20cFfe769CdFc4b63088DCD2C82a2D8F9", "0xBAb93B7ad7fE8692A878B95a8e689423437cc500"]] }),
    // disabled: no RPC configured for spn
    // [CHAIN.SUPERPOSITION]: stargateBridge({ v2: [["0x8EE21165Ecb7562BA716c9549C1dE751282b9B33", ADDRESSES.spn.USDC_e]] }),
  },
  "hop": {
    [CHAIN.ETHEREUM]: hopL1Bridge([
      ["0xb8901acB165ed027E32754E0FFe830802919727f", ADDRESSES.ethereum.WETH], // ETH
      ["0x3d4Cc8A61c7528Fd86C55cfe061a78dCBA48EDd1", ADDRESSES.ethereum.DAI], // DAI
      ["0x3666f603Cc164936C1b87e207F36BEBa4AC5f18a", ADDRESSES.ethereum.USDC], // USDC
      ["0x3E4a3a4796d16c0Cd582C382691998f7c06420B6", ADDRESSES.ethereum.USDT], // USDT
      ["0x22B1Cbb8D98a01a3B71D034BB899775A76Eb1cc2", ADDRESSES.ethereum.MATIC], // MATIC
      ["0x914f986a44AcB623A277d6Bd17368171FCbe4273", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
      ["0xf074540eb83c86211F305E145eB31743E228E57d", "0xB0c7a3Ba49C7a6EaBa6cD4a96C55a1391070Ac9A"], // MAGIC
      ["0x87269B23e73305117D0404557bAdc459CEd0dbEc", ADDRESSES.ethereum.RETH], // rETH
    ], "2022-10-27"),
    [CHAIN.POLYGON]: hopL2Bridge([
      ["0xb98454270065A31D71Bf635F6F7Ee6A518dFb849", ADDRESSES.polygon.WETH_1], // ETH
      ["0xEcf268Be00308980B5b3fcd0975D47C4C8e1382a", ADDRESSES.polygon.DAI], // DAI
      ["0x25D8039bB044dC227f741a9e381CA4cEAE2E6aE8", ADDRESSES.polygon.USDC], // USDC
      ["0x6c9a1ACF73bd85463A46B0AFc076FBdf602b690B", ADDRESSES.polygon.USDT], // USDT
      ["0x553bC791D746767166fA3888432038193cEED5E2", ADDRESSES.polygon.WMATIC_2], // MATIC
      ["0x58c61AeE5eD3D748a1467085ED2650B697A66234", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
    ], "2022-10-27"),
    [CHAIN.ARBITRUM]: hopL2Bridge([
      ["0x3749C4f034022c39ecafFaBA182555d4508caCCC", ADDRESSES.arbitrum.WETH], // ETH
      ["0x7aC115536FE3A185100B2c4DE4cb328bf3A58Ba6", ADDRESSES.optimism.DAI], // DAI
      ["0x0e0E3d2C5c292161999474247956EF542caBF8dd", ADDRESSES.arbitrum.USDC], // USDC
      ["0x72209Fe68386b37A40d6bCA04f78356fd342491f", ADDRESSES.arbitrum.USDT], // USDT
      ["0x25FB92E505F752F730cAD0Bd4fa17ecE4A384266", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
      ["0xEa5abf2C909169823d939de377Ef2Bf897A6CE98", "0x539bdE0d7Dbd336b79148AA742883198BBF60342"], // MAGIC
      ["0xc315239cFb05F1E130E7E28E603CEa4C014c57f0", "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8"], // rETH
    ], "2022-10-27"),
    [CHAIN.OPTIMISM]: hopL2Bridge([
      ["0x83f6244Bd87662118d96D9a6D44f09dffF14b30E", ADDRESSES.optimism.WETH_1], // ETH
      ["0x7191061D5d4C60f598214cC6913502184BAddf18", ADDRESSES.optimism.DAI], // DAI
      ["0xa81D244A1814468C734E5b4101F7b9c0c577a8fC", ADDRESSES.optimism.USDC], // USDC
      ["0x46ae9BaB8CEA96610807a275EBD36f8e916b5C61", ADDRESSES.optimism.USDT], // USDT
      ["0x03D7f750777eC48d39D080b020D83Eb2CB4e3547", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
      ["0xA0075E8cE43dcB9970cB7709b9526c1232cc39c2", "0x9Bcef72be871e61ED4fBbc7630889beE758eb81D"], // rETH
    ], "2022-10-27"),
    [CHAIN.XDAI]: hopL2Bridge([
      ["0xD8926c12C0B2E5Cd40cFdA49eCaFf40252Af491B", ADDRESSES.xdai.WETH], // ETH
      ["0x0460352b91D7CF42B0E1C1c30f06B602D9ef2238", ADDRESSES.xdai.WXDAI], // DAI (xDAI)
      ["0x25D8039bB044dC227f741a9e381CA4cEAE2E6aE8", ADDRESSES.xdai.USDC], // USDC
      ["0xFD5a186A7e8453Eb867A360526c5d987A00ACaC2", ADDRESSES.xdai.USDT], // USDT
      ["0x7ac71c29fEdF94BAc5A5C9aB76E1Dd12Ea885CCC", ADDRESSES.xdai.MATIC], // MATIC
      ["0x6F03052743CD99ce1b29265E377e320CD24Eb632", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
    ], "2022-11-01"),
    [CHAIN.BASE]: hopL2Bridge([
      ["0x3666f603Cc164936C1b87e207F36BEBa4AC5f18a", ADDRESSES.optimism.WETH_1], // ETH
      ["0x46ae9BaB8CEA96610807a275EBD36f8e916b5C61", ADDRESSES.base.USDbC], // USDC
      ["0xe22D2beDb3Eca35E6397e0C6D62857094aA26F52", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
    ], "2024-02-01"),
    [CHAIN.ARBITRUM_NOVA]: hopL2Bridge([
      ["0x8796860ca1677Bf5d54cE5A348Fe4b779a8212f3", ADDRESSES.arbitrum_nova.WETH], // ETH
      ["0x02D47f76523d2f059b617E4346de67482792eB83", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
      ["0xE638433e2C1dF5f7a3a21b0a6b5c4b37278e55DC", "0xe8936ac97A85d708d5312D52C30c18d4533b8A9c"], // MAGIC
    ], "2024-02-01"),
    [CHAIN.POLYGON_ZKEVM]: {
      ...hopL2Bridge([
        ["0x0ce6c85cF43553DE10FC56cecA0aef6Ff0DD444d", ADDRESSES.polygon_zkevm.WETH], // ETH
        ["0x9ec9551d4A1a1593b0ee8124D98590CC71b3B09D", "0xc5102fE9359FD9a28f877a67E36B0F050d81a3CC"], // HOP
      ], "2024-02-01"),
      deadFrom: "2026-02-02", // polygon_zkevm RPC frozen since 2026-07-03; last Hop activity there was 2026-02-01
    },
  },
  "zkbridge": {
    [CHAIN.ETHEREUM]: zkBridge([
      ["0x89a56FF41a4be1360f780c5abFBA8FD7EceD2c7A", { 1: ADDRESSES.ethereum.WETH, 3: ADDRESSES.ethereum.USDT }],
      ["0xA4252F2A68b2A078c86E0569eB7Fb872A37864AF", { 1: ADDRESSES.ethereum.USDT, 2: ADDRESSES.ethereum.USDC, 20: ADDRESSES.ethereum.WETH }],
      ["0x04B9b6a1C41D1A7c98e5D2523460c39F4757e9A8", { 1: "0xF5e11df1ebCf78b6b6D26E04FF19cD786a1e81dC", 2: ADDRESSES.bouncebit.BBUSD }],
      ["0x00D38853127A2f84474353735eA3a4c3213DFF91", { 1: ADDRESSES.ethereum.METH, 20: "0x3c3a81e81dc49A522A592e7622A7E711c06bf354" }],
    ], "2024-05-06"),
    [CHAIN.BSC]: zkBridge([
      ["0x51187757342914E7d94FFFD95cCCa4f440FE0E06", { 1: ADDRESSES.bsc.ETH, 3: ADDRESSES.bsc.USDT, 10: ADDRESSES.bsc.WBNB }],
      ["0x1B60db9374EE8B9a7706B1D746259D8AFfbf4Cb9", { 1: "0xF5e11df1ebCf78b6b6D26E04FF19cD786a1e81dC", 2: ADDRESSES.bouncebit.BBUSD }],
      ["0x5F9d235289da95520d683F6C0E9F495D435C0300", { 1: "0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11" }],
      ["0xd00EE54eaCBf05c56dC5D183F6E7b3Bac5356244", { 1: ADDRESSES.bsc.iZi }],
      ["0x9BC19953839618bBA89f28aC4eC761d7051AF440", { 1: "0xc03fBF20A586fa89C2a5f6F941458E1Fbc40c661" }],
    ], "2024-05-06"),
    [CHAIN.POLYGON]: zkBridge([["0x104bc711530554F18936a12542192F8bd36166B1", { 1: ADDRESSES.polygon.WETH_1, 3: ADDRESSES.polygon.USDT }]], "2024-05-06"),
    [CHAIN.OPTIMISM]: zkBridge([["0x24bbC063DeF30Ae81AECC659B97A8b2562b2AFCd", { 1: ADDRESSES.optimism.WETH_1, 3: ADDRESSES.optimism.USDT }]], "2024-05-06"),
    [CHAIN.ARBITRUM]: zkBridge([["0xC9D0b733AdAa1f851639cA47a9a2d8A6C8572BdB", { 1: ADDRESSES.arbitrum.WETH, 3: ADDRESSES.arbitrum.USDT }]], "2024-05-06"),
    [CHAIN.LINEA]: zkBridge([
      ["0x366C1B89aA0783d0886B9EF817d10c8729783dCb", { 1: ADDRESSES.linea.WETH, 3: ADDRESSES.linea.USDT }],
      ["0xAAe504413e6745FFC111447b1688940D62570126", { 1: ADDRESSES.bsc.iZi }],
    ], "2024-05-06"),
    [CHAIN.MANTLE]: zkBridge([
      ["0xAFC153cF66F33C492d5b638Ee90f5eBd2673e4d3", { 1: ADDRESSES.mantle.WETH, 3: ADDRESSES.mantle.USDT }],
      ["0x3843C95D9f8554baffdfc0C145Ce9DfB06Cd4E24", { 1: ADDRESSES.bsc.iZi }],
      ["0xf926f7D15c62eC18299bA817A73A2519fCC3Bfec", { 1: ADDRESSES.mantle.mETH, 20: ADDRESSES.mantle.WMNT }],
    ], "2024-05-06"),
    [CHAIN.BASE]: zkBridge([["0x87A659d0433F21E257f5d252fe163E1341DdCe81", { 1: ADDRESSES.optimism.WETH_1 }]], "2024-05-06"),
    [CHAIN.SCROLL]: zkBridge([
      ["0xe69F676b2142FA05A3DC51A0E51d68a685AE7391", { 1: ADDRESSES.scroll.WETH, 3: ADDRESSES.scroll.USDT }],
      ["0xb9fe89f0e2A18f3B2A0EB6A9747F1eAf0F499ff5", { 1: ADDRESSES.bsc.iZi }],
    ], "2024-05-06"),
    [CHAIN.OP_BNB]: zkBridge([
      ["0x953a578c7Ce8F3A1BF625d182A8caf7181FD4BEB", { 1: ADDRESSES.op_bnb.ETH, 3: ADDRESSES.op_bnb.USDT, 10: ADDRESSES.optimism.WETH_1 }],
      ["0xcdBCB231639dB01BAa1dCFBbB93c3264d921E0Fc", { 1: "0x9d94a7ff461e83f161c8c040e78557e31d8cba72" }],
    ], "2024-05-06"),
    [CHAIN.BITLAYER]: zkBridge([["0x36cAE7b6b0B68c4dDb2BBD3CDeE34fd56f948aAe", { 1: ADDRESSES.btr.USDT, 2: "0xf8c374ce88a3be3d374e8888349c7768b607c755", 20: ADDRESSES.btr.ETH }]], "2024-05-09"),
    [CHAIN.BOUNCE_BIT]: {
      ...zkBridge([["0xfbC7f3607cff8355dc5B0D3bF4f9614376389321", { 1: "0xf5e11df1ebcf78b6b6d26e04ff19cd786a1e81dc", 2: ADDRESSES.bouncebit.BBUSD }]], "2024-05-10"),
      deadFrom: "2024-07-21", // bouncebit RPC frozen since 2026-08-19; last zkBridge activity there was 2024-07-20
    },
  },
  "xy-finance": {
    [CHAIN.ETHEREUM]: xyBridge({ yBridge: "0x4315f344a905dC21a08189A117eFd6E1fcA37D57", router: "0xFfB9faf89165585Ad4b25F81332Ead96986a2681" }, "2024-01-22"),
    [CHAIN.SCROLL]: xyBridge({ yBridge: "0x778C974568e376146dbC64fF12aD55B2d1c4133f", router: "0x22bf2A9fcAab9dc96526097318f459eF74277042" }, "2024-01-22"),
    [CHAIN.MANTLE]: xyBridge({ yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1", router: "0x52075Fd1fF67f03beABCb5AcdA9679b02d98cA37" }, "2024-01-22"),
    [CHAIN.LINEA]: xyBridge({ yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1", router: "0xc693C8AAD9745588e95995fef4570d6DcEF98000" }, "2024-01-22"),
    [CHAIN.BASE]: xyBridge({ yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1", router: "0x6aCd0Ec9405CcB701c57A88849C4F1CD85a3f3ab" }, "2024-01-22"),
    [CHAIN.ARBITRUM]: xyBridge({ yBridge: "0x33383265290421C704c6b09F4BF27ce574DC4203", router: "0x062b1Db694F6A437e3c028FC60dd6feA7444308c" }, "2024-01-22"),
    [CHAIN.ERA]: xyBridge({ yBridge: "0xe4e156167cc9C7AC4AbD8d39d203a5495F775547", router: "0x30E63157bD0bA74C814B786F6eA2ed9549507b46" }, "2024-01-22"),
    [CHAIN.BSC]: xyBridge({ yBridge: "0x7D26F09d4e2d032Efa0729fC31a4c2Db8a2394b1", router: "0xDF921bc47aa6eCdB278f8C259D6a7Fef5702f1A9" }, "2024-01-22"),
    [CHAIN.POLYGON]: xyBridge({ yBridge: "0x0c988b66EdEf267D04f100A879db86cdb7B9A34F", router: "0xa1fB1F1E5382844Ee2D1BD69Ef07D5A6Abcbd388" }, "2024-01-22"),
    [CHAIN.POLYGON_ZKEVM]: xyBridge({ yBridge: "0x3689D3B912d4D73FfcAad3a80861e7caF2d4F049", router: "0x218Ef86b88765df568E9D7d7Fd34B5Dc88098080" }, "2024-01-22"),
    [CHAIN.AVAX]: xyBridge({ yBridge: "0x2C86f0FF75673D489b7D72D9986929a2b0Ed596C", router: "0xa0c0F962DECD78D7CDE5707895603CBA74C02989" }, "2024-01-22"),
    [CHAIN.OPTIMISM]: xyBridge({ yBridge: "0x7a6e01880693093abACcF442fcbED9E0435f1030", router: "0xF8d342db903F266de73B10a1e46601Bb08a3c195" }, "2024-01-22"),
    [CHAIN.CRONOS]: xyBridge({ yBridge: "0xF103b5B479d2A629F422C42bb35E7eEceE1ad55E", router: "0x5d6e7E537cb4a8858C8B733A2A307B4aAFDc42ca" }, "2024-01-22"),
    [CHAIN.ASTAR]: xyBridge({ yBridge: "0x5C6C12Fd8b1f7E60E5B60512712cFbE0192E795E", router: "0x9c83E6F9E8DA12af8a0Cb8E276b722EB3D7668aF" }, "2024-01-22"),
    [CHAIN.KCC]: xyBridge({ yBridge: "0x7e803b54295Cd113Bf48E7f069f0531575DA1139", router: "0x562afa22b2Fc339fd7Fa03E734E7008C3EccF8CF" }, "2024-01-22"),
    [CHAIN.BLAST]: xyBridge({ yBridge: "0x73Ce60416035B8D7019f6399778c14ccf5C9c7A1", router: "0x43A86823EBBe2ECF9A384aDfD989E26A30626458" }, "2024-03-17"),
    [CHAIN.TAIKO]: xyBridge({ yBridge: "0x6be1fe9dd10a4fbfce5552ca9add122341ec6c04", router: "0xedC061306A79257f15108200C5B82ACc874C239d" }, "2024-07-20"),
    [CHAIN.CRONOS_ZKEVM]: xyBridge({ yBridge: "0xE22747472A565e96D0867741811193895b9538f2", router: "0x986138f6ed1350a85De6B18280f7d139F74B7282" }, "2024-08-27"),
  },
  "wanbridge": {
    [CHAIN.ETHEREUM]: wanBridge("0xfceaaaeb8d564a9d0e71ef36f027b9d162bc334e", "2024-03-25"),
    [CHAIN.BSC]: wanBridge("0xc3711bdbe7e3063bf6c22e7fed42f782ac82baee", "2024-03-25"),
    [CHAIN.ARBITRUM]: wanBridge("0xf7ba155556e2cd4dfe3fe26e506a14d2f4b97613", "2024-03-25"),
    [CHAIN.POLYGON]: wanBridge("0x2216072a246a84f7b9ce0f1415dd239c9bf201ab", "2024-03-25"),
    [CHAIN.AVAX]: wanBridge("0x74e121a34a66d54c33f3291f2cdf26b1cd037c3a", "2024-03-25"),
    [CHAIN.OPTIMISM]: wanBridge("0xc6ae1db6c66d909f7bfeeeb24f9adb8620bf9dbf", "2024-03-25"),
    [CHAIN.MOONRIVER]: wanBridge("0xde1ae3c465354f01189150f3836c7c15a1d6671d", "2024-03-26"),
    [CHAIN.METIS]: wanBridge("0xc6ae1db6c66d909f7bfeeeb24f9adb8620bf9dbf", "2024-03-29"),
    [CHAIN.XDC]: wanBridge("0xf7ba155556e2cd4dfe3fe26e506a14d2f4b97613", "2024-04-01"),
    [CHAIN.ASTAR]: wanBridge("0x592de30bebff484b5a43a6e8e3ec1a814902e0b6", "2024-04-02"),
    [CHAIN.OKEXCHAIN]: wanBridge("0xf7ba155556e2cd4dfe3fe26e506a14d2f4b97613", "2024-05-03"),
    [CHAIN.BASE]: wanBridge("0x2715aa7156634256ae75240c2c5543814660cd04", "2025-07-01"),
    [CHAIN.BLAST]: wanBridge("0xc21e5553c8dddf2e4a93e5bedbae436d4291f603", "2025-07-03"),
    [CHAIN.LINEA]: wanBridge("0xffb876bd5bee99e992cac826a04396002f5f4a65", "2025-07-06"),
  },
  // one-sided: only the EVM vaults are tracked, the Antelope leg is attributed server-side (destinationChain: telos)
  "alcor-bridge": {
    [CHAIN.ETHEREUM]: alcorBridge("0x3e447d533321ad6a8412f97034ac295a9ff8d858", "2026-09-29"),
    [CHAIN.BSC]: alcorBridge("0x53F18eaa8Bf8099b5bA21Bb7E11ed311b677690e", "2026-10-03"),
    [CHAIN.POLYGON]: alcorBridge("0x15bbd21148f98c4daeb30450eb05666f7859993d", "2026-10-07"),
  },
  // one-sided (destinationChain: aurora)
  "rainbow-bridge": {
    [CHAIN.ETHEREUM]: rainbowBridge("2022-11-04"),
  },
  // one-sided: only the Rootstock side is tracked, the Ethereum leg is attributed server-side (destinationChain: ethereum)
  "rootstock-token-bridge": {
    [CHAIN.ROOTSTOCK]: rootstockTokenBridge([
      ADDRESSES.ethereum.DAI, // DAI
      ADDRESSES.ethereum.USDC, // USDC
      ADDRESSES.ethereum.USDT, // USDT
      ADDRESSES.ethereum.LINK, // LINK
      "0x8D3E855f3f55109D473735aB76F753218400fe96", // BUND
    ]),
  },
  // one-sided (destinationChain: starknet)
  "starkgate": {
    [CHAIN.ETHEREUM]: starkgateBridge({
      "0xae0Ee0A63A2cE6BaeEFFE56e7714FB4EFE48D419": NATIVE, // ETH
      "0xF6080D9fbEEbcd44D89aFfBFd42F098cbFf92816": ADDRESSES.ethereum.USDC, // USDC
      "0xbb3400F107804DFB482565FF1Ec8D8aE66747605": ADDRESSES.ethereum.USDT, // USDT
      "0x9F96fE0633eE838D0298E8b8980E6716bE81388d": ADDRESSES.ethereum.DAI, // DAI
      "0x283751A21eafBFcD52297820D27C1f1963D9b5b4": ADDRESSES.ethereum.WBTC, // WBTC
      "0xBf67F59D2988A46FBFF7ed79A621778a3Cd3985B": ADDRESSES.ethereum.WSTETH, // wstETH
      "0xcf58536D6Fab5E59B654228a5a4ed89b13A876C2": ADDRESSES.ethereum.RETH, // rETH
      "0xce5485cfb26914c5dce00b9baf0580364dafc7a4": "0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766", // STRK
      "0xdc687e1e0b85cb589b2da3c47c933de9db3d1ebb": ADDRESSES.ethereum.FRAX, // FRAX
      "0x66ba83ba3d3ad296424a2258145d9910e9e40b7c": ADDRESSES.ethereum.FXS, // FXS
      "0xf3f62f23df9c1d2c7c63d9ea6b90e8d24c7e3df5": ADDRESSES.ethereum.LUSD, // LUSD
    }, "2025-12-01"),
  },
};

const protocols: Record<string, any> = {};
for (const [slug, { doublecounted, ...chains }] of Object.entries(configs)) {
  protocols[slug] = bridgeExport(chains as { [chain: string]: BridgeChainConfig }, doublecounted ? { doublecounted: true } : {});
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
