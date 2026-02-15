import { BaseAdapter, FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const methodology = {
  Fees: "Total borrow interest paid by borrowers plus AMM swap fees from LLAMMA liquidation AMMs.",
  Revenue: "AMM admin fees collected by Curve DAO.",
  SupplySideRevenue: "Borrow interest distributed to lenders plus AMM swap fees distributed to LPs.",
  ProtocolRevenue: "AMM admin fees collected by Curve DAO.",
};

const breakdownMethodology = {
  Fees: {
    'Borrow Interest': 'Interest paid by borrowers on their loans, accrued daily based on utilization rate',
    'AMM Swap Fees': 'Fees from token swaps in LLAMMA (Lending-Liquidating AMM Algorithm) pools used for soft liquidations',
  },
  Revenue: {
    'AMM Admin Fees': 'Admin share of AMM swap fees collected by Curve DAO',
  },
  ProtocolRevenue: {
    'AMM Admin Fees': 'Admin share of AMM swap fees collected by Curve DAO',
  },
  SupplySideRevenue: {
    'Lender & LP Revenue': 'Borrow interest paid to lenders plus AMM swap fees earned by liquidity providers (net of admin fees)',
  },
};

interface OneWayLendingFactory {
  address: string;
  start: string;
  fromBlock: number;
  blacklists?: Array<string>;
}

const OneWayLendingFactories: {[key: string]: OneWayLendingFactory} = {
  [CHAIN.ETHEREUM]: {
    address: '0xeA6876DDE9e3467564acBeE1Ed5bac88783205E0',
    start: '2024-03-14',
    fromBlock: 19422660,
    blacklists: [
      '0x01144442fba7adccb5c9dc9cf33dd009d50a9e1d',
    ],
  },
  [CHAIN.ARBITRUM]: {
    address: '0xcaEC110C784c9DF37240a8Ce096D352A75922DeA',
    start: '2024-03-24',
    fromBlock: 193652535,
  },
  [CHAIN.OPTIMISM]: {
    address: '0x5EA8f3D674C70b020586933A0a5b250734798BeF',
    start: '2024-09-10',
    fromBlock: 125072264,
  },
  [CHAIN.FRAXTAL]: {
    address: '0xf3c9bdAB17B7016fBE3B77D17b1602A7db93ac66',
    start: '2024-09-10',
    fromBlock: 9466070,
  },
  [CHAIN.SONIC]: {
    address: '0x30D1859DaD5A52aE03B6e259d1b48c4b12933993',
    start: '2025-03-03',
    fromBlock: 11208722,
  },
};

const EventNewVault = 'event NewVault(uint256 indexed id, address indexed collateral_token, address indexed borrowed_token, address vault, address controller, address amm, address price_oracle, address monetary_policy)'
const EventTokenExchange = 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)'

interface LlamaVault {
  vault: string;
  collateral_token: string;
  borrowed_token: string;
  amm: string;
  ammFee: number;
  ammAdminFee: number;
  ammTokens: Array<string>;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const vaultCreatedEvents = await options.getLogs({
    eventAbi: EventNewVault,
    target: OneWayLendingFactories[options.chain].address,
    fromBlock: OneWayLendingFactories[options.chain].fromBlock,
    cacheInCloud: true,
  });
  const ammFees = await options.api.multiCall({
    abi: 'uint256:fee',
    calls: vaultCreatedEvents.map(event => event.amm),
  })
  const ammAdminFees = await options.api.multiCall({
    abi: 'uint256:admin_fee',
    calls: vaultCreatedEvents.map(event => event.amm),
  })

  const coinCalls = [];
  for (const vault of vaultCreatedEvents) {
    coinCalls.push({ target: vault.amm, params: [0] })
    coinCalls.push({ target: vault.amm, params: [1] })
  }
  const ammCoins = await options.api.multiCall({
    abi: 'function coins(uint256) view returns (address)',
    calls: coinCalls,
  })

  const llamaVaults: Array<LlamaVault> = vaultCreatedEvents.map((event: any, index: number) => {
    return {
      vault: event.vault,
      collateral_token: event.collateral_token,
      borrowed_token: event.borrowed_token,
      amm: event.amm,
      ammFee: Number(ammFees[index]) / 1e18,
      ammAdminFee: Number(ammAdminFees[index]) / 1e18,
      ammTokens: [ammCoins[index * 2], ammCoins[index * 2 + 1]]
    }
  })

  const swapEvents = await options.getLogs({
    targets: llamaVaults.map(vault => vault.amm),
    eventAbi: EventTokenExchange,
    flatten: false,
  })

  const vaultPricePerShareBefore = await options.fromApi.multiCall({
    abi: 'uint256:pricePerShare',
    calls: llamaVaults.map(vault => vault.vault),
    permitFailure: true,
  });
  const vaultPricePerShareAfter = await options.toApi.multiCall({
    abi: 'uint256:pricePerShare',
    calls: llamaVaults.map(vault => vault.vault),
    permitFailure: true,
  });
  const vaultTotalAssets = await options.fromApi.multiCall({
    abi: 'uint256:totalAssets',
    calls: llamaVaults.map(vault => vault.vault),
    permitFailure: true,
  });

  for (let i = 0; i < llamaVaults.length; i++) {
    const llamaVault = llamaVaults[i];

    // ignore blacklist vaults
    if (OneWayLendingFactories[options.chain].blacklists?.includes(llamaVault.vault.toLowerCase())) {
      continue;
    }

    const events = swapEvents[i];

    const pricePerShareBefore = vaultPricePerShareBefore[i] ? vaultPricePerShareBefore[i] : 1e18;
    const pricePerShareAfter = vaultPricePerShareAfter[i] ? vaultPricePerShareAfter[i]  : 1e18;
    const totalAssets = vaultTotalAssets[i] ? vaultTotalAssets[i]  : 0;

    if (pricePerShareBefore && pricePerShareAfter && totalAssets) {
      const interestPaid = (Number(pricePerShareAfter) - Number(pricePerShareBefore)) * Number(totalAssets) / 1e18
      dailyFees.add(llamaVault.borrowed_token, interestPaid, 'Borrow Interest')
    }

    for (const event of events) {
      const volume = Number(event.tokens_sold)
      const ammFee = volume * llamaVault.ammFee
      const ammAdminFee = ammFee * llamaVault.ammAdminFee

      dailyVolume.add(llamaVault.ammTokens[Number(event.sold_id)], volume)
      dailyFees.add(llamaVault.ammTokens[Number(event.sold_id)], ammFee, 'AMM Swap Fees')
      dailyRevenue.add(llamaVault.ammTokens[Number(event.sold_id)], ammAdminFee, 'AMM Admin Fees')
    }
  }

  const dailySupplySideRevenue = options.createBalances();
  const tempBalance = dailyFees.clone();
  tempBalance.subtract(dailyRevenue);
  dailySupplySideRevenue.addBalances(tempBalance, 'Lender & LP Revenue');

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {},
};

for (const [chain, factory] of Object.entries(OneWayLendingFactories)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: fetch,
    start: factory.start,
  }
}

export default adapter;
