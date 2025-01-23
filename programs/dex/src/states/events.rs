use anchor_lang::prelude::*;

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeAuthorityManagerEvent {
    #[index]
    pub authority_manager_id: Pubkey,
    #[index]
    pub admin_id: Pubkey,
    pub cpi_authority_id: Pubkey,
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
pub struct UpdateAuthorityManagerCpiAuthorityEvent {
    #[index]
    pub old_cpi_authority_id: Pubkey,
    #[index]
    pub new_cpi_authority_id: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeConfigEvent {
    #[index]
    pub admin_id: Pubkey,
    #[index]
    pub config_id: Pubkey,
    pub swap_fee_rate: u64,
    pub launch_fee_rate: u64,
    pub initial_reserve: u64,
    pub vault_reserve_bound: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateConfigSwapFeeRateEvent {
    #[index]
    pub admin_id: Pubkey,
    pub old_swap_fee_rate: u64,
    pub new_swap_fee_rate: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateConfigLaunchFeeRateEvent {
    #[index]
    pub admin_id: Pubkey,
    pub old_launch_fee_rate: u64,
    pub new_launch_fee_rate: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateConfigInitialReserveEvent {
    #[index]
    pub admin_id: Pubkey,
    pub old_initial_reserve: u64,
    pub new_initial_reserve: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateConfigVaultReserveBoundEvent {
    #[index]
    pub admin_id: Pubkey,
    pub old_vault_reserve_bound: u64,
    pub new_vault_reserve_bound: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeDexEvent {
    #[index]
    pub dex_id: Pubkey,
    pub payer_id: Pubkey,
    pub mint_zero: Pubkey,
    pub mint_one: Pubkey,
}

/// Emitted when swap
#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct SwapEvent {
    #[index]
    pub dex_id: Pubkey,
    /// pool vault sub trade fees
    pub input_vault_before: u64,
    /// pool vault sub trade fees
    pub output_vault_before: u64,
    /// calculate result without transfer fee
    pub input_amount: u64,
    /// calculate result without transfer fee
    pub output_amount: u64,
    pub input_transfer_fee: u64,
    pub output_transfer_fee: u64,
    pub remaining_tokens: u64,
    pub base_input: bool,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct DexIsReadyToLaunchEvent {
    #[index]
    pub dex_id: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct DexLaunchedEvent {
    #[index]
    pub dex_id: Pubkey,
    #[index]
    pub raydium_id: Pubkey,
    #[index]
    pub admin_id: Pubkey,
    pub amount_0: u64,
    pub amount_1: u64,
    pub launch_fees_0: u64,
    pub launch_fees_1: u64,
    pub transfer_fee_0: u64,
    pub transfer_fee_1: u64,
    pub lp_burned: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct WithdrawDexFeeEvent {
    #[index]
    pub admin_id: Pubkey,
    #[index]
    pub dex_id: Pubkey,
    pub token_zero_amount: u64,
    pub token_one_amount: u64,
}
