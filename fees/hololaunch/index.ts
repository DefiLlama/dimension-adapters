import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// HoloLaunch factory, deploys one BondingCurveERC20 per launched token
// https://robinhoodchain.blockscout.com/address/0x5c8884546837066e3F3B573D3cb8B5C9eFbd7C77
const HOLOLAUNCH_FACTORY = "0x5c8884546837066e3F3B573D3cb8B5C9eFbd7C77";
// Uniswap V3 NonfungiblePositionManager on Robinhood Chain (graduated liquidity lives here)
const POSITION_MANAGER = "0x73991a25c818bf1f1128deaab1492d45638de0d3";
// WETH9 on Robinhood Chain, pair token of every graduated pool
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
// Factory deployment block (2026-07-14)
const START_BLOCK = 9292614;

// Fee constants from BondingCurveERC20.sol:
// - every bonding-curve buy/sell pays a 1% fee in native ETH
//   (buy:  fee = amountIn * 1 / 100, sell: fee = outBaseToken * 1 / 100)
// - the fee is split instantly: 70% to the protocol fee collector, 30% to the token creator
//   (payable(feeCollector).transfer((fee * 7) / 10); payable(creator).transfer(fee - (fee * 7) / 10))
const PROTOCOL_SHARE = 0.7;
const CREATOR_SHARE = 0.3;

const eventTokenDeployed =
  "event TokenDeployed(address indexed tokenAddr, uint256 indexed tokenId, address indexed creator)";
// emitted on every bonding-curve trade. For regular buys amountIn is gross (fee = amountIn / 100).
// For the creator's initial buy (same tx as TokenDeployed) amountIn is net of the 1% fee,
// and for sells amountOut is net of the 1% fee (fee = net / 99 in both cases).
const eventReserveUpdated =
  "event ReserveUpdated(bool isBuy, uint256 amountIn, uint256 amountOut, uint256 baseTokenReserves, uint256 tokenReserves)";
// emitted when a graduated token's liquidity is moved into the locked full-range Uniswap V3 position
const eventTransferLiquidityToDex =
  "event TransferLiquidityToDEX(uint256 positionTokenId)";
// Uniswap V3 position manager fee collection (the protocol claims LP fees of locked positions)
const eventCollect =
  "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)";

