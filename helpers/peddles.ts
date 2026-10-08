import ADDRESSES from "./coreAssets.json";
import { CHAIN } from "./chains";

// Peddles (https://peddles.xyz): a launchpad whose every launch is one locked Uniswap v4 position,
// paired against ETH, BNB, USDC or a tokenised stock, with PeddlesFeeHook on the pool.
//
// Shared by fees/peddles.ts and dexs/peddles.ts so the two cannot drift apart. Addresses are
// per chain and never portable: each contract is CREATE2-deployed against constructor arguments
// that differ per chain. Source: contracts/deployments/<chainId>.json in the Peddles repo, and
// every address below was read back from the chain before it was written here.

export type PeddlesDeployment = {
  start: string; // the day the fee hook was created
  fromBlock: number; // the block the fee hook was created in: the pool registry is read from here
  poolManager: string; // Uniswap v4 PoolManager, the one address here that is not a Peddles contract
  feeHook: string; // PeddlesFeeHook: charges every swap and registers every launch pool
  launchFeeCollectors: string[]; // every contract that takes the launch fee, retired generations included
  feeForwarder: string; // PeddlesFeeForwarder: the Terminal's and the trade bot's fee, taken with the swap
  // Where the chain's native currency is not priced as a gas token: the ERC-20 that represents it and the
  // factor between the native amount and that token's units. Arc's gas is USDC (18 decimals natively, 6 as ERC-20).
  nativeAs?: { token: string; divisor: bigint };
};

export const PEDDLES: Record<string, PeddlesDeployment> = {
  [CHAIN.BASE]: {
    start: "2026-09-27",
    fromBlock: 51855962,
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    feeHook: "0xAB8E39207718f519865D6f0d52eFB31b231D40cc",
    launchFeeCollectors: [
      "0x680805FBd0D6225d0bE4E12A2B73b2Ed83a31978", // PeddlesStockLaunchpad
      "0xB2f25Fd1b20269CD1553d63A942935Ab09F91978", // PeddlesLaunchOrchestratorV20 (creator-bound, current since block 52060578)
      "0x7e7E62B41E447B6526E89D0AAAd7Cac9FB9f1978", // PeddlesLaunchOrchestratorV20 (first generation)
      "0xd111413B91b0E31865464658071099779e2C1978", // PeddlesNFTFactory
      "0xB7bB0f25B1AE59adcAa2787C68cd50296d2B1978", // PeddlesNFTBondingGraduationOrchestratorV20
    ],
    feeForwarder: "0x77886951f19458B2FC27D4373553001A620264D3",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-09-29",
    fromBlock: 76092920,
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    feeHook: "0xfe055282E3cD471A8b2cd922d31E75ECd3bBc0CC",
    launchFeeCollectors: [
      "0x4b7Aa977eA4B95D9859D73e6bc922ecF2F881978", // PeddlesStockLaunchpad
      "0x81213e2cE27f03714143152aE5cf5c94094f1978", // PeddlesLaunchOrchestratorV20
      "0x2e0029BeDCBb2f211Fd17EeBA8f40657cF6A1978", // PeddlesNFTFactory
      "0x6C5032DeDCc78b92b370C86a2aA0EA3AD0D71978", // PeddlesNFTBondingGraduationOrchestratorV20
    ],
    feeForwarder: "0xc572A003d0Ab529da670a42177Fc583b03D5b026",
  },
  [CHAIN.BSC]: {
    start: "2026-10-01",
    fromBlock: 125076797,
    poolManager: "0x28e2Ea090877bF75740558f6BFB36A5ffeE9e9dF",
    feeHook: "0x39D760601731025e0F02A3e5D232445797fAC0CC",
    launchFeeCollectors: [
      "0xB2dea73eC6673d13e020E1e4eA966321790e1978", // PeddlesStockLaunchpad
      "0x87f4c95773eA0bD5dddF948e4F4Ef55a09791978", // PeddlesLaunchOrchestratorV20 (creator-bound, current)
      "0xa20C6ae36a5C5068E9290048f2D2B165ac5C1978", // PeddlesLaunchOrchestratorV20 (first generation)
      "0x533cBF74c6f2F0A96900F61A95E13D3c63d21978", // PeddlesNFTFactory
      "0x6e3F734BAA78205f91404178AB5Cb0C04aB61978", // PeddlesNFTBondingGraduationOrchestratorV20
    ],
    feeForwarder: "0x97b0d349FFE2eD262654C60dCC04d9622970Ae4F",
  },
  [CHAIN.ARC]: {
    start: "2026-10-01",
    fromBlock: 23687888,
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    feeHook: "0x317e34De0298F23bd41bf9A853289e227E9cC0CC",
    launchFeeCollectors: [
      "0x6B176b9FDB11ffDc35dDdC0839EB62D537Ee1978", // PeddlesStockLaunchpad
      "0xe7666f1D0d7b9026CaCAe4a267c14CD490c01978", // PeddlesLaunchOrchestratorV20 (creator-bound, current)
      "0x5762d02f271891d18a4f6AF48787Ed97904e1978", // PeddlesLaunchOrchestratorV20 (first generation)
      "0x4f5199cA08864A85da6AB483Da93b8e40E501978", // PeddlesNFTFactory
      "0x586afEdc7721076BD854c1eF560f90AE48Aa1978", // PeddlesNFTBondingGraduationOrchestratorV20
    ],
    feeForwarder: "0xfe9563B7952fEB2091816133a22A4D62171fD77e",
    nativeAs: { token: ADDRESSES.arc.USDC, divisor: 10n ** 12n },
  },
};

// The registry of Peddles pools: one event per launch, carrying the pool id and both legs.
export const POOL_REGISTERED =
  "event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed quote, address creator, uint16 creatorTaxBps, uint16 excessToCreatorBps, address rewards)";

export type PeddlesPool = { quote: string; quoteIsCurrency0: boolean };
