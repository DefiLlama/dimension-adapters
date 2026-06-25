import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const LABELS = {
  BorrowInterest: 'LlamaLend Borrow Interest',
  BorrowAdminFees: 'LlamaLend Borrow Admin Fees',
  AmmSwapFees: 'LlamaLend AMM Swap Fees',
  BorrowInterestToLenders: 'LlamaLend Borrow Interest To Lenders',
  AmmSwapFeesToLPs: 'LlamaLend AMM Swap Fees To LPs',
};

interface LlamaLendV2Factory {
  address: string;
  start: string;
  fromBlock: number;
}

// v2 uses LlamaLend Factory 2.0.0 — separate from v1 OneWayLendingFactory on the same chains.
// Add new chains here when v2 mainnet / other deployments go live.
const LlamaLendV2Factories: {[key: string]: LlamaLendV2Factory} = {
  [CHAIN.OPTIMISM]: {
    address: '0x5f94073e3f51c1fff92ffc6b4b06b7af193b3640',
    start: '2026-06-09',
    fromBlock: 152707737,
  },
};

const EventNewVault = 'event NewVault(uint256 indexed id, address indexed collateral_token, address indexed borrowed_token, address vault, address controller, address amm, address price_oracle, address monetary_policy)'
const EventTokenExchange = 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)'
const EventCollectFees = 'event CollectFees(uint256 amount)'

interface LlamaMarket {
  vault: string;
  controller: string;
  collateral_token: string;
  borrowed_token: string;
  amm: string;
  ammFee: number;
  ammTokens: [string, string];
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const factory = LlamaLendV2Factories[options.chain];
  const fromBlock = await options.getFromBlock();
  const vaultCreatedEvents = (await options.getLogs({
    eventAbi: EventNewVault,
    target: factory.address,
    fromBlock: factory.fromBlock,
    cacheInCloud: true,
  })).filter((event: any) => Number(event.blockNumber) <= fromBlock);
  if (vaultCreatedEvents.length === 0) {
    return {
      dailyVolume,
      dailyFees,
      dailySupplySideRevenue,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
    };
  }

  const ammFees = await options.api.multiCall({
    abi: 'uint256:fee',
    calls: vaultCreatedEvents.map((event: any) => event.amm),
  });

  const coinCalls = [];
  for (const vault of vaultCreatedEvents) {
    coinCalls.push({ target: vault.amm, params: [0] });
    coinCalls.push({ target: vault.amm, params: [1] });
  }
  const ammCoins = await options.api.multiCall({
    abi: 'function coins(uint256) view returns (address)',
    calls: coinCalls,
  });

  const markets: Array<LlamaMarket> = vaultCreatedEvents.map((event: any, index: number) => ({
    vault: event.vault,
    controller: event.controller,
    collateral_token: event.collateral_token,
    borrowed_token: event.borrowed_token,
    amm: event.amm,
    ammFee: Number(ammFees[index]) / 1e18,
    ammTokens: [ammCoins[index * 2], ammCoins[index * 2 + 1]],
  }));

  const swapEvents = await options.getLogs({
    targets: markets.map(market => market.amm),
    eventAbi: EventTokenExchange,
    flatten: false,
  });

  const collectFeesEvents = await options.getLogs({
    targets: markets.map(market => market.controller),
    eventAbi: EventCollectFees,
    flatten: false,
  });

