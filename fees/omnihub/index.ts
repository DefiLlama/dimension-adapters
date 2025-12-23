import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi_event = {
  deposit: "event Deposit(address indexed from, address indexed to, uint256 amount)",
  rewardsDeposit: "event RewardsDeposit(address indexed creator, uint256 creatorReward, address indexed referral, uint256 referralReward, address indexed omnihub, uint256 omnihubReward, address from)",
};

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const address = "0xaD4c0bf78Ce754D5D4D045e37783e95834b900fE";
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const depositLogs = await options.getLogs({
    target: address,
    eventAbi: abi_event.deposit,
  });

  const rewardsDepositLogs = await options.getLogs({
    target: address,
    eventAbi: abi_event.rewardsDeposit,
  });

  depositLogs.forEach((log) => {
    dailyFees.addGasToken(log.amount);
    dailyRevenue.addGasToken(log.amount);
  });

  rewardsDepositLogs.forEach((log) => {
    dailyFees.addGasToken(log.creatorReward);
    dailyFees.addGasToken(log.omnihubReward);
    dailyRevenue.addGasToken(log.omnihubReward);
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: '2025-07-01' },
    [CHAIN.STORY]: { start: '2025-09-24' },
    [CHAIN.MONAD]: { start: '2025-11-24' },
    [CHAIN.INK]: { start: '2025-07-01' },
    [CHAIN.LISK]: { start: '2025-07-01' },
    [CHAIN.OPTIMISM]: { start: '2025-07-01' },
    [CHAIN.SONEIUM]: { start: '2025-07-01' },
    [CHAIN.MORPH]: { start: '2025-07-01' },
    [CHAIN.PLUME]: { start: '2025-07-28' },
    [CHAIN.SOMNIA]: { start: '2025-09-08' },
    [CHAIN.HYPERLIQUID]: { start: '2025-07-14' },
    [CHAIN.MEZO]: { start: '2025-07-28' },
    [CHAIN.UNICHAIN]: { start: '2025-07-01' },
    [CHAIN.LINEA]: { start: '2025-07-01' },
    [CHAIN.APECHAIN]: { start: '2025-07-01' },
    [CHAIN.ARBITRUM]: { start: '2025-07-01' },
    [CHAIN.AVAX]: { start: '2025-07-01' },
    [CHAIN.HEMI]: { start: '2025-07-01' },
    [CHAIN.WC]: { start: '2025-07-01' },
    [CHAIN.BERACHAIN]: { start: '2025-07-01' },
    [CHAIN.BLAST]: { start: '2025-07-01' },
    [CHAIN.GRAVITY]: { start: '2025-07-01' },
    [CHAIN.LENS]: { start: '2025-07-01' },
    [CHAIN.MINT]: { start: '2025-07-01' },
    [CHAIN.MODE]: { start: '2025-07-01' },
    [CHAIN.POLYGON]: { start: '2025-07-01' },
    [CHAIN.SCROLL]: { start: '2025-07-01' },
    [CHAIN.SHAPE]: { start: '2025-07-01' },
    [CHAIN.TAIKO]: { start: '2025-07-01' },
    [CHAIN.ZORA]: { start: '2025-07-01' },
    [CHAIN.BOB]: { start: '2025-07-01' },
    [CHAIN.BSC]: { start: '2025-07-01' },
    [CHAIN.KATANA]: { start: '2025-07-01' },
    [CHAIN.ETHEREUM]: { start: '2025-07-01' },
    [CHAIN.MANTLE]: { start: '2025-07-01' },
    [CHAIN.RARI]: { start: '2025-07-01' },
    [CHAIN.RONIN]: { start: '2025-07-01' },
    [CHAIN.CAMP]: { start: '2025-08-27' },
    [CHAIN.BOTANIX]: { start: '2025-07-14' },
    [CHAIN.PLASMA]: { start: '2025-10-03' },
    [CHAIN.GATE_LAYER]: { start: '2025-10-03' },
    [CHAIN.KLAYTN]: { start: '2025-10-31' },
    [CHAIN.OG]: { start: '2025-09-24' },
  },
  methodology: {
    Fees: "Mint and Publish NFT fees are paid by users",
    Revenue: "platform fees charged from users",
    ProtocolRevenue: "platform fees charged from users",
  },
};

export default adapter;
