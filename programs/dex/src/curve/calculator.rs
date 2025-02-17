//! Swap calculations

use crate::curve::{constant_product::ConstantProductCurve, fees::Fees};
use anchor_lang::prelude::*;
use {crate::error::ErrorCode, std::fmt::Debug};

/// Helper function for mapping to ErrorCode::CalculationFailure
pub fn map_zero_to_none(x: u128) -> Option<u128> {
    if x == 0 {
        None
    } else {
        Some(x)
    }
}

/// The direction of a trade, since curves can be specialized to treat each
/// token differently (by adding offsets or weights)
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TradeDirection {
    /// Input token 0, output token 1
    ZeroForOne,
    /// Input token 1, output token 0
    OneForZero,
}

impl From<TradeDirection> for bool {
    fn from(val: TradeDirection) -> Self {
        match val {
            TradeDirection::ZeroForOne => false,
            TradeDirection::OneForZero => true,
        }
    }
}

/// The direction to round.  Used for pool token to trading token conversions to
/// avoid losing value on any deposit or withdrawal.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RoundDirection {
    /// Floor the value, ie. 1.9 => 1, 1.1 => 1, 1.5 => 1
    Floor,
    /// Ceiling the value, ie. 1.9 => 2, 1.1 => 2, 1.5 => 2
    Ceiling,
}

impl TradeDirection {
    /// Given a trade direction, gives the opposite direction of the trade, so
    /// A to B becomes B to A, and vice versa
    pub fn opposite(&self) -> TradeDirection {
        match self {
            TradeDirection::ZeroForOne => TradeDirection::OneForZero,
            TradeDirection::OneForZero => TradeDirection::ZeroForOne,
        }
    }
}

/// Encodes results of depositing both sides at once
#[derive(Debug, PartialEq)]
pub struct TradingTokenResult {
    /// Amount of token A
    pub token_0_amount: u128,
    /// Amount of token B
    pub token_1_amount: u128,
}

/// Encodes all results of swapping from a source token to a destination token
#[derive(Debug, PartialEq)]
pub struct SwapResult {
    /// New amount of source token
    pub new_swap_source_amount: u128,
    /// New amount of destination token
    pub new_swap_destination_amount: u128,
    /// Amount of source token swapped (includes fees)
    pub source_amount_swapped: u128,
    /// Amount of destination token swapped
    pub destination_amount_swapped: u128,
    /// Amount of source tokens going to protocol
    pub protocol_fee: u128,
    pub constant_before: u128,
    pub constant_after: u128,
}

/// Concrete struct to wrap around the trait object which performs calculation.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CurveCalculator {}

impl CurveCalculator {
    pub fn validate_supply(token_0_amount: u64, token_1_amount: u64) -> Result<()> {
        if token_0_amount == 0 || token_1_amount == 0 {
            return Err(ErrorCode::EmptySupply.into());
        }

        Ok(())
    }

    /// Subtract fees and calculate how much destination token will be provided
    /// given an amount of source token.
    pub fn swap_base_input(
        source_amount: u128,
        swap_source_amount: u128,
        swap_destination_amount: u128,
        protocol_fee_rate: u64,
    ) -> Option<SwapResult> {
        // debit the fee to calculate the amount swapped
        let protocol_fee = Fees::protocol_fee(source_amount, protocol_fee_rate)?;
        let source_amount_less_fees = source_amount.checked_sub(protocol_fee)?;

        let destination_amount_swapped = ConstantProductCurve::swap_base_input_without_fees(
            source_amount_less_fees,
            swap_source_amount,
            swap_destination_amount,
        );

        let new_swap_source_amount = swap_source_amount.checked_add(source_amount)?;
        let new_swap_destination_amount =
            swap_destination_amount.checked_sub(destination_amount_swapped)?;

        let result = SwapResult {
            new_swap_source_amount,
            new_swap_destination_amount,
            source_amount_swapped: source_amount,
            destination_amount_swapped,
            protocol_fee,
            constant_before: swap_source_amount.checked_mul(swap_destination_amount)?,
            constant_after: new_swap_source_amount
                .checked_sub(protocol_fee)?
                .checked_mul(new_swap_destination_amount)?,
        };

        Some(result)
    }

