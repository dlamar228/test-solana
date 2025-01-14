use anchor_lang::prelude::*;

#[account]
#[derive(Default, Debug)]
pub struct ProtocolState {
    // Protocol admin
    pub admin: Pubkey,
    /// padding for future updates
    pub padding: [u64; 31],
}

impl ProtocolState {
    pub const LEN: usize = 8 + std::mem::size_of::<ProtocolState>();
}
