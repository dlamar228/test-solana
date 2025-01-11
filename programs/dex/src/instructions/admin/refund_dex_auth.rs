use crate::error::ErrorCode;
use crate::states::*;

use anchor_lang::{
    prelude::*,
    solana_program::{program::invoke_signed, system_instruction},
};

pub fn refund_dex_auth(ctx: Context<RefundDexAuth>) -> Result<()> {
    let dex_state = ctx.accounts.dex_state.load()?;

    // dex authority pda signer seeds
    let seeds = [AUTH_SEED.as_bytes(), &[dex_state.auth_bump]];
    let signer_seeds = &[seeds.as_slice()];

    invoke_signed(
        &system_instruction::transfer(
            &ctx.accounts.dex_authority.key(),
            ctx.accounts.admin.key,
            ctx.accounts.dex_authority.lamports(),
        ),
        &[
            ctx.accounts.dex_authority.to_account_info(),
            ctx.accounts.admin.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct RefundDexAuth<'info> {
    #[account(mut, address = config.admin @ ErrorCode::InvalidAdmin)]
    pub admin: Signer<'info>,
    /// CHECK: dex vault authority
    #[account(
        mut,
        seeds = [
            AUTH_SEED.as_bytes(),
        ],
        bump,
    )]
    pub dex_authority: UncheckedAccount<'info>,
    pub dex_state: AccountLoader<'info, DexState>,
    #[account(address = dex_state.load()?.config)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}
