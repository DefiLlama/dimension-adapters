import { OpStackBridgeConfig, opStackBridgeExport } from "../helpers/opStackBridge";
import { createFactoryExports } from "./registry";

/**
 * Canonical bridges of OP-stack chains, Ethereum side. One-sided: each listing's destination chain is attributed server-side.
 * Portals are read from the bridge's messenger (L1StandardBridge.messenger().portal()). See helpers/opStackBridge.ts.
 */
const configs: Record<string, OpStackBridgeConfig> = {
  // https://docs.optimism.io/chain/addresses
  "optimism-bridge": {
    name: "OP Mainnet",
    portal: "0xbEb5Fc579115071764c7423A4f12eDde41f106Ed",
    bridge: "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1",
    start: "2021-11-12", // L1StandardBridge proxy deployed at the Optimism regenesis, 2021-11-11
    portalFrom: "2023-06-07", // first full day after the Bedrock upgrade (2023-06-06), which introduced the OptimismPortal
    escrows: [
      "0x467194771dAe2967Aef3ECbEDD3Bf9a310C76C65", // Optimism: L1 Escrow (DAI)
      "0x5Fd79D46EBA7F351fe49BFF9E87cdeA6c821eF9f", // Synthetix: L2 Deposit Escrow
      "0x76943C0D61395d8F2edF9060e1533529cAe05dE6", // Lido: Optimism L1 ERC20 Token Bridge
    ],
    // Teleportr Deposit V2, deposit-only fast bridge, inactive since 2022, kept for history
    extraEthDeposits: [{ target: "0x52ec2F3d7C5977A8E558C8D9C6000B615098E8fC", eventAbi: "event EtherReceived(uint256 indexed depositId, address indexed emitter, uint256 indexed amount)", amountArg: "amount" }],
  },
  // https://docs.base.org/base-chain/network-information/base-contracts
  "base-bridge": {
    name: "Base",
    portal: "0x49048044D57e1C92A77f79988d21Fa8fAF74E97e",
    bridge: "0x3154Cf16ccdb4C6d922629664174b904d80F2C35",
    start: "2024-03-03", // first day the old bridges server recorded Base volume
  },
  "mode-bridge": {
    name: "Mode",
    portal: "0x8B34b14c7c7123459Cf3076b8Cb929BE097d0C07",
    bridge: "0x735aDBbE72226BD52e818E7181953f42E3b0FF21",
    start: "2024-02-02", // first day the old bridges server recorded Mode volume
  },
  "mint-bridge": {
    name: "Mint",
    portal: "0x59625d1FE0Eeb8114a4d13c863978F39b3471781",
    bridge: "0x2b3F201543adF73160bA42E1a5b7750024F30420",
    start: "2024-10-11", // first day the old bridges server recorded Mint volume
  },
  "manta-pacific": {
    name: "Manta Pacific",
    portal: "0x9168765EE952de7C6f8fC6FaD5Ec209B960b7622",
    bridge: "0x3B95bC951EE0f553ba487327278cAc44f29715E5",
    start: "2023-09-15", // first day the old bridges server recorded Manta volume
  },
  "mantle-bridge": {
    name: "Mantle",
    portal: "0xc54cb22944F2bE476E02dECfCD7e3E7d3e15A8Fb",
    bridge: "0x95fC37A27a2f68e3A647CDc081F0A89bb47c3012",
    gasToken: "0x3c3a81e81dc49A522A592e7622A7E711c06bf354", // MNT, L1StandardBridge.L1_MNT_ADDRESS()
    start: "2023-07-11", // first day the old bridges server recorded Mantle volume
  },
  "worldchain-bridge": {
    name: "World Chain",
    portal: "0xd5ec14a83B7d95BE1E2Ac12523e2dEE12Cbeea6C",
    bridge: "0x470458C91978D2d929704489Ad730DC3E3001113",
    start: "2026-10-11", // first day the old bridges server recorded World Chain volume
  },
  "ink-bridge": {
    name: "Ink",
    portal: "0x5d66C1782664115999C47c9fA5cd031f495D3e4F",
    bridge: "0x88FF1e5b602916615391F55854588EFcBB7663f0",
    start: "2026-10-11", // first day the old bridges server recorded Ink volume
  },
  "lisk-bridge": {
    name: "Lisk",
    portal: "0x26dB93F8b8b4f7016240af62F7730979d353f9A7",
    bridge: "0x2658723Bf70c7667De6B25F99fcce13A16D25d08",
    start: "2026-10-11", // first day the old bridges server recorded Lisk volume
  },
  "unichain-bridge": {
    name: "Unichain",
    portal: "0x0bd48f6B86a26D3a217d0Fa6FfE2B491B956A7a2",
    bridge: "0x81014F44b0a345033bB2b3B21C7a1A308B35fEeA",
    start: "2026-10-12", // first day the old bridges server recorded Unichain volume
  },
  "soneium-bridge": {
    name: "Soneium",
    portal: "0x88e529A6ccd302c948689Cd5156C83D4614FAE92",
    bridge: "0xeb9bf100225c214Efc3E7C651ebbaDcF85177607",
    start: "2026-10-11", // first day the old bridges server recorded Soneium volume
  },
};

const protocols: Record<string, any> = {};
for (const [slug, config] of Object.entries(configs)) protocols[slug] = opStackBridgeExport(config);

export const { protocolList, getAdapter } = createFactoryExports(protocols);
