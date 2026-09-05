// Historical and minimal-V4 ABI snapshots:
// https://github.com/o1exchange/o1-launch/blob/756a75cef544369ac57f0092898a64300b168ab9/shared/historicalAbis.ts
// https://github.com/o1exchange/o1-launch/blob/756a75cef544369ac57f0092898a64300b168ab9/shared/generated.ts
export const events = {
  launch: "event Launched(address indexed token, bytes32 indexed poolId, address indexed creator, address quote, uint256 supply, int24 tickSpacing)",
  trade: "event Trade(bytes32 indexed poolId, address indexed executor, address indexed referrer, address feeCurrency, uint256 totalFee, bytes32 comment)",
  credit: "event Credited(address indexed recipient, address indexed currency, uint256 amount)",
  component: "event FeeComponentCredited(bytes32 indexed poolId, bytes32 indexed componentId, address indexed recipient, address currency, uint256 amount)",
  // Indexed flags differ despite sharing the same topic0. Never decode both layouts together.
  pool: "event PoolRegistered(bytes32 indexed poolId, address indexed creator, address treasury, uint16 baseFeeBps)",
  quote: "event QuoteRegistered(address indexed quote, uint8 decimals, int24 tick)",
  minimalQuote: "event QuoteRegistered(address indexed quote, uint8 decimals, int24 tick, uint64 revision)",
  unregister: "event QuoteUnregistered(address indexed quote)",
  minimalUnregister: "event QuoteUnregistered(address indexed quote, uint64 revision)",
  tick: "event QuoteStartTickUpdated(address indexed quote, int24 previousTick, int24 tick, uint64 revision)",
  supply: "event LaunchSupplyUpdated(uint256 previousSupply, uint256 supply)",
  launchFee: "event LaunchFeePaid(address indexed payer, address indexed currency, address indexed recipient, uint256 amount)",
  nativeLaunchFee: "event NativeLaunchFeePaid(address indexed payer, address indexed recipient, uint256 amount)",
  launchBuy: "event LaunchBuyExecuted(address indexed token, bytes32 indexed poolId, address indexed originalCreator, address fundingToken, uint256 amountIn, uint256 amountOut, address launchBuyAdapter)",
  nativeFeeConfig: "event NativeLaunchFeeUpdated(uint256 previousAmount, uint256 amount)",
  quoteFeeConfig: "event QuoteCreationFeeUpdated(address indexed quote, uint256 amount)",
};

export type EventKind = keyof typeof events;
export type Log = {
  kind: EventKind;
  address: string;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  args: Record<string, any>;
};

export const compareLogs = (a: Log, b: Log) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;
export const lower = (value: string): string => value.toLowerCase();
