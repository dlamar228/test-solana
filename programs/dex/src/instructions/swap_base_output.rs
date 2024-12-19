use super::swap_base_input::Swap;
use crate::SwapAndLaunch;
use anchor_lang::prelude::*;

pub fn swap_base_output<'info>(
    ctx: &Context<'_, '_, '_, 'info, Swap<'info>>,
    max_amount_in: u64,
    amount_out_less_fee: u64,
) -> Result<()> {
    let mut swap_and_launch = SwapAndLaunch::from_ctx(ctx);
    let trade_direction =
        swap_and_launch.try_swap_base_output(max_amount_in, amount_out_less_fee)?;
    swap_and_launch.try_launch(trade_direction)
}
