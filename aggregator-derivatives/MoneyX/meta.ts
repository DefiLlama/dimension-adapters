export default {
  name: "MoneyX",
  chain: "Binance Smart Chain",
  category: "derivatives",
  website: "https://moneyxpro.com",
  source: "Vault + Multi-Subgraph (stats, trades, raw)",
  methodology: {
    TVL: "TVL is fetched directly from the on-chain Vault (0xeB0E5E1a8500317A1B8fDd195097D5509Ef861de), aggregating liquidity across USDT, USDC, WBNB, BTCB, ETH, SOL, DOGE, and XRP.",
    Volume: "Derived from the moneyx-stats subgraph, which tracks on-chain swap, margin, mint, burn, and liquidation activity.",
    Fees: "Protocol fees are collected from the FeeStat entity within the subgraph, reflecting vault-level fee accruals per market.",
    Rewards: "Staking and fee rewards are handled via multiple RewardTracker contracts (MLP and MONEY pools) and verified distributor contracts.",
    Derivatives: "MoneyX supports leveraged long/short positions and synthetic trading across multiple assets on BSC.",
  },
  subgraphs: {
    stats: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/project_clhjdosm96z2v4/moneyx-stats/gn",
    trades: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/moneyx-trades/v1.0.1/gn",
    raw: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/moneyx-raw/v1.0.0/gn",
    referrals: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/moneyx-referrals/v1.0.0/gn"
  },
  contracts: {
    core: {
      Vault: "0xeB0E5E1a8500317A1B8fDd195097D5509Ef861de",
      VaultReader: "0x3f033207dDb0eDf06A474990c1750ee7900E7776",
      VaultUtils: "0xd5AEE715c59E8e62a9d7e49d8bA68B8A52C09CE4",
      VaultPriceFeed: "0x31086dBa211D1e66F51701535AD4C0e0f98A3482",
      Router: "0x301018DAA6788775b4A500ef3228dB14E0d6A5a7",
      USDG: "0x4925C7e05347d90A3c7e07f8D8b3A52FaAC91bCb",
    },
    tokens: {
      MONEY: "0x4fFe5ec4D8B9822e01c9E49678884bAEc17F60D9",
      EsMONEY: "0x4768232700c2f81721fA94822535d35c2354633B",
      BonusMONEY: "0x59B2f533928222feFf104f2FD1a1d0CE652C1718",
      MLP: "0x14C7E28d4Dd0D593cB2D481a7CBaF462b18a477a",
    },
    rewards: {
      RewardRouterV2: "0xA92eaE4AB17f9091FBf5dA7C7cbB0AEa346649C9",
      RewardReader: "0xa8433BC9DcB49875d218A15eF1d6AAC4D0076C8A",
      RewardTrackerStakedMONEY: "0xEB445ac93eDc6F91E69CA35674CEbE9CC96CFEaB",
      RewardTrackerFeeMLP: "0x3BED1168119334d2e4d9aB0CC67dE7CCf4EFE561",
      RewardTrackerFeeStakedMLP: "0x98bBB86BE5716159aCbEE84B0B38Eb0F246dC8fC",
    },
    derivatives: {
      PositionManager: "0x62dEFAA710dcd1dA4d9231E1EED1fb16c2278CCF",
      PositionRouter: "0x065F9746b33F303c6481549BAc42A3885903fA44",
      OrderBook: "0x6b448DF5a0E6BcA35e76e50D9CD53BEA3caa7efa",
      ShortsTracker: "0x8881eBb9a995CfFcD196eFd55bbF0AA8c1C5E392",
      FastPriceFeed: "0x1dE47321bc0e909969Dc97484FB4949fBf19068a",
      FastPriceEvents: "0x0598df389335045300f13A2332B8120455E1a600"
    },
  },
};
