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

    pub fn remove_admin(
        ctx: Context<UpdateAuthorityManager>,
        index: u64,
        admin: Pubkey,
    ) -> Result<()> {
        instructions::remove_admin(ctx, index, admin)
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
        epoch_claim_starts: u64,
        epoch_claim_ends: u64,
        total_faucet_amount: u64,
    ) -> Result<()> {
        instructions::initialize_faucet_claim(
            ctx,
            epoch_claim_starts,
            epoch_claim_ends,
            total_faucet_amount,
        )
    }

    pub fn initialize_faucet_claim_shard(
        ctx: Context<InitializeFaucetClaimShard>,
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_faucet_claim_shard(ctx, merkle_root)
    }

    pub fn claim(ctx: Context<Claim>, paths: Vec<[u8; 32]>, index: u16, amount: u64) -> Result<()> {
        instructions::claim(ctx, paths, index, amount)
    }
}
