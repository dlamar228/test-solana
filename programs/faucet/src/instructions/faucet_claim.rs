use super::*;
use crate::states::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

pub fn initialize_faucet_claim(ctx: Context<InitializeFaucetClaim>) -> Result<()> {
    let faucet_amount = ctx.accounts.faucet_vault.amount;
    if faucet_amount == 0 {
        return err!(FaucetError::InvalidTokenAmount);
    }

    let claim_starts = Clock::get()?.unix_timestamp as u64;
    let claim_ends = claim_starts + FAUCET_CLAIM_PERIOD_IN_SECONDS;

    let faucet_claim_id = ctx.accounts.faucet_claim.key();
    let faucet_claim = &mut ctx.accounts.faucet_claim;
    faucet_claim.mint = ctx.accounts.mint.key();
    faucet_claim.claim_starts = claim_starts;
    faucet_claim.claim_ends = claim_ends;
    faucet_claim.total_faucet_amount = faucet_amount;
    faucet_claim.total_claimed_amount = 0;
    faucet_claim.shards = 0;
    faucet_claim.bump = ctx.bumps.faucet_claim;

    emit!(InitializeFaucetClaimEvent {
        faucet_claim_id,
        mint_id: ctx.accounts.mint.key(),
        total_faucet_amount: faucet_amount,
        starts: claim_starts,
        ends: claim_ends,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFaucetClaim<'info> {
    #[account(mut, constraint = authority_manager.is_admin(admin.key) @ FaucetError::InvalidAdmin)]
    pub admin: Signer<'info>,
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
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
        token::mint = mint,
        token::authority = authority,
        token::token_program = token_program,
        seeds = [FAUCET_VAULT_SEED.as_bytes(), mint.key().as_ref()],
        bump,
    )]
    pub faucet_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        seeds = [
            FAUCET_CLAIM_SEED.as_bytes(), mint.key().as_ref(),
        ],
        bump,
        payer = admin,
        space = FaucetClaim::LEN
    )]
    pub faucet_claim: Box<Account<'info, FaucetClaim>>,
    /// Spl token program or token program 2022
    pub token_program: Interface<'info, TokenInterface>,
    /// Program to create an ATA for receiving position NFT
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}

pub fn withdraw_expired_faucet_claim(ctx: Context<WithdrawExpiredFaucetClaim>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    if !ctx.accounts.faucet_claim.is_finished(now) {
        return err!(FaucetError::FaucetNotFinished);
    }

    let amount = ctx.accounts.faucet_vault.amount;
    if amount == 0 {
        return err!(FaucetError::InvalidWithdrawTokenAmount);
    }

    let token_utils = TokenUtils {
        token_program: ctx.accounts.token_program.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        decimals: ctx.accounts.mint.decimals,
    };

    let seeds = [
        FAUCET_AUTHORITY_SEED.as_bytes(),
        &[ctx.accounts.authority_manager.authority_bump],
    ];
    let signer_seeds = &[seeds.as_slice()];

    token_utils.transfer_signer(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.faucet_vault.to_account_info(),
        ctx.accounts.payer_vault.to_account_info(),
        amount,
        signer_seeds,
    )?;

    emit!(WithdrawExpiredFaucetClaimEvent {
        faucet_claim_id: ctx.accounts.faucet_claim.key(),
        amount,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawExpiredFaucetClaim<'info> {
    #[account(mut, constraint = authority_manager.is_admin(payer.key) @ FaucetError::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program,
    )]
    pub payer_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        seeds = [
            FAUCET_CLAIM_SEED.as_bytes(), mint.key().as_ref(),
        ],
        bump = faucet_claim.bump,
    )]
    pub faucet_claim: Box<Account<'info, FaucetClaim>>,
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
        mut,
        token::mint = mint,
        token::authority = authority,
    )]
    pub faucet_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn destroy_faucet_claim(ctx: Context<DestroyFaucetClaim>) -> Result<()> {
    emit!(DestroyFaucetClaimEvent {
        faucet_claim_id: ctx.accounts.faucet_claim.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct DestroyFaucetClaim<'info> {
    #[account(mut, constraint = authority_manager.is_admin(payer.key) @ FaucetError::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [
            FAUCET_CLAIM_SEED.as_bytes(), faucet_claim.mint.as_ref(),
        ],
        bump = faucet_claim.bump,
    )]
    pub faucet_claim: Box<Account<'info, FaucetClaim>>,
    #[account(
        mut,
        constraint = faucet_claim.is_finished(Clock::get()?.unix_timestamp as u64) @ FaucetError::FaucetNotFinished,
        close = payer,
        seeds = [
            FAUCET_AUTHORITY_MANAGER_SEED.as_bytes(),
        ],
        bump = authority_manager.bump,

    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
}
