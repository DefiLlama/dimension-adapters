import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";

export const ZERO = ADDRESSES.null;
export type Market = "Crypto" | "Stocks";
export type Suite = {
  factory: string;
  hook: string;
  escrow: string;
  firstBlock: number;
  minimal: boolean;
  route: "standard" | "rwa" | "dual";
  launchFee: "none" | "quote" | "native";
};

// Immutable deployment history, including the Base pre-atomic suite omitted by the app registry.
/**
 * Largest block span to request in one `eth_getLogs`, per chain. Providers cap this differently
 * and an over-large request is reduced by the SDK only after a failure, a path that has been
 * observed returning a truncated set without raising. Keeping every request inside the known
 * cap avoids that path entirely. Measured against production endpoints on 2026-09-23.
 */
export const DEFAULT_MAX_BLOCK_RANGE = 5000;

export const chainConfig: Record<string, { start: string; suites: Suite[]; cryptoQuotes: string[]; maxBlockRange?: number }> = {
  [CHAIN.BASE]: {
    start: "2026-07-01",
    suites: [
      { // base-mainnet-block-v1
        factory: "0xe3ab924c72463c1ac8d1d8352ee640b89eb1ea64",
        hook: "0xa068cf4c52abdd3479145c4b3cbd8e3d71542a44",
        escrow: "0xabe87e4af23dafad0a170aa900d574c03d904597",
        firstBlock: 48364845, minimal: false, route: "standard", launchFee: "none",
      },
      { // base-mainnet-timestamp-v2
        factory: "0xa52ad458ce0282a971ecc71c051a32f28946bb9f",
        hook: "0x985c14baa2a18316ffda0aefb3a632fadfca2acc",
        escrow: "0xa2cbd9065cec93c443cafb0837a62800ee7c4a84",
        firstBlock: 48451098, minimal: false, route: "standard", launchFee: "quote",
      },
      { // base-mainnet-rwa-timestamp-v3
        factory: "0x1de58a6769526a03a504d9d59b8757cd8097dc57",
        hook: "0xbca7774615c74b7991a111f1c7b2d0efea61aacc",
        escrow: "0xcf9ed8f4145eac9059bcd83227eeb8591fac0a9a",
        firstBlock: 49121014, minimal: false, route: "rwa", launchFee: "native",
      },
      { // base-mainnet-rwa-timestamp-v4
        factory: "0xff70918ef17a2d74d683a8297813b177bafad1f4",
        hook: "0x3b2b979df21036cee51b8debb13100e2cb8deacc",
        escrow: "0x1d8c991a9019df7d72adcd8dea6f12d600c9d02f",
        firstBlock: 50137081, minimal: false, route: "rwa", launchFee: "native",
      },
      { // base-mainnet-launchpad-v4-minimal
        factory: "0x1176122eb77ad6a2339322cda7c4d7ea9bfa63dc",
        hook: "0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc",
        escrow: "0xb3f11a3fb06a88059b7f7f423ec0dda506356866",
        firstBlock: 50579785, minimal: true, route: "dual", launchFee: "native",
      },
      { // base-mainnet-launchpad-v4-minimal-pre-atomic
        factory: "0xb9e5910043353717af54d8dd34b6ee57ffe49c35",
        hook: "0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc",
        escrow: "0x8790086a9b5c1b1f48309e98702d2f778f5e8f81",
        firstBlock: 50505676, minimal: true, route: "dual", launchFee: "native",
      },
    ],
    // Standard-route quotes, including the September 2026 Base crypto-major registrations.
    cryptoQuotes: [
      ZERO,
      ADDRESSES.base.USDC, // USDC
      ADDRESSES.ethereum.cbBTC, // CBBTC
      "0xcbd06e5a2b0c65597161de254aa074e489deb510", // CBDOGE
      "0xcb585250f852c6c6bf90434ab21a00f02833a4af", // CBXRP
      "0xcb17c9db87b595717c857a08468793f5bab6445f", // CBLTC
      "0xcbada732173e39521cdbe8bf59a6dc85a9fc7b8c", // CBADA
      "0xcb111e6a2a3bde90856d299d61341ac302167d23", // CBMEGA
      "0xb2000000000000000000008501b13360000cb2ec", // CBZEC
      "0xb200000000000000000000451d033a5000cb479e", // CBHYPE
    ],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-01",
    suites: [
      { // robinhood-block-v1
        factory: "0x8b40fc20c405d47d725c9723d056a1c6f62bbccf",
        hook: "0xe960e6c80c74cfdf03c91e7af4e1f5f53f096a44",
        escrow: "0xf5681c4c0dc0c2e32c9d127b3cc0fc992b584553",
        firstBlock: 2131131, minimal: false, route: "standard", launchFee: "none",
      },
      { // robinhood-block-v2
        factory: "0x76f0923ac4df0a079a10f628a7bce6426ccd344a",
        hook: "0xca4b035a5dbfa2a00fc5dcb08fd1c5a22d0eaa44",
        escrow: "0x00d5701a92794c3744428b62646e7bc4e77a0a9a",
        firstBlock: 4415287, minimal: false, route: "standard", launchFee: "none",
      },
      { // robinhood-timestamp-v3
        factory: "0x411f21283d3e492bc395027329e08f9f4f560ba5",
        hook: "0x441f773b3bb1ed4c6457d0528624112e43c02acc",
        escrow: "0x32f7a9a05bd62487d085ad494e14ec42543e19d2",
        firstBlock: 6131279, minimal: false, route: "standard", launchFee: "quote",
      },
      { // robinhood-rwa-timestamp-v4
        factory: "0xe64ac4113848bbc1a6dde1a6d1da96720a36f297",
        hook: "0x778b0c4eea7d35d66513b587ba87fc9084b0eacc",
        escrow: "0x4f2b1cda8748cd64c56039bf5e2e54bc13d4a3d7",
        firstBlock: 18487505, minimal: false, route: "rwa", launchFee: "native",
      },
      { // robinhood-mainnet-launchpad-v4-minimal
        factory: "0xce9c48cfa068947f77738c81be406b53338e5b0d",
        hook: "0x0310cfebe1d7a69f2414f6595bbe9d17c5342acc",
        escrow: "0xc5444b417a04a7e1b9c1e327c7d499803c14e5ef",
        firstBlock: 48880218, minimal: true, route: "dual", launchFee: "native",
      },
    ],
    // Robinhood Standard-route quotes.
    cryptoQuotes: [ZERO, ADDRESSES.robinhood.USDG], // ETH, USDG
  },
  [CHAIN.BSC]: {
    // Single Minimal V4 deployment serving both Standard and RWA creation routes.
    start: "2026-09-16",
    suites: [
      { // bsc-mainnet-launchpad-v4-minimal
        factory: "0xee3e862efde6dcd6df5648af0e2731b9d1df4605",
        hook: "0xf0117680ce319b8af64580002052eca29cc62acc",
        escrow: "0x1d8c991a9019df7d72adcd8dea6f12d600c9d02f",
        firstBlock: 122026636, minimal: true, route: "dual", launchFee: "native",
      },
    ],
    // Registered Standard-route quotes, confirmed against the factory's quoteConfig.
    cryptoQuotes: [
      ZERO, // Native BNB
      ADDRESSES.bsc.USDC, // USDC
    ],
  },
  [CHAIN.ARC]: {
    // Standard creation route only; the chain's gas asset is USDC, and the factory registers
    // it as an ERC20 quote rather than the zero address.
    start: "2026-09-11",
    suites: [
      { // arc-mainnet-launchpad-v4-minimal
        factory: "0xee3e862efde6dcd6df5648af0e2731b9d1df4605",
        hook: "0x20eead6db6b3d0a4491e9073119dd0ebff166acc",
        escrow: "0x1d8c991a9019df7d72adcd8dea6f12d600c9d02f",
        firstBlock: 20147782, minimal: true, route: "standard", launchFee: "native",
      },
    ],
    cryptoQuotes: [
      ADDRESSES.arc.USDC, // USDC, the chain's gas asset
      ADDRESSES.arc.cirBTC, // cirBTC
    ],
  },
  [CHAIN.XLAYER]: {
    start: "2026-09-17",
    suites: [
      { // xlayer-mainnet-launchpad-v4-minimal
        factory: "0x17d9218f0ad1baa187cdfa50677ff3196bbf9c36",
        hook: "0x5cd79b9c231cca5d26f2494d3466cb7495df2acc",
        escrow: "0x30f53e4fd6581fced90a910159fb075dd502636b",
        firstBlock: 70827259, minimal: true, route: "dual", launchFee: "native",
      },
    ],
    // X Layer carries several USDC deployments; only this one is registered by the factory,
    // so it is pinned here rather than taken from the shared asset list.
    cryptoQuotes: [
      ZERO, // Native OKB
      "0xb6ceceab302e2e4948951ee7843fc24e92933061", // USDC
      "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", // xETH
    ],
  },
  [CHAIN.MONAD]: {
    // This endpoint family rejects spans above 1,000 blocks with HTTP 413, even when the
    // request carries a topic filter, so Monad needs a smaller span than the other chains.
    maxBlockRange: 1000,
    // Two retained deployments: the managed-standard suite from August 7, 2026 (UTC) and the
    // Minimal V4 suite from September 5, 2026 (UTC). Both are covered by the o1 Dune package.
    // Addresses and earliest deployment blocks (including constructor configuration events).
    start: "2026-08-07",
    suites: [
      { // monad-mainnet-timestamp-v1; version managed-standard-v3, retired for creation but
        // still holding historical pools. Its factory family is RWA while its only supported
        // creation route is Standard, so swap fees stay Crypto and launch fees are native.
        factory: "0x54668d06c538c44fa08558283497a1b6685af596",
        hook: "0xf281561d2f667f9277d3b4d8553effee81206acc",
        escrow: "0xd1f7fac02b2a6af030cf7e9b23b7e9b7ffe31595",
        firstBlock: 94019515, minimal: false, route: "standard", launchFee: "native",
      },
      { // monad-mainnet-launchpad-v4-minimal; Standard crypto route only.
        factory: "0x99c09a90feed8d5e57a19a8c1f103ae29ba5b5b7",
        hook: "0x8aea397f75d046feaf43d2897548f3a18fd92acc",
        escrow: "0x27bc99240f2c3895cb91663932d97a29ddd99a93",
        firstBlock: 102181199, minimal: true, route: "standard", launchFee: "native",
      },
    ],
    // Registered Standard-route quotes; WMON is routing infrastructure, not a launch quote.
    cryptoQuotes: [
      ZERO, // Native MON
      ADDRESSES.monad.USDC, // USDC
      ADDRESSES.monad.WETH, // WETH
    ],
  },
};
