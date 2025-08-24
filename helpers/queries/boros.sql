WITH parsed_data AS (
    SELECT
        data,
        VARBINARY_TO_UINT256(VARBINARY_SUBSTRING(data, 97, 32)) AS order_count
    FROM
        arbitrum.logs
    WHERE
        block_number >= {{initialBlock}}
        AND contract_address = {{address}}
        AND topic0 = {{orderPlacedTopic}}
),
expanded_data AS (
    SELECT
        sequence_number,
        VARBINARY_TO_UINT256(
            VARBINARY_SUBSTRING(
                data,
                129 + TRY_CAST((sequence_number - 1) * 32 AS BIGINT),
                32
            )
        ) AS orderIds,
        VARBINARY_TO_UINT256(
            VARBINARY_SUBSTRING(
                data,
                129 + TRY_CAST(order_count * 32 AS BIGINT) + 32 + TRY_CAST(
                    (sequence_number - 1) * 32 AS BIGINT
                ),
                32
            )
        ) / 1e18 AS sizes
    FROM
        parsed_data
        CROSS JOIN UNNEST(SEQUENCE(1, TRY_CAST(order_count AS INTEGER))) AS t(sequence_number)
),
place_order AS (
    SELECT
        orderIds,
        sizes
    FROM
        expanded_data
),
LimitOrderPartiallyFilled AS (
    SELECT
        VARBINARY_TO_UINT256(VARBINARY_SUBSTRING(data, 25, 8)) AS orderId,
        VARBINARY_TO_UINT256(VARBINARY_SUBSTRING(data, 33, 32)) / 1e18 AS filledSize,
        block_time
    FROM
        arbitrum.logs
    WHERE
        block_number >= {{initialBlock}}
        AND contract_address = {{address}}
        AND topic0 = {{partiallyFilledTopic}}
),
fills AS (
    SELECT
        orderId,
        SUM(filledSize) AS filled_total
    FROM
        LimitOrderPartiallyFilled
    GROUP BY
        1
),
place_order_left AS (
    SELECT
        p.orderIds,
        COALESCE(p.sizes - f.filled_total, p.sizes) AS left_size
    FROM
        place_order AS p
        LEFT JOIN fills AS f ON p.orderIds = f.orderId
),
parsed_data_c AS (
    SELECT
        data,
        VARBINARY_TO_UINT256(VARBINARY_SUBSTRING(data, 33, 32)) AS order_count
    FROM
        arbitrum.logs
    WHERE
        block_number >= {{initialBlock}}
        AND contract_address = {{address}}
        AND topic0 = {{orderCanceledTopic}}
),
expanded_data_c AS (
    SELECT
        sequence_number,
        VARBINARY_TO_UINT256(
            VARBINARY_SUBSTRING(
                data,
                65 + TRY_CAST((sequence_number - 1) * 32 AS BIGINT),
                32
            )
        ) AS orderIds
    FROM
        parsed_data_c
        CROSS JOIN UNNEST(SEQUENCE(1, TRY_CAST(order_count AS INTEGER))) AS t(sequence_number)
),
canceled AS (
    SELECT
        orderIds
    FROM
        expanded_data_c
)
SELECT
    (
        SELECT
            SUM(left_size)
        FROM
            place_order_left
        WHERE
            orderIds NOT IN (
                SELECT
                    orderIds
                FROM
                    canceled
            )
            AND orderIds IN ({{decimalOrderIds}})
    ) + (
        SELECT
            SUM(filledSize)
        FROM
            LimitOrderPartiallyFilled
        WHERE
            block_time >= from_unixtime({{startTimestamp}})
            AND block_time <= from_unixtime({{endTimestamp}})
    ) AS executed_order_size;