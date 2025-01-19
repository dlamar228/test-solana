use super::*;
use crate::states::{
    authority_manager::AuthorityManager,
    faucet_claim::{FaucetClaim, FaucetClaimShard},
    generate_leaf, merkle_proof_verify,
};

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

pub fn initialize_faucet_claim(
    ctx: Context<InitializeFaucetClaim>,
    total_faucet_amount: u64,
) -> Result<()> {
    if total_faucet_amount == 0 || ctx.accounts.payer_vault.amount < total_faucet_amount {
        return err!(FaucetError::InvalidTokenAmount);
    }

    let token_utils = TokenUtils {
        token_program: ctx.accounts.token_program.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        decimals: ctx.accounts.mint.decimals,
    };

    token_utils.transfer(
        ctx.accounts.payer.to_account_info(),
        ctx.accounts.payer_vault.to_account_info(),
        ctx.accounts.faucet_vault.to_account_info(),
        total_faucet_amount,
    )?;

    let claim_starts = Clock::get()?.unix_timestamp as u64;
    let claim_ends = claim_starts + FAUCET_CLAIM_PERIOD_IN_SECONDS;

    let faucet_claim = &mut ctx.accounts.faucet_claim;
    faucet_claim.mint = ctx.accounts.mint.key();
    faucet_claim.claim_starts = claim_starts;
    faucet_claim.claim_ends = claim_ends;
    faucet_claim.total_faucet_amount = total_faucet_amount;
    faucet_claim.total_claimed_amount = 0;
    faucet_claim.shards = 0;
    faucet_claim.bump = ctx.bumps.faucet_claim;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFaucetClaim<'info> {
    #[account(mut, constraint = authority_manager.is_admin(payer.key) @ FaucetError::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
    )]
    pub payer_vault: Box<InterfaceAccount<'info, TokenAccount>>,
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
            FAUCET_AUTHORITY.as_bytes(),
        ],
        bump,
    )]
    pub authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = payer,
        token::mint = mint,
        token::authority = authority,
        token::token_program = token_program,
        seeds = [FAUCET_VAULT.as_bytes(), faucet_claim.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub faucet_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        seeds = [
            FAUCET_CLAIM_SEED.as_bytes(), mint.key().as_ref(),
        ],
        bump,
        payer = payer,
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

pub fn initialize_faucet_claim_shard(
    ctx: Context<InitializeFaucetClaimShard>,
    merkle_root: [u8; 32],
) -> Result<()> {
    if ctx.accounts.faucet_claim.shards == u16::MAX {
        return err!(FaucetError::ShardLimit);
    }

    let faucet_claim_shard = &mut ctx.accounts.faucet_claim_shard.load_init()?;
    faucet_claim_shard.index = ctx.accounts.faucet_claim.shards;
    faucet_claim_shard.faucet_claim = ctx.accounts.faucet_claim.key();
    faucet_claim_shard.merkle_root = merkle_root;
    faucet_claim_shard.bump = ctx.bumps.faucet_claim_shard;

    let faucet_claim = &mut ctx.accounts.faucet_claim;
    faucet_claim.shards += 1;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFaucetClaimShard<'info> {
    #[account(mut, constraint = authority_manager.is_admin(payer.key) @ FaucetError::InvalidAdmin)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [
            FAUCET_AUTHORITY_MANAGER_SEED.as_bytes(),
        ],
        bump = authority_manager.bump,
    )]
    pub authority_manager: Box<Account<'info, AuthorityManager>>,
    #[account(
        seeds = [
            FAUCET_CLAIM_SEED.as_bytes(), mint.key().as_ref(),
        ],
        bump = faucet_claim.bump,
    )]
    pub faucet_claim: Box<Account<'info, FaucetClaim>>,
    #[account(
        init,
        seeds = [
            FAUCET_CLAIM_SHARD_SEED.as_bytes(), faucet_claim.key().as_ref(), &faucet_claim.shards.to_be_bytes(),
        ],
        bump,
        payer = payer,
        space = FaucetClaimShard::LEN,
    )]
    pub faucet_claim_shard: AccountLoader<'info, FaucetClaimShard>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    /// To create a new program account
    pub system_program: Program<'info, System>,
    /// Sysvar for program account
    pub rent: Sysvar<'info, Rent>,
}

pub fn claim(ctx: Context<Claim>, paths: Vec<[u8; 32]>, index: u16, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    if !ctx.accounts.faucet_claim.is_started(now) || ctx.accounts.faucet_claim.is_finished(now) {
        return err!(FaucetError::InvalidClaimTime);
    }

    let faucet_claim_shard = &mut ctx.accounts.faucet_claim_shard.load_mut()?;

    if faucet_claim_shard.bitmap.check(index) {
        return err!(FaucetError::TokensAlreadyClaimed);
    }

    let leaf = generate_leaf(ctx.accounts.payer.key, amount);
    if !merkle_proof_verify(faucet_claim_shard.merkle_root, paths, leaf) {
        return err!(FaucetError::InvalidProof);
    }

    faucet_claim_shard.bitmap.enable(index);
    ctx.accounts.faucet_claim.total_claimed_amount += amount;

    let token_utils = TokenUtils {
        token_program: ctx.accounts.token_program.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        decimals: ctx.accounts.mint.decimals,
    };
    let seeds = [
        FAUCET_AUTHORITY.as_bytes(),
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

    Ok(())
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = payer,
        token::token_program = token_program, 
    )]
    pub payer_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [
            FAUCET_CLAIM_SEED.as_bytes(), mint.key().as_ref(),
        ],
        bump = faucet_claim.bump,
    )]
    pub faucet_claim: Box<Account<'info, FaucetClaim>>,
    #[account(
        mut,
        seeds = [
            FAUCET_CLAIM_SHARD_SEED.as_bytes(), faucet_claim.key().as_ref(), &faucet_claim_shard.load()?.index.to_be_bytes(),
        ],
        bump = faucet_claim_shard.load()?.bump,

    )]
    pub faucet_claim_shard: AccountLoader<'info, FaucetClaimShard>,
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
            FAUCET_AUTHORITY.as_bytes(),
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

pub fn withdraw_expired_faucet_claim(ctx: Context<WithdrawExpiredFaucetClaim>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    if !ctx.accounts.faucet_claim.is_finished(now) {
        return err!(FaucetError::InvalidClaimTime);
    }

    if ctx.accounts.faucet_vault.amount == 0 {
        return err!(FaucetError::InvalidWithdrawTokenAmount);
    }

    let token_utils = TokenUtils {
        token_program: ctx.accounts.token_program.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        decimals: ctx.accounts.mint.decimals,
    };

    let seeds = [
        FAUCET_AUTHORITY.as_bytes(),
        &[ctx.accounts.authority_manager.authority_bump],
    ];
    let signer_seeds = &[seeds.as_slice()];

    token_utils.transfer_signer(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.faucet_vault.to_account_info(),
        ctx.accounts.payer_vault.to_account_info(),
        ctx.accounts.faucet_vault.amount,
        signer_seeds,
    )?;

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
        mut,
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
            FAUCET_AUTHORITY.as_bytes(),
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
