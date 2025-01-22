use super::*;

use crate::states::*;
use crate::{errors::ErrorCode, utils::TokenUtils};

use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

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

pub fn withdraw_team_tokens(ctx: Context<WithdrawTeamTokens>) -> Result<()> {
    let seeds = [
        LAUNCHER_AUTHORITY_SEED.as_bytes(),
        &[ctx.accounts.authority_manager.authority_bump],
    ];
    let signer_seeds = &[seeds.as_slice()];

    let token_utils = TokenUtils {
        mint: ctx.accounts.mint.to_account_info(),
        decimals: ctx.accounts.mint.decimals,
        token_program: ctx.accounts.token_program.to_account_info(),
    };

    token_utils.transfer_signer(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.team_vault.to_account_info(),
        ctx.accounts.recipient.to_account_info(),
        ctx.accounts.team_vault.amount,
        signer_seeds,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawTeamTokens<'info> {
    #[account(address = authority_manager.admin @ ErrorCode::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            LAUNCHER_AUTHORITY_SEED.as_bytes()
        ],
        bump = authority_manager.authority_bump
    )]
    pub authority: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [LAUNCHER_AUTHORITY_MANAGER_SEED.as_bytes()],
        bump = authority_manager.bump
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = authority,
        token::token_program = token_program,
        seeds = [LAUNCHER_TEAM_VAULT_SEED.as_bytes(), mint.key().as_ref()],
        bump,

    )]
    pub team_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        token::mint = mint,
        token::token_program = token_program,
    )]
    pub recipient: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}
