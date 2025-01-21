use anchor_lang::solana_program::clock::SECONDS_PER_DAY;

use super::*;

#[constant]
pub const FAUCET_AUTHORITY_SEED: &str = "faucet_authority";
#[constant]
pub const FAUCET_AUTHORITY_MANAGER_SEED: &str = "faucet_authority_manager";
#[constant]
pub const FAUCET_CLAIM_SEED: &str = "faucet_claim";
#[constant]
pub const FAUCET_CLAIM_SHARD_SEED: &str = "faucet_claim_shard";
#[constant]
pub const FAUCET_VAULT_SEED: &str = "faucet_vault";

#[constant]
pub const FAUCET_CLAIM_PERIOD_IN_SECONDS: u64 = 7 * SECONDS_PER_DAY;
