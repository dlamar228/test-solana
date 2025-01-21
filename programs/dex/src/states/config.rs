use anchor_lang::prelude::*;

#[account]
#[derive(Default, Debug)]
pub struct ConfigState {
    pub bump: u8,
    pub swap_fee_rate: u64,
    pub launch_fee_rate: u64,
    pub initial_reserve: u64,
    pub vault_reserve_bound: u64,
}

impl ConfigState {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();
}
