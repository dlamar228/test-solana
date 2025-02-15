use super::*;

use crate::error::ErrorCode;
use crate::states::*;

pub fn initialize_authority_manager(
    ctx: Context<InitializeAuthorityManager>,
    cpi_authority: Pubkey,
) -> Result<()> {
    require_keys_neq!(cpi_authority, Pubkey::default());

    let authority_manager_id = ctx.accounts.authority_manager.key();
    let authority_manager = &mut ctx.accounts.authority_manager;
    authority_manager.admin = ctx.accounts.payer.key();
    authority_manager.cpi_authority = cpi_authority;
    authority_manager.bump = ctx.bumps.authority_manager;
    authority_manager.authority_bump = ctx.bumps.authority;

    emit!(InitializeAuthorityManagerEvent {
        authority_manager_id,
        admin_id: ctx.accounts.payer.key(),
        cpi_authority_id: cpi_authority,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeAuthorityManager<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        seeds = [DEX_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump,
        payer = payer,
        space = AuthorityManager::LEN
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
    /// CHECK: dex vault authority
    #[account(
        seeds = [DEX_AUTHORITY_SEED.as_bytes()],
        bump,

    )]
    pub authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn update_authority_manager_admin(
    ctx: Context<UpdateAuthorityManager>,
    new_admin: Pubkey,
) -> Result<()> {
    require_keys_neq!(new_admin, Pubkey::default());

    let authority_manager = &mut ctx.accounts.authority_manager;
    let old_admin_id = authority_manager.admin;
    authority_manager.admin = new_admin;

    emit!(UpdateAuthorityManagerAdminEvent {
        old_admin_id,
        new_admin_id: new_admin,
    });

    Ok(())
}

pub fn update_authority_manager_cpi_authority(
    ctx: Context<UpdateAuthorityManager>,
    new_cpi_authority: Pubkey,
) -> Result<()> {
    require_keys_neq!(new_cpi_authority, Pubkey::default());

    let authority_manager = &mut ctx.accounts.authority_manager;
    let old_cpi_authority_id = authority_manager.cpi_authority;
    authority_manager.cpi_authority = new_cpi_authority;

    emit!(UpdateAuthorityManagerCpiAuthorityEvent {
        old_cpi_authority_id,
        new_cpi_authority_id: new_cpi_authority
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAuthorityManager<'info> {
    #[account(address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [DEX_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = authority_manager.bump
    )]
    pub authority_manager: Account<'info, AuthorityManager>,
}
