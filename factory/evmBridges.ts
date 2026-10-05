import { CHAIN } from "../helpers/chains";
import { BridgeChainConfig, bridgeExport } from "../helpers/bridges";
import { celerBridge, opStackBridge, optimismTeleportrEvents } from "../helpers/bridges/config";
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
};

const protocols: Record<string, any> = {};
for (const [slug, config] of Object.entries(configs)) {
  protocols[slug] = bridgeExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