  const vaultPricePerShareBefore = await options.fromApi.multiCall({
    abi: 'uint256:pricePerShare',
    calls: markets.map(market => market.vault),
  });
  const vaultPricePerShareAfter = await options.toApi.multiCall({
    abi: 'uint256:pricePerShare',
    calls: markets.map(market => market.vault),
  });
  const vaultTotalAssetsBefore = await options.fromApi.multiCall({
    abi: 'uint256:totalAssets',
    calls: markets.map(market => market.vault),
  });
  const vaultTotalAssetsAfter = await options.toApi.multiCall({
    abi: 'uint256:totalAssets',
    calls: markets.map(market => market.vault),
  });
  const adminFeesBefore = await options.fromApi.multiCall({
    abi: 'uint256:admin_fees',
    calls: markets.map(market => market.controller),
  });
  const adminFeesAfter = await options.toApi.multiCall({
    abi: 'uint256:admin_fees',
    calls: markets.map(market => market.controller),
  });

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];

    const pricePerShareBefore = vaultPricePerShareBefore[i];
    const pricePerShareAfter = vaultPricePerShareAfter[i];
    const totalAssetsBefore = vaultTotalAssetsBefore[i];
    const totalAssetsAfter = vaultTotalAssetsAfter[i];
    const adminFeesStartRaw = adminFeesBefore[i];
    const adminFeesEndRaw = adminFeesAfter[i];

    const assetsForInterest = Number(totalAssetsBefore) > 0 ? totalAssetsBefore : totalAssetsAfter;
    const lenderInterest = Number(assetsForInterest) > 0
      ? (Number(pricePerShareAfter) - Number(pricePerShareBefore)) * Number(assetsForInterest) / 1e18
      : 0;

    const adminFeesStart = BigInt(adminFeesStartRaw);
    const adminFeesEnd = BigInt(adminFeesEndRaw);
    const adminFeesDelta = adminFeesEnd - adminFeesStart;
    const adminFeesCollected = (collectFeesEvents[i] ?? []).reduce(
      (sum: bigint, event: any) => sum + BigInt(event.amount),
      0n,
    );
    const borrowAdminRevenue = adminFeesDelta + adminFeesCollected;

    if (borrowAdminRevenue !== 0n) {
      dailyRevenue.add(market.borrowed_token, borrowAdminRevenue, LABELS.BorrowAdminFees);
    }

    const totalBorrowInterest = lenderInterest + Number(borrowAdminRevenue);
    if (totalBorrowInterest !== 0) {
      dailyFees.add(market.borrowed_token, totalBorrowInterest, LABELS.BorrowInterest);
    }
    if (lenderInterest !== 0) {
      dailySupplySideRevenue.add(market.borrowed_token, lenderInterest, LABELS.BorrowInterestToLenders);
    }

    for (const event of swapEvents[i] ?? []) {
      const volume = Number(event.tokens_sold);
      const ammFee = volume * market.ammFee;

      dailyVolume.add(market.ammTokens[Number(event.sold_id)], volume);
      if (ammFee > 0) {
        dailyFees.add(market.ammTokens[Number(event.sold_id)], ammFee, LABELS.AmmSwapFees);
        dailySupplySideRevenue.add(market.ammTokens[Number(event.sold_id)], ammFee, LABELS.AmmSwapFeesToLPs);
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Token swap volume on LLAMMA liquidation AMMs during soft liquidations.",
  Fees: "Total borrow interest paid by borrowers plus AMM swap fees from LLAMMA liquidation AMMs.",
  Revenue: "Borrow admin fees accrued or collected by Curve DAO via per-market fee receivers.",
  SupplySideRevenue: "Borrow interest to vault depositors plus AMM swap fees to LLAMMA LPs.",
  ProtocolRevenue: "Borrow admin fees accrued or collected by Curve DAO via per-market fee receivers.",
  HoldersRevenue: "Not applicable — protocol fees route to Curve DAO fee receivers, not CRV token holders.",
  NotionalVolume: "Not applicable — lending protocol with no derivatives notional volume.",
  PremiumVolume: "Not applicable — lending protocol with no options premium volume.",
  OpenInterest: "Not applicable — lending protocol with no derivatives open interest.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.BorrowInterest]: 'Net borrow interest from vault pricePerShare accrual plus admin fee changes; can be negative when share price drops.',
    [LABELS.AmmSwapFees]: 'Swap fees from LLAMMA soft-liquidation AMMs. v2 AMMs have no admin fee split; fees go to LPs.',
  },
  Revenue: {
    [LABELS.BorrowAdminFees]: 'Admin share of borrow interest accrued in controller.admin_fees or collected via CollectFees.',
  },
  ProtocolRevenue: {
    [LABELS.BorrowAdminFees]: 'Admin share of borrow interest routed to the market fee receiver (Curve DAO by default).',
  },
  SupplySideRevenue: {
    [LABELS.BorrowInterestToLenders]: 'Net borrow interest to vault depositors (lenders); can be negative when share price drops.',
    [LABELS.AmmSwapFeesToLPs]: 'AMM swap fees distributed to LLAMMA liquidity providers.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  allowNegativeValue: true, // vault pricePerShare can decrease during market stress, producing negative lender accrual
  fetch,
  adapter: LlamaLendV2Factories,
  methodology,
  breakdownMethodology,
};

export default adapter;
