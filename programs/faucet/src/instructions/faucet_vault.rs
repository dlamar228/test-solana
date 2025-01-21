use super::*;
use crate::states::authority_manager::AuthorityManager;

use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

pub fn initialize_faucet_vault(_ctx: Context<InitializeFaucetVault>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFaucetVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [
            FAUCET_AUTHORITY_MANAGER_SEED.as_bytes(),
        ],
        bump = authority_manager.bump,
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    /// CHECK: faucet vault authority
    #[account(
        seeds = [
            FAUCET_AUTHORITY_SEED.as_bytes(),
        ],
        bump = authority_manager.authority_bump,
    )]
    pub authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = authority,
        token::token_program = token_program,
        seeds = [FAUCET_VAULT_SEED.as_bytes(), mint.key().as_ref()],
        bump,
    )]
    pub faucet_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}
