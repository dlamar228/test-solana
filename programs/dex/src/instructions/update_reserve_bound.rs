use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateReserveBound<'info> {
    /// Address paying to create the pool
    #[account(mut ,address = amm_config.protocol_owner @ ErrorCode::InvalidProtocolOwner)]
    pub creator: Signer<'info>,

    /// The factory state to read protocol fees
    #[account(address = pool_state.load()?.amm_config)]
    pub amm_config: Box<Account<'info, AmmConfig>>,

    /// The program account of the pool in which the swap will be performed
    #[account(mut)]
    pub pool_state: AccountLoader<'info, PoolState>,

    /// To create a new program account
    pub system_program: Program<'info, System>,
}

pub fn update_reserve_bound(ctx: Context<UpdateReserveBound>, reserve_bound: u64) -> Result<()> {
    let state = &mut ctx.accounts.pool_state.load_mut()?;
    state.vault_0_reserve_bound = reserve_bound;

    Ok(())
}
