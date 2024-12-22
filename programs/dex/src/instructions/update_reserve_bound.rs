use crate::error::ErrorCode;
use crate::states::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdateReserveBound<'info> {
    #[account(mut ,address = amm_config.protocol_owner @ ErrorCode::InvalidProtocolOwner)]
    pub creator: Signer<'info>,
    #[account(address = dex_state.load()?.amm_config)]
    pub amm_config: Box<Account<'info, AmmConfig>>,
    #[account(mut)]
    pub dex_state: AccountLoader<'info, DexState>,
}

pub fn update_reserve_bound(ctx: Context<UpdateReserveBound>, reserve_bound: u64) -> Result<()> {
    let state = &mut ctx.accounts.dex_state.load_mut()?;
    state.vault_0_reserve_bound = reserve_bound;

    Ok(())
}
