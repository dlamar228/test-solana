use anchor_lang::prelude::*;

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeDexEvent {
    #[index]
    pub config_id: Pubkey,
    #[index]
    pub dex_id: Pubkey,
    pub signer: Pubkey,
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
    pub amount_0: u64,
    pub amount_1: u64,
    pub launch_fees_0: u64,
    pub launch_fees_1: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateDexLaunchFeeRateEvent {
    #[index]
    pub dex_id: Pubkey,
    pub old: u64,
    pub new: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateDexSwapFeeRateEvent {
    #[index]
    pub dex_id: Pubkey,
    pub old: u64,
    pub new: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateDexReserveBoundEvent {
    #[index]
    pub dex_id: Pubkey,
    pub old: u64,
    pub new: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct InitializeConfigEvent {
    #[index]
    pub config_id: Pubkey,
    pub admin: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateConfigAdminEvent {
    #[index]
    pub config_id: Pubkey,
    pub old: Pubkey,
    pub new: Pubkey,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct UpdateCreateDexEvent {
    #[index]
    pub config_id: Pubkey,
    pub old: bool,
    pub new: bool,
}
