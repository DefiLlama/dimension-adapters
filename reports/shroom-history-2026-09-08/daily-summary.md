# SHROOM token and Shroom treasury income

Status: Complete. UTC dates, September 2–7, 2026.

**These columns are separate scopes and must not be added together.** The earlier combined revenue table is superseded.

| Date | Token fees | Token revenue: MU dividend allocation | Treasury LP income | Treasury MU dividends received | Treasury revenue |
|---|---:|---:|---:|---:|---:|
| 2026-09-02 | $0.00 | $0.00 | $0.00 | $0.00 | $0.00 |
| 2026-09-03 | $137,606.97 | $128,073.00 | $1,404.18 | $6,502.59 | $7,906.77 |
| 2026-09-04 | $123,017.13 | $114,494.01 | $6,049.16 | $2,999.37 | $9,048.52 |
| 2026-09-05 | $142,112.48 | $132,266.35 | $55,220.26 | $5,358.87 | $60,579.12 |
| 2026-09-06 | $87,945.64 | $81,852.41 | $20,336.39 | $2,491.49 | $22,827.87 |
| 2026-09-07 | $26,799.40 | $24,942.63 | $15,930.40 | $969.54 | $16,899.94 |
| **Total** | **$517,481.62** | **$481,628.39** | **$98,940.38** | **$18,321.85** | **$117,262.23** |

Token revenue uses the agreed hook-sweep basis: MU allocated for all SHROOM holders, not necessarily paid to wallets that same hour. Token fees = token revenue + Pons supply-side share.

Treasury revenue = earned LP fees + actual MU receipts from the confirmed distributor into the two treasury wallets. No all-holder allocations or LP principal are added. Treasury fees and protocol revenue equal treasury revenue under the repository income statement convention; this does not imply the treasury charges a new user fee.

The shared distributor transfers identify the MU payer and recipient, not the underlying launch token. Treasury receipts are therefore reported as MU dividend income without claiming an on-chain SHROOM-only attribution. Never total the shared distributor for the token view.

USD amounts use unrounded hourly SDK valuations. Unpriced SHROOM LP fee amounts remain in the original raw balances and are excluded from USD totals. September 8 is incomplete and excluded.

Sources: `shroom-hourly.json` (token), `shroom-pol-hourly.json` (unchanged LP component), `treasury-dividends-hourly.json` (new MU receipts). Code provenance is in `daily-summary.json`.
