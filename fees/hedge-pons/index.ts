import { id, zeroPadValue } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// $HEDGE's Pons V2 launch is separate from Hedge Fun's strategy-token launchpad.
// Source: https://docs.hedgehood.app/hedge and the Pons V2 factory/curve/hook.
const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const TOKEN = "0x3f9108a3bECa998C14c6dda822a7e8EaEb88E20D";
const CURVE = "0x84EeF7357E41716180f001387505665FE251d091";
const HOOK = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044";
const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC";
const POOL_ID = "0xc5c73a17f81e15c4d9b076601476bbf751e0ab51a6eb7262da1b58e2913723be";
const LAUNCH_BLOCK = 60794876;

const CURVE_FEES_SWEPT = "event FeesSwept(uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount)";
const POOL_FEES_SWEPT = "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)";
const CURVE_FEES_RESCUED = "event FeesRescued(address indexed protocolRecipient, address indexed creatorRecipient, uint256 protocolAmount, uint256 creatorAmount)";
const POOL_FEES_RESCUED = "event PoolFeesRescued(bytes32 indexed poolId, address indexed quoteToken, uint256 protocolAmount, uint256 creatorAmount)";
const RECIPIENT_UPDATED = "event CreatorFeeRecipientUpdated(address indexed token, address indexed previousRecipient, address indexed newRecipient)";

const LABEL = {
  curveFees: "$HEDGE curve swap fees and tax",
  poolFees: "$HEDGE graduated-pool swap fees and tax",
  creatorCurve: "$HEDGE creator allocation from curve",
  creatorPool: "$HEDGE creator allocation from graduated pool",
  ponsCurve: "Pons and buyback allocation from curve",
  ponsPool: "Pons and buyback allocation from graduated pool",
};

const asBigInt = (value: unknown) => BigInt(String(value));

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // The documented launch recipient is the HedgeHood Safe. If it is changed,
  // review the effective recipient before attributing later sweeps to $HEDGE.
  const [recipientChanges, curveSweeps, poolSweeps, curveRescues, poolRescues] = await Promise.all([
    options.getLogs({
      target: FACTORY,
      eventAbi: RECIPIENT_UPDATED,
      topics: [id("CreatorFeeRecipientUpdated(address,address,address)"), zeroPadValue(TOKEN, 32)],
      fromBlock: LAUNCH_BLOCK,
      cacheInCloud: true,
    }),
    options.getLogs({ target: CURVE, eventAbi: CURVE_FEES_SWEPT }),
    options.getLogs({
      target: HOOK,
      eventAbi: POOL_FEES_SWEPT,
      topics: [id("PoolFeesSwept(bytes32,uint256,uint256,uint256,uint256)"), POOL_ID],
    }),
    options.getLogs({ target: CURVE, eventAbi: CURVE_FEES_RESCUED }),
    options.getLogs({
      target: HOOK,
      eventAbi: POOL_FEES_RESCUED,
      topics: [id("PoolFeesRescued(bytes32,address,uint256,uint256)"), POOL_ID],
    }),
  ]);

  if (recipientChanges.length)
    throw new Error("$HEDGE Pons creator recipient changed; review historical fee attribution");
  if (curveRescues.length || poolRescues.length)
    throw new Error("$HEDGE Pons fees rescued; review rescue assets and allocations before counting");

  function addSweep(log: any, feeLabel: string, creatorLabel: string, externalLabel: string) {
    const protocol = asBigInt(log.protocolAmount);
    const buyback = asBigInt(log.buybackAmount);
    const creator = asBigInt(log.creatorAmount);
    const total = protocol + buyback + creator;
    if (protocol < 0n || buyback < 0n || creator < 0n)
      throw new Error("$HEDGE Pons fee sweep has a negative allocation");
    dailyFees.add(NVDA, total, feeLabel);
    dailyUserFees.add(NVDA, total, feeLabel);
    dailyRevenue.add(NVDA, creator, creatorLabel);
    dailySupplySideRevenue.add(NVDA, protocol + buyback, externalLabel);
  }

  for (const log of curveSweeps)
    addSweep(log, LABEL.curveFees, LABEL.creatorCurve, LABEL.ponsCurve);
  for (const log of poolSweeps)
    addSweep(log, LABEL.poolFees, LABEL.creatorPool, LABEL.ponsPool);

  return { dailyFees, dailyUserFees, dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: "Quote-asset fees and creator tax settled by Pons V2 on the $HEDGE/NVDA curve and its specific graduated pool. Uses the curve and hook sweep events, like the existing Pons V2 adapter; it does not count subsequent escrow claims or Safe transfers again.",
  UserFees: "Same as Fees: these amounts originated from $HEDGE traders' swap charges.",
  Revenue: "The creatorAmount allocated to $HEDGE's fee recipient by its curve and graduated-pool sweeps. This combines the creator's share of Pons' standard fee and the creator tax; the event does not separate them. Classification of token tax as revenue is subject to DefiLlama review.",
  SupplySideRevenue: "Pons' protocol allocation and any Pons buyback allocation from the same sweeps. These are not retained by $HEDGE.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.curveFees]: "Sum of protocolAmount, buybackAmount and creatorAmount in $HEDGE curve FeesSwept events, denominated in NVDA.",
    [LABEL.poolFees]: "Sum of the same three amounts in $HEDGE pool-filtered PoolFeesSwept events, denominated in NVDA.",
  },
  UserFees: {
    [LABEL.curveFees]: "Same curve charges as Fees.",
    [LABEL.poolFees]: "Same graduated-pool charges as Fees.",
  },
  Revenue: {
    [LABEL.creatorCurve]: "The curve sweep's creatorAmount, comprising creator standard-fee share and creator tax.",
    [LABEL.creatorPool]: "The pool sweep's creatorAmount, comprising creator standard-fee share and creator tax.",
  },
  SupplySideRevenue: {
    [LABEL.ponsCurve]: "The curve sweep's protocolAmount plus buybackAmount, allocated to Pons and its buyback mechanism.",
    [LABEL.ponsPool]: "The pool sweep's protocolAmount plus buybackAmount, allocated to Pons and its buyback mechanism.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-12",
  pullHourly: true,
  doublecounted: true, // the Pons V2 adapter already counts these user-paid fees
  methodology,
  breakdownMethodology,
};

export default adapter;
