//! All fee information, to be used for validation currently

pub const FEE_RATE_DENOMINATOR_VALUE: u64 = 1_000_000;
pub const MAX_FEE_RATE_VALUE: u64 = 30_000;

pub struct Fees {}

/// Helper function for calculating swap fee
pub fn floor_div(token_amount: u128, fee_numerator: u128, fee_denominator: u128) -> Option<u128> {
    token_amount
        .checked_mul(fee_numerator)?
        .checked_div(fee_denominator)
}

impl Fees {
    /// Calculate the owner trading fee in trading tokens
    pub fn protocol_fee(amount: u128, protocol_fee_rate: u64) -> Option<u128> {
        floor_div(
            amount,
            u128::from(protocol_fee_rate),
            u128::from(FEE_RATE_DENOMINATOR_VALUE),
        )
    }

    pub fn calculate_pre_fee_amount(post_fee_amount: u128, trade_fee_rate: u64) -> Option<u128> {
        if trade_fee_rate == 0 {
            Some(post_fee_amount)
        } else {
            let numerator = post_fee_amount.checked_mul(u128::from(FEE_RATE_DENOMINATOR_VALUE))?;
            let denominator =
                u128::from(FEE_RATE_DENOMINATOR_VALUE).checked_sub(u128::from(trade_fee_rate))?;

            numerator
                .checked_add(denominator)?
                .checked_sub(1)?
                .checked_div(denominator)
        }
    }
}
