use super::*;

#[event]
pub struct InitializeFaucetClaim {
    #[index]
    pub faucet_claim_id: Pubkey,
    #[index]
    pub mint: Pubkey,
    pub total_faucet_amount: u64,
}

#[event]
pub struct WithdrawExpiredFaucetClaim {
    #[index]
    pub faucet_claim_id: Pubkey,
    #[index]
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DestroyFaucetClaim {
    #[index]
    pub faucet_claim_id: Pubkey,
}

#[event]
pub struct InitializeFaucetClaimShard {
    #[index]
    pub faucet_claim_id: Pubkey,
    pub faucet_claim_shard_id: Pubkey,
    pub merkle_root: [u8; 32],
}

#[event]
pub struct Claim {
    #[index]
    pub address: Pubkey,
    #[index]
    pub mint: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DestroyFaucetClaimShard {
    #[index]
    pub faucet_claim_id: Pubkey,
    pub faucet_claim_shard_id: Pubkey,
}
