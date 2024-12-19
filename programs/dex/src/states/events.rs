use anchor_lang::prelude::*;

/// Emitted when swap
#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct SwapEvent {
    #[index]
    pub pool_id: Pubkey,
    /// pool vault sub trade fees
    pub input_vault_before: u64,
    /// pool vault sub trade fees
    pub output_vault_before: u64,
    /// cacluate result without transfer fee
    pub input_amount: u64,
    /// cacluate result without transfer fee
    pub output_amount: u64,
    pub input_transfer_fee: u64,
    pub output_transfer_fee: u64,
    pub base_input: bool,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct TokenLaunchedEvent {
    #[index]
    pub pool_id: Pubkey,
    #[index]
    pub raydium_id: Pubkey,
    pub amount_0: u64,
    pub amount_1: u64,
}

#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct RemainingTokensAvailableEvent {
    #[index]
    pub pool_id: Pubkey,
    pub remaining_tokens: u64,
}

/// Emitted when launch
#[event]
#[cfg_attr(feature = "client", derive(Debug))]
pub struct MarketCapEvent {
    #[index]
    pub pool_id: Pubkey,
    pub price_0: u64,
    pub price_1: u64,
}
