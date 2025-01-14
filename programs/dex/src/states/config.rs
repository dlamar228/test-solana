use anchor_lang::prelude::*;

/// Holds the current owner of the factory
#[account]
#[derive(Default, Debug)]
pub struct Config {
    /// Bump to identify PDA
    pub bump: u8,
    /// Status to control if new pool can be create
    pub disable_create_dex: bool,
    /// Config index
    pub index: u16,
    /// Address of the admin
    pub admin: Pubkey,
    /// padding
    pub padding: [u64; 16],
}

impl Config {
    pub const LEN: usize = 8 + std::mem::size_of::<Config>();
}
