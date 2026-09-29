import { CHAIN } from "./chains";

// Peddles (https://peddles.xyz): a launchpad whose every launch is one locked Uniswap v4 position,
// paired against ETH or a tokenised stock, with PeddlesFeeHook on the pool.
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
  launchFeeCollectors: string[]; // the four contracts that take the launch fee
  feeForwarder: string; // PeddlesFeeForwarder: the Terminal's and the trade bot's fee, taken with the swap
};

export const PEDDLES: Record<string, PeddlesDeployment> = {
  [CHAIN.BASE]: {
    start: "2026-09-27",
    fromBlock: 51855962,
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    feeHook: "0xAB8E39207718f519865D6f0d52eFB31b231D40cc",
    launchFeeCollectors: [
      "0x680805FBd0D6225d0bE4E12A2B73b2Ed83a31978", // PeddlesStockLaunchpad
      "0x7e7E62B41E447B6526E89D0AAAd7Cac9FB9f1978", // PeddlesLaunchOrchestratorV20
      "0xd111413B91b0E31865464658071099779e2C1978", // PeddlesNFTFactory
      "0xB7bB0f25B1AE59adcAa2787C68cd50296d2B1978", // PeddlesNFTBondingGraduationOrchestratorV20
    ],
    feeForwarder: "0x77886951f19458B2FC27D4373553001A620264D3",
  },
  // Robinhood Chain: not deployed yet. It is added here, with its own addresses, once it is live.
};

// The registry of Peddles pools: one event per launch, carrying the pool id and both legs.
export const POOL_REGISTERED =
  "event PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed quote, address creator, uint16 creatorTaxBps, uint16 excessToCreatorBps, address rewards)";

export type PeddlesPool = { quote: string; quoteIsCurrency0: boolean };
