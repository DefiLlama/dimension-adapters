# Testing THORCHAIN Fee Adapter

This guide explains how to test the THORCHAIN fee adapter to fetch daily chain fees and revenue.

## Overview

The THORCHAIN fee adapter (`fees/thorchain.ts`) uses the Blockscout explorer API to fetch chain fees from runescan.io and converts them to USD using CoinGecko RUNE token prices.

## Quick Start

### Option 1: Using the Custom Test Script

Run the custom test script:

```bash
# Test for today (default)
npx ts-node test-thorchain-fees.ts

# Test for a specific date
npx ts-node test-thorchain-fees.ts "2024-01-15"

# Test for a specific timestamp
npx ts-node test-thorchain-fees.ts 1705276800
```

### Option 2: Using the Standard CLI Test Tool

Use the existing test adapter CLI:

```bash
# Test for today
npm test fees thorchain.ts

# Test for a specific date
npm test fees thorchain.ts "2024-01-15"
```

Or directly with ts-node:

```bash
npx ts-node cli/testAdapter.ts fees thorchain.ts
npx ts-node cli/testAdapter.ts fees thorchain.ts "2024-01-15"
```

## Understanding the Results

For chain fee adapters like THORCHAIN:

- **Daily Fees**: Total gas fees paid by users on the chain (in USD)
  - This represents the chain's revenue from transaction fees
  - For THORCHAIN, fees are paid in RUNE tokens and converted to USD

- **Daily Revenue**: Typically not returned separately for chain adapters
  - Chain fees (dailyFees) represent the chain's revenue

## How It Works

1. The adapter fetches fee data from the Blockscout API at `https://runescan.io/api?module=stats&action=totalfees`
2. It gets the RUNE token price from CoinGecko
3. It calculates the USD value of fees for the specified date
4. Returns the daily fees in USD

## Example Output

```
🦙 Testing THORCHAIN Fee Adapter 🦙
=====================================
Test Date: Mon, 15 Jan 2024 00:00:00 GMT
Timestamp: 1705276800
=====================================

📊 Results:
=====================================
Chain: thorchain
Timestamp: 1705276800
Date: Mon, 15 Jan 2024 00:00:00 GMT

💰 Daily Fees: $12,345.67

=====================================
✅ Test completed successfully!
```

## Troubleshooting

### Error: "Error fetching fees"

- Check if the Blockscout API is accessible
- Verify the date is valid (not in the future)
- Check network connection

### Error: "No blockscout config for chain"

- Ensure the chain is properly configured in `helpers/blockscoutFees.ts`

### Missing or Zero Fees

- The date might be before the chain started
- No transactions occurred on that day
- API might not have data for that date

## Environment Variables

If you have a CoinGecko API key, you can set it to avoid rate limits:

```bash
export CG_KEY=your_coingecko_api_key
```

## Files

- **Adapter**: `fees/thorchain.ts`
- **Helper**: `helpers/blockscoutFees.ts`
- **Test Script**: `test-thorchain-fees.ts`
- **Standard Test CLI**: `cli/testAdapter.ts`

## Notes

- The adapter uses version 1 adapter format
- Fees are converted from RUNE to USD using CoinGecko prices
- Historical data availability depends on the Blockscout explorer

