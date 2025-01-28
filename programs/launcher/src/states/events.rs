use anchor_lang::prelude::*;

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeAuthorityManagerEvent {
    #[index]
    pub authority_manager_id: Pubkey,
    pub admin_id: Pubkey,
    pub faucet_authority_id: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateAuthorityManagerAdminEvent {
    #[index]
    pub old_admin_id: Pubkey,
    #[index]
    pub new_admin_id: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateAuthorityManagerFaucetAuthorityEvent {
    #[index]
    pub old_faucet_authority_id: Pubkey,
    #[index]
    pub new_faucet_authority_id: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct WithdrawTeamTokensEvent {
    #[index]
    pub admin_id: Pubkey,
    #[index]
    pub mint_id: Pubkey,
    pub recipient_id: Pubkey,
    pub amount: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeConfigEvent {
    #[index]
    pub config_id: Pubkey,
    #[index]
    pub admin_id: Pubkey,
    pub team_tokens: u64,
    pub faucet_tokens: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateConfigTeamTokensEvent {
    #[index]
    pub admin_id: Pubkey,
    pub old_team_tokens: u64,
    pub new_team_tokens: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateConfigFaucetTokensEvent {
    #[index]
    pub admin_id: Pubkey,
    pub old_faucet_tokens: u64,
    pub new_faucet_tokens: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeDexEvent {
    #[index]
    pub dex_id: Pubkey,
    pub payer_id: Pubkey,
    pub mint_zero_id: Pubkey,
    pub mint_one_id: Pubkey,
    pub team_tokens_amount: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeDexWithFaucetEvent {
    #[index]
    pub dex_id: Pubkey,
    pub payer_id: Pubkey,
    pub mint_zero_id: Pubkey,
    pub mint_one_id: Pubkey,
    pub team_tokens_amount: u64,
    pub faucet_tokens_amount: u64,
}
