use crate::errors::ErrorCode;
use crate::states::*;

use super::*;

pub fn initialize_authority_manager(
    ctx: Context<InitializeAuthorityManager>,
    faucet_authority: Pubkey,
) -> Result<()> {
    let authority_manager = &mut ctx.accounts.authority_manager;
    authority_manager.admin = ctx.accounts.payer.key();
    authority_manager.bump = ctx.bumps.authority_manager;
    authority_manager.authority_bump = ctx.bumps.authority;
    authority_manager.faucet_authority = faucet_authority;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeAuthorityManager<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        seeds = [LAUNCHER_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump,
        payer = payer,
        space = AuthorityManager::LEN
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
    /// CHECK: vault authority
    #[account(
        init,
        seeds = [LAUNCHER_AUTHORITY_SEED.as_bytes()],
        bump,
        payer = payer,
        space = 0
    )]
    pub authority: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

pub fn update_authority_manager_admin(
    ctx: Context<UpdateAuthorityManager>,
    new_admin: Pubkey,
) -> Result<()> {
    require_keys_neq!(new_admin, Pubkey::default());

    let authority_manager = &mut ctx.accounts.authority_manager;
    authority_manager.admin = new_admin;

    Ok(())
}

pub fn update_authority_manager_faucet_authority(
    ctx: Context<UpdateAuthorityManager>,
    faucet_authority: Pubkey,
) -> Result<()> {
    require_keys_neq!(faucet_authority, Pubkey::default());

    let authority_manager = &mut ctx.accounts.authority_manager;
    authority_manager.faucet_authority = faucet_authority;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAuthorityManager<'info> {
    #[account(address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [LAUNCHER_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = authority_manager.bump
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
}

#[derive(Accounts)]
pub struct TestCpi<'info> {
    #[account(mut, address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [LAUNCHER_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = authority_manager.bump
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
    /// CHECK:
    #[account(
        mut,
        seeds = [
            LAUNCHER_AUTHORITY_SEED.as_bytes(),
        ],
        bump = authority_manager.authority_bump,
    )]
    pub authority: AccountInfo<'info>,
    /// CHECK: dex vault authority
    pub dex_program: UncheckedAccount<'info>,
    /// CHECK: dex vault authority
    pub dex_authority_manager: UncheckedAccount<'info>,
}
