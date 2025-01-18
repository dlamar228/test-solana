use super::*;
use crate::states::authority_manager::AuthorityManager;

pub fn initialize_authority_manager(ctx: Context<InitializeAuthorityManager>) -> Result<()> {
    let authority_manager = ctx.accounts.authority_manager.as_mut();
    authority_manager.bump = ctx.bumps.authority_manager;
    authority_manager.authority_bump = ctx.bumps.authority;
    authority_manager.set(0, ctx.accounts.payer.key());

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeAuthorityManager<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        seeds = [
            FAUCET_AUTHORITY_MANAGER_SEED.as_bytes(),
        ],
        bump,
        payer = payer,
        space = AuthorityManager::LEN
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    /// CHECK: faucet vault authority
    #[account(
        seeds = [
            FAUCET_AUTHORITY.as_bytes(),
        ],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}

pub fn remove_admin(ctx: Context<UpdateAuthorityManager>, index: u64, admin: Pubkey) -> Result<()> {
    let authority_manager = &mut ctx.accounts.authority_manager;

    if authority_manager.is_one_admin() {
        return err!(FaucetError::LastAdmin);
    }

    authority_manager.set(index as usize, admin);
    Ok(())
}

pub fn set_admin(ctx: Context<UpdateAuthorityManager>, index: u64, admin: Pubkey) -> Result<()> {
    let authority_manager = &mut ctx.accounts.authority_manager;

    if index as usize >= authority_manager.admins_len() {
        return err!(FaucetError::InvalidAdminIndex);
    }

    authority_manager.set(index as usize, admin);

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAuthorityManager<'info> {
    #[account(mut, constraint = authority_manager.is_admin(payer.key) @ FaucetError::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            FAUCET_AUTHORITY_MANAGER_SEED.as_bytes(),
        ],
        bump = authority_manager.bump,

    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
}