const LAUNCH_FEE_LABEL = "Token Launch Fees";
const LP_FEE_LABEL = "LP Fees of Graduated Tokens";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // all bonding curves deployed since launch (each curve contract is also the token itself)
  const allDeploys = await options.getLogs({
    target: HOLOLAUNCH_FACTORY,
    eventAbi: eventTokenDeployed,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
    onlyArgs: false,
  });
  const curves: string[] = allDeploys.map((log: any) => log.args.tokenAddr);

  if (!curves.length)
    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  // each launched token pays a flat one-time fee (0.001 ETH, HoloLaunch.getLaunchFee())
  // that goes 100% to the protocol. It is charged at deploy when the creator makes an
  // initial purchase (which emits ReserveUpdated from the constructor), otherwise it is
  // deducted from the token's first buy - in both cases the fee is paid in the same tx
  // as the curve's first-ever ReserveUpdated event, so we count a launch fee for every
  // curve whose first trade falls inside the window.
  const allTrades = await options.getLogs({
    targets: curves,
    eventAbi: eventReserveUpdated,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
    flatten: false,
    onlyArgs: false,
  });
  const [windowFromBlock, windowToBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const launchFeesPaid = allTrades.filter((logs: any[]) => {
    if (!logs?.length) return false;
    const firstBlock = Math.min(...logs.map((log: any) => Number(log.blockNumber)));
    return firstBlock >= windowFromBlock && firstBlock < windowToBlock;
  }).length;
  const launchFee = await options.api.call({ target: HOLOLAUNCH_FACTORY, abi: "uint256:getLaunchFee" });
  dailyFees.addGasToken(Number(launchFee) * launchFeesPaid, LAUNCH_FEE_LABEL);
  dailyRevenue.addGasToken(Number(launchFee) * launchFeesPaid, LAUNCH_FEE_LABEL);

  // the creator's initial buy is emitted from the token constructor, i.e. in the
  // same tx as TokenDeployed, and logs the net (post-fee) amount
  const deployTxs = new Set(allDeploys.map((log: any) => log.transactionHash));

  const trades = allTrades
    .flat()
    .filter((log: any) => Number(log.blockNumber) >= windowFromBlock && Number(log.blockNumber) < windowToBlock);
  for (const log of trades) {
    let fee: number;
    if (log.args.isBuy) {
      fee = deployTxs.has(log.transactionHash)
        ? Number(log.args.amountIn) / 99 // initial buy: amountIn is net of the 1% fee
        : Number(log.args.amountIn) / 100; // regular buy: amountIn is gross
    } else {
      fee = Number(log.args.amountOut) / 99; // sell: amountOut is net of the 1% fee
    }
    dailyFees.addGasToken(fee, METRIC.SWAP_FEES);
    dailyRevenue.addGasToken(fee * PROTOCOL_SHARE, METRIC.SWAP_FEES);
    dailySupplySideRevenue.addGasToken(fee * CREATOR_SHARE, METRIC.SWAP_FEES);
  }

  // post-graduation: the LP NFT of every graduated token sits locked in the
  // LiquidityManager and the protocol periodically claims its Uniswap V3 LP fees
  const gradLogs = await options.getLogs({
    targets: curves,
    eventAbi: eventTransferLiquidityToDex,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
    flatten: false,
    onlyArgs: false,
  });
  const positionToken: Record<string, string> = {};
  gradLogs.forEach((logs: any[], i: number) => {
    for (const log of logs ?? []) positionToken[log.args.positionTokenId.toString()] = curves[i];
  });

  if (Object.keys(positionToken).length) {
    const collects = await options.getLogs({
      target: POSITION_MANAGER,
      eventAbi: eventCollect,
    });
    for (const log of collects) {
      const token = positionToken[log.tokenId.toString()];
      if (!token) continue;
      // pool tokens are sorted by address, pair is always token/WETH
      const [token0, token1] =
        token.toLowerCase() < WETH.toLowerCase() ? [token, WETH] : [WETH, token];
      dailyFees.add(token0, log.amount0, LP_FEE_LABEL);
      dailyFees.add(token1, log.amount1, LP_FEE_LABEL);
      dailyRevenue.add(token0, log.amount0, LP_FEE_LABEL);
      dailyRevenue.add(token1, log.amount1, LP_FEE_LABEL);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Users pay a 1% fee in ETH on every bonding-curve buy and sell, plus a one-time 0.001 ETH launch fee per token. After a token graduates (6.9 ETH raised) its liquidity is locked in a full-range Uniswap V3 position whose LP fees accrue to the protocol.",
  Revenue: "70% of bonding-curve trading fees, all launch fees, and the claimed LP fees of graduated tokens' locked liquidity positions.",
  ProtocolRevenue: "Same as Revenue: all revenue goes to the protocol treasury.",
  SupplySideRevenue: "30% of bonding-curve trading fees, paid instantly to token creators.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% fee in ETH on every bonding-curve buy and sell.",
    [LAUNCH_FEE_LABEL]: "One-time 0.001 ETH fee per launched token.",
    [LP_FEE_LABEL]: "Uniswap V3 LP fees claimed on graduated tokens' locked liquidity (these swaps also appear under Uniswap).",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "70% of the 1% bonding-curve trading fee, sent to the protocol fee collector.",
    [LAUNCH_FEE_LABEL]: "Launch fees go 100% to the protocol fee collector.",
    [LP_FEE_LABEL]: "LP fees of locked graduated liquidity are claimable only by the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "30% of the 1% bonding-curve trading fee, sent instantly to the token creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-14",
  methodology,
  breakdownMethodology,
};

export default adapter;
