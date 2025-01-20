use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod states;
pub mod utils;

use instructions::*;

declare_id!("Bw4JFo3Ajs1b8JvTvo1ZaZqT6r3S7rpjkiRTzxMt3oty");

#[program]
pub mod faucet {

    use super::*;

    pub fn initialize_authority_manager(ctx: Context<InitializeAuthorityManager>) -> Result<()> {
        instructions::initialize_authority_manager(ctx)
    }

    pub fn remove_admin(ctx: Context<UpdateAuthorityManager>, index: u64) -> Result<()> {
        instructions::remove_admin(ctx, index)
    }

    pub fn set_admin(
        ctx: Context<UpdateAuthorityManager>,
        index: u64,
        admin: Pubkey,
    ) -> Result<()> {
        instructions::set_admin(ctx, index, admin)
    }

    pub fn initialize_faucet_claim(
        ctx: Context<InitializeFaucetClaim>,
        total_faucet_amount: u64,
    ) -> Result<()> {
        instructions::initialize_faucet_claim(ctx, total_faucet_amount)
    }

    pub fn destroy_faucet_claim(ctx: Context<DestroyFaucetClaim>) -> Result<()> {
        instructions::destroy_faucet_claim(ctx)
    }

    pub fn initialize_faucet_claim_shard(
        ctx: Context<InitializeFaucetClaimShard>,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_faucet_claim_shard(ctx, merkle_root)
    }

    pub fn destroy_faucet_claim_shard(ctx: Context<DestroyFaucetClaimShard>) -> Result<()> {
        instructions::destroy_faucet_claim_shard(ctx)
    }

    pub fn claim(
        ctx: Context<Claim>,
        proofs: Vec<[u8; 32]>,
        index: u16,
        amount: u64,
    ) -> Result<()> {
        instructions::claim(ctx, proofs, index, amount)
    }

    pub fn withdraw_expired_faucet_claim(ctx: Context<WithdrawExpiredFaucetClaim>) -> Result<()> {
        instructions::withdraw_expired_faucet_claim(ctx)
    }
}
