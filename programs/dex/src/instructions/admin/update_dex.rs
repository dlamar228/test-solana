use crate::curve::MAX_FEE_RATE_VALUE;
use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

pub fn update_swap_fee_rate(ctx: Context<UpdateDexState>, swap_fee_rate: u64) -> Result<()> {
    assert!(swap_fee_rate <= MAX_FEE_RATE_VALUE);
    let dex_state = &mut ctx.accounts.dex_state.load_mut()?;

    #[cfg(feature = "enable-log")]
    {
        let old = dex_state.swap_fee_rate;
        msg!("update_swap_fee_rate, old:{}, new:{}", old, swap_fee_rate,);
    }

    dex_state.swap_fee_rate = swap_fee_rate;

    Ok(())
}

pub fn update_launch_fee_rate(ctx: Context<UpdateDexState>, launch_fee_rate: u64) -> Result<()> {
    assert!(launch_fee_rate <= MAX_FEE_RATE_VALUE);
    let dex_state = &mut ctx.accounts.dex_state.load_mut()?;

    #[cfg(feature = "enable-log")]
    {
        let old = dex_state.launch_fee_rate;
        msg!(
            "update_launch_fee_rate, old:{}, new:{}",
            old,
            launch_fee_rate,
        );
    }

    dex_state.launch_fee_rate = launch_fee_rate;

    Ok(())
}

pub fn update_reserve_bound(ctx: Context<UpdateDexState>, reserve_bound: u64) -> Result<()> {
    let dex_state = &mut ctx.accounts.dex_state.load_mut()?;

    #[cfg(feature = "enable-log")]
    {
        let old = dex_state.vault_0_reserve_bound;
        msg!("update_reserve_bound, old:{}, new:{}", old, reserve_bound,);
    }

    dex_state.vault_0_reserve_bound = reserve_bound;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateDexState<'info> {
    #[account(address = config.admin @ ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub dex_state: AccountLoader<'info, DexState>,
    #[account(address = dex_state.load()?.config)]
    pub config: Account<'info, Config>,
}
