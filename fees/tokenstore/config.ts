type AccountModifierRecord = {
    user: string,
    takerFeeDiscount: number,
    feeRebate: number,
    fromBlock: number,
}

type DefaultModifierRecord = {
    fromBlock: number,
    takerFeeDiscount: number,
    feeRebate: number,
}

// Certain accounts were granted special fee modifiers
// Account modifiers contract: 0x6927d2026BefAAd51eB6Cf48A0C612453F46eC09  
const accountModifiers: AccountModifierRecord[] = [
    {
        user: "0xb0C8851D241285F78a8ca7f97bb09252d2387552",
        takerFeeDiscount: 50,
        feeRebate: 50,
        fromBlock: 4646689,
    },
    {
        user: "0xF10488e5C0214001ccF5479AB62F437006d49d00",
        takerFeeDiscount: 100,
        feeRebate: 100,
        fromBlock: 4667712,
    },
    {
        user: "0x67422ED6742cEEE17dB28ef0E3230261c1D1f47c",
        takerFeeDiscount: 100,
        feeRebate: 100,
        fromBlock: 4667722,
    },
    {
        user: "0x139F74f0d8A5ca94c269D5c3E3c453D3385ceA49",
        takerFeeDiscount: 100,
        feeRebate: 100,
        fromBlock: 4667739,
    },
    {
        user: "0x3b19F71B8cA2eac636e0EaFE264A865Bd5467DF6",
        takerFeeDiscount: 100,
        feeRebate: 100,
        fromBlock: 4722361,
    },
    {
        user: "0x0C35303Acf2c11316F4664dADda30Fe0fa682768",
        takerFeeDiscount: 100,
        feeRebate: 100,
        fromBlock: 4722361,
    },
]

// Default fee modifiers were applied to all users
const defaultModifiers: DefaultModifierRecord[] = [
    {
        fromBlock: 4257315,
        takerFeeDiscount: 100,
        feeRebate: 0,
    },
    {
        fromBlock: 4328554,
        takerFeeDiscount: 0,
        feeRebate: 100,
    },
    {
        fromBlock: 4479823,
        takerFeeDiscount: 0,
        feeRebate: 0,
    },
    {
        fromBlock: 5339045,
        takerFeeDiscount: 90,
        feeRebate: 0,
    },
    {
        fromBlock: 5534354,
        takerFeeDiscount: 0,
        feeRebate: 0,
    },
]

export { accountModifiers, defaultModifiers };