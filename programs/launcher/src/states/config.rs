use anchor_lang::prelude::*;

#[account]
#[derive(Default, Debug)]
pub struct ConfigState {
    pub bump: u8,
    pub team_tokens: u64,
    pub faucet_tokens: u64,
}

impl ConfigState {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();
}
