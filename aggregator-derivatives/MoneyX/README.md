# 🧮 MoneyX — On-Chain Derivatives & Perpetual Exchange (BSC)

**MoneyX** is a decentralized derivatives platform on Binance Smart Chain, providing on-chain perpetual futures, swap markets, and yield-bearing liquidity pools backed by the MONEY and MLP tokens.

---

## 🔗 Key Information

**Website:** [https://moneyxpro.com](https://moneyxpro.com)  
**Category:** Derivatives  
**Chain:** Binance Smart Chain (BSC)  
**Explorer:** [BscScan](https://bscscan.com/address/0xeB0E5E1a8500317A1B8fDd195097D5509Ef861de)  
**Documentation:**  https://moneyx.nuclino-site.com STATS: https://stats.moneyxpro.com
**Protocol Launch:** 2025  

---

## 📊 Subgraphs
| Name | URL |
|------|-----|
| Stats | https://api.goldsky.com/.../moneyx-stats/gn |
| Trades | https://api.goldsky.com/.../moneyx-trades/v1.0.1/gn |
| Raw | https://api.goldsky.com/.../moneyx-raw/v1.0.0/gn |
| Referrals | https://api.goldsky.com/.../moneyx-referrals/v1.0.0/gn |

---

## 🧠 Methodology

- **TVL:** Derived from the on-chain `Vault` contract, which holds user-deposited liquidity across USDT, USDC, WBNB, BTCB, ETH, SOL, DOGE, and XRP.  
- **Volume:** Pulled from `moneyx-stats` subgraph aggregating swap, margin, mint, and liquidation volume.  
- **Fees:** Pulled from `FeeStat` entity on the same subgraph, reflecting protocol-level fees.  
- **Derivatives:** Trading data cross-referenced from `moneyx-trades` subgraph for position count and open interest validation.  
- **Rewards:** Distributed via MLP and MONEY trackers on-chain.  

---

## ⚙️ Core Contracts (BSC Mainnet)

### Core
- **Vault:** `0xeB0E5E1a8500317A1B8fDd195097D5509Ef861de`  
- **Router:** `0x301018DAA6788775b4A500ef3228dB14E0d6A5a7`  
- **VaultReader:** `0x3f033207dDb0eDf06A474990c1750ee7900E7776`  
- **VaultPriceFeed:** `0x31086dBa211D1e66F51701535AD4C0e0f98A3482`  

### Derivatives
- **PositionManager:** `0x62dEFAA710dcd1dA4d9231E1EED1fb16c2278CCF`  
- **OrderBook:** `0x6b448DF5a0E6BcA35e76e50D9CD53BEA3caa7efa`  
- **FastPriceFeed:** `0x1dE47321bc0e909969Dc97484FB4949fBf19068a`  

### Rewards
- **RewardRouterV2:** `0xA92eaE4AB17f9091FBf5dA7C7cbB0AEa346649C9`  
- **RewardTrackerFeeMLP:** `0x3BED1168119334d2e4d9aB0CC67dE7CCf4EFE561`  

---

## 🧩 Tokens
| Token | Symbol | Address |
|--------|---------|----------|
| MONEY | `MONEY` | `0x4fFe5ec4D8B9822e01c9E49678884bAEc17F60D9` |
| EsMONEY | `EsMONEY` | `0x4768232700c2f81721fA94822535d35c2354633B` |
| MLP | `MLP` | `0x14C7E28d4Dd0D593cB2D481a7CBaF462b18a477a` |

---

## 🧾 Integration
This adapter provides:
- ✅ TVL (Vault-based)
- ✅ Volume (moneyx-stats)
- ✅ Fees (moneyx-stats)
- ✅ Derivatives markets (moneyx-trades)
- ✅ Full subgraph transparency

---

## 📄 License
MIT © MoneyX Labs