    pub fn swap_base_output(
        destination_amount: u128,
        swap_source_amount: u128,
        swap_destination_amount: u128,
        protocol_fee_rate: u64,
    ) -> Option<SwapResult> {
        let source_amount_swapped = ConstantProductCurve::swap_base_output_without_fees(
            destination_amount,
            swap_source_amount,
            swap_destination_amount,
        );

        let source_amount =
            Fees::calculate_pre_fee_amount(source_amount_swapped, protocol_fee_rate).unwrap();
        let protocol_fee = Fees::protocol_fee(source_amount, protocol_fee_rate)?;

        let new_swap_source_amount = swap_source_amount.checked_add(source_amount)?;
        let new_swap_destination_amount =
            swap_destination_amount.checked_sub(destination_amount)?;

        let result = SwapResult {
            new_swap_source_amount,
            new_swap_destination_amount,
            source_amount_swapped: source_amount,
            destination_amount_swapped: destination_amount,
            protocol_fee,
            constant_before: swap_source_amount.checked_mul(swap_destination_amount)?,
            constant_after: new_swap_source_amount
                .checked_sub(protocol_fee)?
                .checked_mul(new_swap_destination_amount)?,
        };

        Some(result)
    }
}

/// Test helpers for curves
#[cfg(test)]
pub mod test {
    use {super::*, proptest::prelude::*, spl_math::precise_number::PreciseNumber};

    /// The epsilon for most curves when performing the conversion test,
    /// comparing a one-sided deposit to a swap + deposit.
    pub const CONVERSION_BASIS_POINTS_GUARANTEE: u128 = 50;

    /// Calculates the total normalized value of the curve given the liquidity
    /// parameters.
    ///
    /// The constant product implementation for this function gives the square root
    /// of the Uniswap invariant.
    pub fn normalized_value(
        swap_token_a_amount: u128,
        swap_token_b_amount: u128,
    ) -> Option<PreciseNumber> {
        let swap_token_a_amount = PreciseNumber::new(swap_token_a_amount)?;
        let swap_token_b_amount = PreciseNumber::new(swap_token_b_amount)?;
        swap_token_a_amount
            .checked_mul(&swap_token_b_amount)?
            .sqrt()
    }

    /// Test function checking that a swap never reduces the overall value of
    /// the pool.
    ///
    /// Since curve calculations use unsigned integers, there is potential for
    /// truncation at some point, meaning a potential for value to be lost in
    /// either direction if too much is given to the swapper.
    ///
    /// This test guarantees that the relative change in value will be at most
    /// 1 normalized token, and that the value will never decrease from a trade.
    pub fn check_curve_value_from_swap(
        source_token_amount: u128,
        swap_source_amount: u128,
        swap_destination_amount: u128,
        trade_direction: TradeDirection,
    ) {
        let destination_amount_swapped = ConstantProductCurve::swap_base_input_without_fees(
            source_token_amount,
            swap_source_amount,
            swap_destination_amount,
        );

        let (swap_token_0_amount, swap_token_1_amount) = match trade_direction {
            TradeDirection::ZeroForOne => (swap_source_amount, swap_destination_amount),
            TradeDirection::OneForZero => (swap_destination_amount, swap_source_amount),
        };
        let previous_value = swap_token_0_amount
            .checked_mul(swap_token_1_amount)
            .unwrap();

        let new_swap_source_amount = swap_source_amount.checked_add(source_token_amount).unwrap();
        let new_swap_destination_amount = swap_destination_amount
            .checked_sub(destination_amount_swapped)
            .unwrap();
        let (swap_token_0_amount, swap_token_1_amount) = match trade_direction {
            TradeDirection::ZeroForOne => (new_swap_source_amount, new_swap_destination_amount),
            TradeDirection::OneForZero => (new_swap_destination_amount, new_swap_source_amount),
        };

        let new_value = swap_token_0_amount
            .checked_mul(swap_token_1_amount)
            .unwrap();
        assert!(new_value >= previous_value);
    }

    prop_compose! {
        pub fn total_and_intermediate(max_value: u64)(total in 1..max_value)
                        (intermediate in 1..total, total in Just(total))
                        -> (u64, u64) {
           (total, intermediate)
       }
    }
}
