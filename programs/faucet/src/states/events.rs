use super::*;

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeAuthorityManagerEvent {
    #[index]
    pub authority_manager_id: Pubkey,
    #[index]
    pub admin_id: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct RemoveAuthorityManagerAdminEvent {
    #[index]
    pub admin_id: Pubkey,
    pub removed_admin_id: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct SetAuthorityManagerAdminEvent {
    #[index]
    pub admin_id: Pubkey,
    pub set_admin_id: Pubkey,
}

#[event]
pub struct InitializeFaucetClaimEvent {
    #[index]
    pub faucet_claim_id: Pubkey,
    #[index]
    pub mint_id: Pubkey,
    pub total_faucet_amount: u64,
}

#[event]
pub struct WithdrawExpiredFaucetClaimEvent {
    #[index]
    pub faucet_claim_id: Pubkey,
    #[index]
    pub mint_id: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DestroyFaucetClaimEvent {
    #[index]
    pub admin_id: Pubkey,
    #[index]
    pub faucet_claim_id: Pubkey,
}

#[event]
pub struct InitializeFaucetClaimShardEvent {
    #[index]
    pub admin_id: Pubkey,
    #[index]
    pub faucet_claim_id: Pubkey,
    pub faucet_claim_shard_id: Pubkey,
    pub merkle_root: [u8; 32],
}

#[event]
pub struct ClaimEvent {
    #[index]
    pub address_id: Pubkey,
    #[index]
    pub mint_id: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DestroyFaucetClaimShardEvent {
    #[index]
    pub admin_id: Pubkey,
    #[index]
    pub faucet_claim_id: Pubkey,
    pub faucet_claim_shard_id: Pubkey,
}
