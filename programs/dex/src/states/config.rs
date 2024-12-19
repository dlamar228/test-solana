use anchor_lang::prelude::*;

pub const AMM_CONFIG_SEED: &str = "amm_config";

/// Holds the current owner of the factory
#[account]
#[derive(Default, Debug)]
pub struct AmmConfig {
    /// Bump to identify PDA
    pub bump: u8,
    /// Status to control if new pool can be create
    pub disable_create_pool: bool,
    /// Config index
    pub index: u16,
    /// The protocol fee
    pub protocol_fee_rate: u64,
    /// The launch fee
    pub launch_fee_rate: u64,
    /// Address of the protocol
    pub protocol_owner: Pubkey,
    /// padding
    pub padding: [u64; 16],
}

impl AmmConfig {
    pub const LEN: usize = 8 + std::mem::size_of::<AmmConfig>();
}
