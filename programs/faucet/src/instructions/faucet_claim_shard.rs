use super::*;
use crate::states::*;

use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

pub fn initialize_faucet_claim_shard(
    ctx: Context<InitializeFaucetClaimShard>,
    merkle_root: [u8; 32],
) -> Result<()> {
    if ctx.accounts.faucet_claim.shards == u16::MAX {
        return err!(FaucetError::ShardLimit);
    }

    let faucet_claim_shard_id = ctx.accounts.faucet_claim_shard.key();
    let faucet_claim_shard = &mut ctx.accounts.faucet_claim_shard.load_init()?;
    faucet_claim_shard.index = ctx.accounts.faucet_claim.shards;
    faucet_claim_shard.faucet_claim = ctx.accounts.faucet_claim.key();
    faucet_claim_shard.merkle_root = merkle_root;
    faucet_claim_shard.bump = ctx.bumps.faucet_claim_shard;

    let faucet_claim = &mut ctx.accounts.faucet_claim;
    faucet_claim.shards += 1;

    emit!(InitializeFaucetClaimShardEvent {
        faucet_claim_id: ctx.accounts.faucet_claim.key(),
        faucet_claim_shard_id,
        merkle_root
    });

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFaucetClaimShard<'info> {
    #[account(mut, constraint = authority_manager.is_admin(admin.key) @ FaucetError::InvalidAdmin)]
    pub admin: Signer<'info>,
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
        payer = admin,
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

pub fn claim(ctx: Context<Claim>, proofs: Vec<[u8; 32]>, index: u16, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64;

    if !ctx.accounts.faucet_claim.is_started(now) || ctx.accounts.faucet_claim.is_finished(now) {
        return err!(FaucetError::InvalidFaucetClaimTime);
    }

    let shard_id = ctx.accounts.faucet_claim_shard.key();
    let faucet_claim_shard = &mut ctx.accounts.faucet_claim_shard.load_mut()?;

    if faucet_claim_shard.claims.check(index) {
        return err!(FaucetError::TokensAlreadyClaimed);
    }

    let leaf = generate_leaf(&shard_id, ctx.accounts.payer.key, index, amount);
    if !merkle_proof_verify(faucet_claim_shard.merkle_root, proofs, leaf) {
        return err!(FaucetError::InvalidProof);
    }

    faucet_claim_shard.claims.enable(index);
    ctx.accounts.faucet_claim.total_claimed_amount += amount;

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

    emit!(ClaimEvent {
        faucet_claim_id: ctx.accounts.faucet_claim.key(),
        faucet_claim_shard_id: ctx.accounts.faucet_claim_shard.key(),
        address_id: ctx.accounts.payer_vault.key(),
        amount,
    });

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

pub fn destroy_faucet_claim_shard(ctx: Context<DestroyFaucetClaimShard>) -> Result<()> {
    emit!(DestroyFaucetClaimShardEvent {
        faucet_claim_id: ctx.accounts.faucet_claim.key(),
        faucet_claim_shard_id: ctx.accounts.faucet_claim_shard.key(),
    });
    Ok(())
}

#[derive(Accounts)]
pub struct DestroyFaucetClaimShard<'info> {
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
        seeds = [
            FAUCET_CLAIM_SHARD_SEED.as_bytes(), faucet_claim.key().as_ref(), &faucet_claim_shard.load()?.index.to_be_bytes(),
        ],
        bump = faucet_claim_shard.load()?.bump,

    )]
    pub faucet_claim_shard: AccountLoader<'info, FaucetClaimShard>,
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
