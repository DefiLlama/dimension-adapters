export type Maybe<T> = T | null;

export type Scalars = {
    ID: string;
    String: string;
    Boolean: boolean;
    Int: number;
    Float: number;
    BigDecimal: string;
    BigInt: string;
    Bytes: string;
};

export enum BetResult {
    Lost = 'Lost',
    Won = 'Won'
}

export type Bet = {
    amount: Scalars['BigDecimal'];
    odds: Scalars['BigDecimal'];
    result?: Maybe<BetResult>;
};
