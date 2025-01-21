use anchor_lang::prelude::*;

#[account]
#[derive(Default, Debug)]
pub struct AuthorityManager {
    pub bump: u8,
    pub authority_bump: u8,
    pub admin: Pubkey,
    pub cpi_authority: Pubkey,
}

impl AuthorityManager {
    pub const LEN: usize = 8 + std::mem::size_of::<Self>();
}
