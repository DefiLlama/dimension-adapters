# Adapters

Find the instructions to list, write, test and submit an adapter [here](https://docs.llama.fi/list-your-project/other-dashboards)

## Fees dimensions

| Attribute         | DEXs               | Lending                    | Chains             | NFT Marketplace     | Derivatives        | CDP | Liquid Staking             | Yield | Synthetics |
| ----------------- | ------------------ | -------------------------- | ------------------ | ------------------- | ------------------ | --- | -------------------------- | ----- | ---------- |
| userFees          | Swap fees paid by users | Interest paid by borrowers | Gas fees paid by users | Fees paid by users  | Fees paid by users | Interest paid by borrowers | =protocolRevenue | =protocolRevenue | Fees paid by users | 
| totalRevenue      | =userFees         | =userFees                 | =userFees         | =userFees          | =userFees         | =userFees | Staking rewards     | Yield | =userFees|
| =>supplySideRevenue | LPs revenue        | Interest paid to lenders   | -                  | -                   | LP revenue         | -   | Revenue earned by stETH holders | Depositor revenue | LP revenue |
| =>protocolRevenue   | % of swap fees going to protocol | % of interest going to protocol         | Burned coins (or fees-sequencerCosts for rollups)      | Marketplace revenue | Protocol's revenue | =userFees | Money going to protocol | Management + performance fees | % of fees going to protocol |
| ==>holdersRevenue   | Money going to gov token holders | *                      | Burned coins       | *                    | *                   |  *   | * | * | * |
| =>creatorRevenue    | -                   | -                           | -                   | Creator earnings    |- |-|-|-|-|
