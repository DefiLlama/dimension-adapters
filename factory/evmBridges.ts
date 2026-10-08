import { CHAIN } from "../helpers/chains";
import { BridgeChainConfig, bridgeExport } from "../helpers/bridges";
import {
  agglayerBridge, allbridgeClassicBridge, aoriBridge, assetChainBridge, cctpBridge, celerBridge, connextBridge, coreBitcoinBridge,
  crossCurveBridge, crowdSwapBridge, eclipseBridge, flyoverBridge, fuseBridge, gnosisBridgeEthereum, gnosisBridgeGnosis,
  helixboxBridge, oftEvents, opStackBridge, optimismTeleportrEvents, polygonPosBridge, rhinoBridge, shimmerBridge,
  symbiosisBridge, synapseBridge, thresholdTbtcBridge, universalXBridge, xswapBridge,
} from "../helpers/bridges/config";
import { createFactoryExports } from "./registry";

/**
 * Registry of bridges that are pure configuration: deposit/withdrawal events read with getLogs and/or
 * ERC20 transfers in and out of escrow wallets. Event definitions live in `helpers/bridges/config.ts`;
 * this file holds addresses, chains and start dates only. One-sided bridges list only the chain they
 * emit on; the destination leg is attributed server-side from the bridge's declared destination chain.
 */
const configs: Record<string, { [chain: string]: BridgeChainConfig }> = {
  // one-sided: only Ethereum is observed, the Optimism leg is attributed server-side (destinationChain: optimism)
  "optimism-bridge": {
    [CHAIN.ETHEREUM]: opStackBridge({
      gateway: "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1",
      start: "2021-11-12", // L1StandardBridge proxy deployed at the Optimism regenesis, 2021-11-11
      extraEvents: optimismTeleportrEvents,
      escrows: [
        "0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65", // Optimism: L1 Escrow (DAI)
        "0x5Fd79D46EBA7F351fe49BFF9E87cdeA6c821eF9f", // Synthetix: L2 Deposit Escrow
        "0x76943C0D61395d8F2edF9060e1533529cAe05dE6", // Lido: Optimism L1 ERC20 Token Bridge
      ],
    }),
  },
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
    // tron (portal 0xd83b5752b42856a08087748de6095af0be52d299, $574M lifetime): not an EVM getLogs chain here, needs its own source
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
  // one-sided: only Ethereum is observed, the L2 leg is attributed server-side (destinationChain: mode / mint)
  "mode-bridge": {
    [CHAIN.ETHEREUM]: opStackBridge({ gateway: "0x735aDBbE72226BD52e818E7181953f42E3b0FF21", start: "2024-02-02" }),
  },
  "mint-bridge": {
    [CHAIN.ETHEREUM]: opStackBridge({ gateway: "0x2b3F201543adF73160bA42E1a5b7750024F30420", start: "2024-10-11" }),
  },
  // one-sided (destinationChain: manta). The L1StandardBridge escrows ERC20s itself, so its events already cover them
  "manta-pacific": {
    [CHAIN.ETHEREUM]: opStackBridge({ gateway: "0x3B95bC951EE0f553ba487327278cAc44f29715E5", start: "2023-09-15" }),
  },
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
  // one-sided (destinationChain: bitcoin)
  "powpeg-fast-mode": {
    [CHAIN.ROOTSTOCK]: flyoverBridge("2024-12-26"),
  },
  // Citrea token bridges (USDC.e, USDT.e, WBTC.e); Ethereum side are OFT adapters locking the canonical token
  "citrea-token-bridges": {
    [CHAIN.ETHEREUM]: {
      start: "2026-05-16",
      events: [
        ...oftEvents("0xdaa289CC487Cf95Ba99Db62f791c7E2d2a4b868E", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), // USDC
        ...oftEvents("0x6925ccD29e3993c82a574CED4372d8737C6dbba6", "0xdAC17F958D2ee523a2206206994597C13D831ec7"), // USDT
        ...oftEvents("0x2c01390E10e44C968B73A7BcFF7E4b4F50ba76Ed", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"), // WBTC
      ],
    },
    [CHAIN.CITREA]: {
      start: "2026-05-16",
      events: [
        ...oftEvents("0x41710804caB0974638E1504DB723D7bddec22e30", "0xE045e6c36cF77FAA2CfB54466D71A3aEF7bbE839"), // USDC.e
        ...oftEvents("0xF8b5983BFa11dc763184c96065D508AE1502C030", "0x9f3096Bac87e7F03DC09b0B416eB0DF837304dc4"), // USDT.e
        ...oftEvents("0xDF240DC08B0FdaD1d93b74d5048871232f6BEA3d", "0xDF240DC08B0FdaD1d93b74d5048871232f6BEA3d"), // WBTC.e, the OFT is the token
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
    [CHAIN.ETHEREUM]: { start: "2023-10-30", transfers: { wallets: ["0xe396757ec7e6ac7c8e5abe7285dde47b98f22db8", "0x112334f50cb6efcff4e35ae51a022dbe41a48135"] } },
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
};

const protocols: Record<string, any> = {};
for (const [slug, config] of Object.entries(configs)) {
  protocols[slug] = bridgeExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
